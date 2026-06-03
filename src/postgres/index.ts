import { randomBytes } from "node:crypto"
import { dirname, join } from "node:path"
import { from } from "@atlas/db"
import { config } from "../config/index.ts"
import { db } from "../db/index.ts"
import { ensureNetwork, execIn } from "../docker/index.ts"
import { exec, execCapture } from "../exec/index.ts"
import { type Database, databases, type Project } from "../schema/index.ts"

const secretFile = join(dirname(config.databasePath), "postgres.secret")

// Load or generate the managed instance's superuser password (persisted).
const superPassword = async (): Promise<string> => {
  const existing = await Bun.file(secretFile)
    .text()
    .catch(() => "")
  if (existing.trim()) return existing.trim()
  const pw = randomBytes(24).toString("hex")
  await Bun.write(secretFile, pw)
  return pw
}

const containerExists = async (): Promise<boolean> =>
  (await exec(["docker", "inspect", config.pgContainer])).code === 0

const containerRunning = async (): Promise<boolean> => {
  const r = await exec(["docker", "inspect", "-f", "{{.State.Running}}", config.pgContainer])
  return r.code === 0 && r.output.trim() === "true"
}

// Idempotently bring up the shared Postgres container (network + volume + wait-ready).
export const ensurePostgres = async (): Promise<void> => {
  await ensureNetwork(config.pgNetwork)
  const pw = await superPassword()

  if (!(await containerExists())) {
    const cmd = [
      "docker",
      "run",
      "-d",
      "--name",
      config.pgContainer,
      "--restart",
      "unless-stopped",
      "--network",
      config.pgNetwork,
    ]
    if (config.pgHostPort > 0) cmd.push("-p", `127.0.0.1:${config.pgHostPort}:5432`)
    cmd.push(
      "-e",
      `POSTGRES_PASSWORD=${pw}`,
      "-v",
      `${config.pgVolume}:/var/lib/postgresql/data`,
      "--label",
      "io.kettle.managed=postgres",
      config.pgImage,
    )
    await execCapture(cmd)
  } else if (!(await containerRunning())) {
    await exec(["docker", "start", config.pgContainer])
  }

  for (let i = 0; i < 30; i++) {
    const r = await exec(["docker", "exec", config.pgContainer, "pg_isready", "-U", "postgres"])
    if (r.code === 0) {
      await harden()
      return
    }
    await Bun.sleep(1000)
  }
  throw new Error("managed postgres did not become ready")
}

// Stop app roles from connecting to the shared maintenance databases. Each app
// role can then only reach its own database. Idempotent.
const harden = async (): Promise<void> => {
  await psql("REVOKE CONNECT ON DATABASE postgres FROM PUBLIC").catch(() => {})
  await psql("REVOKE CONNECT ON DATABASE template1 FROM PUBLIC").catch(() => {})
}

const psql = (sql: string) =>
  execIn(
    config.pgContainer,
    ["psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres", "-c", sql],
    {
      PGPASSWORD: "", // psql inside the container trusts the local socket as the postgres superuser
    },
  )

const psqlScalar = async (sql: string): Promise<string> =>
  (
    await execIn(config.pgContainer, ["psql", "-U", "postgres", "-d", "postgres", "-tAc", sql])
  ).trim()

// Postgres identifiers: project slugs may contain "-"; normalize to safe names.
const identFor = (project: Project): { dbName: string; dbUser: string } => {
  const base = `app_${project.name.replace(/[^a-z0-9]+/g, "_")}`.slice(0, 50)
  return { dbName: base, dbUser: base }
}

export const databaseFor = (projectId: number): Promise<Database | null> =>
  db.one<Database>(from(databases).where((q) => q("projectId").equals(projectId)))

// Internal connection string apps use over the shared docker network.
export const databaseUrl = (d: Database): string =>
  `postgres://${d.dbUser}:${d.dbPassword}@${config.pgContainer}:5432/${d.dbName}`

// Provision a dedicated database + login role for a project. Idempotent.
export const attachDatabase = async (project: Project): Promise<Database> => {
  const existing = await databaseFor(project.id)
  if (existing) return existing

  await ensurePostgres()
  const { dbName, dbUser } = identFor(project)
  const password = randomBytes(18).toString("hex")

  await psql(
    `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='${dbUser}') ` +
      `THEN CREATE ROLE "${dbUser}" WITH LOGIN PASSWORD '${password}' CONNECTION LIMIT 20; ` +
      `ELSE ALTER ROLE "${dbUser}" WITH LOGIN PASSWORD '${password}'; END IF; END $$;`,
  )
  const dbExists = await psqlScalar(`SELECT 1 FROM pg_database WHERE datname='${dbName}'`)
  if (dbExists !== "1") await psql(`CREATE DATABASE "${dbName}" OWNER "${dbUser}"`)
  await psql(`REVOKE CONNECT ON DATABASE "${dbName}" FROM PUBLIC`)
  await psql(`GRANT ALL PRIVILEGES ON DATABASE "${dbName}" TO "${dbUser}"`)

  const rows = await db.execute(
    from(databases)
      .insert({ projectId: project.id, engine: "postgres", dbName, dbUser, dbPassword: password })
      .returning("id", "projectId", "engine", "dbName", "dbUser", "dbPassword"),
  )
  return rows[0] as Database
}

// Drop a project's database + role and forget the record.
export const detachDatabase = async (projectId: number): Promise<void> => {
  const record = await databaseFor(projectId)
  if (!record) return
  if (await containerRunning()) {
    await psql(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${record.dbName}'`,
    ).catch(() => {})
    await psql(`DROP DATABASE IF EXISTS "${record.dbName}"`).catch(() => {})
    await psql(`DROP ROLE IF EXISTS "${record.dbUser}"`).catch(() => {})
  }
  await db.execute(
    from(databases)
      .where((q) => q("id").equals(record.id))
      .del(),
  )
}

export const postgresStatus = async (): Promise<{ provisioned: boolean; running: boolean }> => {
  const provisioned = await containerExists()
  return { provisioned, running: provisioned && (await containerRunning()) }
}

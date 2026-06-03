import { mkdir } from "node:fs/promises"
import { join } from "node:path"
import { from } from "@atlas/db"
import { planBuild } from "../build/detect.ts"
import { config } from "../config/index.ts"
import { db } from "../db/index.ts"
import {
  buildImage,
  isRunning,
  removeByName,
  removeContainer,
  runContainer,
  stopContainer,
} from "../docker/index.ts"
import { fetchSource } from "../git/index.ts"
import { databaseFor, databaseUrl } from "../postgres/index.ts"
import { syncRoutes } from "../proxy/index.ts"
import {
  type Deployment,
  deployments,
  type EnvVar,
  envvars,
  type Project,
  projects,
} from "../schema/index.ts"
import { reportDeployStatus } from "../tangle/index.ts"
import { emitLog } from "./logs.ts"
import { allocatePort } from "./ports.ts"

const containerName = (project: string, deploymentId: number): string =>
  `kettle-${project}-${deploymentId}`

const setStatus = (id: number, status: string, patch: Partial<Deployment> = {}): Promise<unknown> =>
  db.execute(
    from(deployments)
      .where((q) => q("id").equals(id))
      .update({ status, ...patch }),
  )

// User env vars, plus a managed DATABASE_URL when a Postgres database is
// attached. Managed values win so the env editor can't clobber them.
const envFor = async (projectId: number): Promise<Record<string, string>> => {
  const rows = await db.all<EnvVar>(from(envvars).where((q) => q("projectId").equals(projectId)))
  const env: Record<string, string> = Object.fromEntries(rows.map((r) => [r.key, r.value]))
  const database = await databaseFor(projectId)
  if (database) env.DATABASE_URL = databaseUrl(database)
  return env
}

// Wait until the container is running, then give the app a moment to bind its port.
const healthCheck = async (containerId: string, log: (l: string) => void): Promise<boolean> => {
  for (let i = 0; i < 30; i++) {
    if (!(await isRunning(containerId))) {
      log("container exited during startup")
      return false
    }
    await Bun.sleep(1000)
    if (i === 2) log("waiting for app to become healthy…")
  }
  return true
}

// Full build + release pipeline for a single deployment. Runs detached.
export const runDeploy = async (deploymentId: number): Promise<void> => {
  const log = (line: string, stream = "build") => emitLog(deploymentId, stream, line)

  const dep = await db.one<Deployment>(from(deployments).where((q) => q("id").equals(deploymentId)))
  if (!dep) return
  const project = await db.one<Project>(from(projects).where((q) => q("id").equals(dep.projectId)))
  if (!project) return

  let commitSha: string | null = null
  try {
    await setStatus(deploymentId, "building")
    log(`Deploying ${project.name} (#${deploymentId})`)

    if (!project.repoUrl) throw new Error("project has no repository URL")

    const sourceDir = join(config.workdir, project.name, String(deploymentId))
    await mkdir(join(config.workdir, project.name), { recursive: true })

    log(`Cloning ${project.repoUrl} @ ${project.branch}`)
    const sha = await fetchSource({
      repoUrl: project.repoUrl,
      branch: project.branch,
      dest: sourceDir,
      onLine: (l) => log(l),
    })
    commitSha = sha
    await setStatus(deploymentId, "building", { commitSha: sha })
    log(`At commit ${sha}`)
    void reportDeployStatus(project, sha, "pending", log)

    const plan = await planBuild(project, sourceDir)
    log(`Detected stack: ${plan.stack}`)

    const contextDir =
      project.rootDir && project.rootDir !== "." ? join(sourceDir, project.rootDir) : sourceDir
    let dockerfilePath: string | undefined
    if (plan.generated) {
      dockerfilePath = join(sourceDir, `kettle.${deploymentId}.dockerfile`)
      await Bun.write(dockerfilePath, plan.generated)
      log("Generated Dockerfile:")
      for (const l of plan.generated.split("\n")) log(`  ${l}`)
    }

    const image = `kettle/${project.name}:${deploymentId}`
    log(`Building image ${image}`)
    await buildImage({
      tag: image,
      contextDir,
      dockerfile: dockerfilePath,
      onLine: (l) => log(l),
    })
    await setStatus(deploymentId, "building", { image })

    const hostPort = await allocatePort()
    const name = containerName(project.name, deploymentId)
    await removeByName(name)

    // Join the shared data network only when this project has a database.
    const database = await databaseFor(project.id)
    if (database) log(`Attaching to database ${database.dbName} on ${config.pgNetwork}`)

    log(`Starting container on host port ${hostPort} -> :${plan.internalPort}`)
    const containerId = await runContainer({
      name,
      image,
      hostPort,
      internalPort: plan.internalPort,
      env: await envFor(project.id),
      project: project.name,
      deploymentId,
      network: database ? config.pgNetwork : undefined,
    })
    await setStatus(deploymentId, "running", { containerId, hostPort })

    const healthy = await healthCheck(containerId, (l) => log(l, "runtime"))
    if (!healthy) {
      await removeContainer(containerId).catch(() => {})
      throw new Error("health check failed")
    }

    // Promote: this deployment goes live, prior live ones are retired.
    await retirePrevious(project.id, deploymentId, log)
    await setStatus(deploymentId, "live", { finishedAt: new Date().toISOString() as any })
    await syncRoutes()

    log(`✓ Live at ${project.name}.${config.appDomain}`, "runtime")
    void reportDeployStatus(project, commitSha, "success", log)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    log(`✗ Deploy failed: ${message}`, "runtime")
    await setStatus(deploymentId, "failed", {
      error: message,
      finishedAt: new Date().toISOString() as any,
    })
    void reportDeployStatus(project, commitSha, "failure", log)
    await syncRoutes()
  }
}

// Stop and remove containers for older live/running deployments of the same project.
const retirePrevious = async (
  projectId: number,
  keepId: number,
  log: (l: string, s?: string) => void,
): Promise<void> => {
  const old = await db.all<Deployment>(
    from(deployments).where((q) => q.or(q("status").equals("live"), q("status").equals("running"))),
  )
  for (const d of old) {
    if (d.projectId !== projectId || d.id === keepId || !d.containerId) continue
    log(`Retiring previous deployment #${d.id}`, "runtime")
    await stopContainer(d.containerId).catch(() => {})
    await removeContainer(d.containerId).catch(() => {})
    await setStatus(d.id, "stopped")
  }
}

// Stop a running deployment's container and mark it stopped.
export const stopDeployment = async (deploymentId: number): Promise<void> => {
  const dep = await db.one<Deployment>(from(deployments).where((q) => q("id").equals(deploymentId)))
  if (!dep?.containerId) return
  await stopContainer(dep.containerId).catch(() => {})
  await removeContainer(dep.containerId).catch(() => {})
  await setStatus(deploymentId, "stopped")
  await syncRoutes()
}

// Create a deployment row and kick off the pipeline in the background.
export const triggerDeploy = async (projectId: number, trigger = "manual"): Promise<Deployment> => {
  const rows = await db.execute(
    from(deployments)
      .insert({ projectId, status: "queued", trigger })
      .returning("id", "projectId", "status"),
  )
  const deployment = rows[0] as Deployment
  void runDeploy(deployment.id)
  return deployment
}

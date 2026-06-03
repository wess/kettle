import { randomBytes } from "node:crypto"
import { from } from "@atlas/db"
import { del, get, json, patch, post } from "@atlas/server"
import { db } from "../db/index.ts"
import { removeContainer } from "../docker/index.ts"
import { detachDatabase } from "../postgres/index.ts"
import {
  getProject,
  getProjectByName,
  isValidSlug,
  listProjects,
  slugify,
} from "../projects/index.ts"
import { syncRoutes } from "../proxy/index.ts"
import {
  type Deployment,
  deployments,
  domains,
  envvars,
  type Project,
  projects,
} from "../schema/index.ts"
import { authed, guard } from "./guard.ts"

const latestDeployment = (projectId: number) =>
  db.one<Deployment>(
    from(deployments)
      .where((q) => q("projectId").equals(projectId))
      .orderBy("id", "DESC")
      .limit(1),
  )

export const projectRoutes = [
  get(
    "/projects",
    guard(async (c) => {
      const rows = await listProjects()
      const withStatus = await Promise.all(
        rows.map(async (p) => ({ ...p, latest: await latestDeployment(p.id) })),
      )
      return json(c, 200, withStatus)
    }),
  ),

  post(
    "/projects",
    authed(async (c) => {
      const body = (c.body ?? {}) as Partial<Project>
      const name = slugify(body.name ?? "")
      if (!isValidSlug(name)) return json(c, 422, { error: "Invalid project name" })
      if (await getProjectByName(name)) return json(c, 409, { error: "Project name already taken" })

      const rows = await db.execute(
        from(projects)
          .insert({
            name,
            repoUrl: body.repoUrl ?? null,
            branch: body.branch || "main",
            buildType: body.buildType || "auto",
            rootDir: body.rootDir || ".",
            buildCommand: body.buildCommand ?? null,
            startCommand: body.startCommand ?? null,
            internalPort: body.internalPort ?? 3000,
            webhookSecret: randomBytes(24).toString("hex"),
            autoDeploy: 1,
          })
          .returning("id", "name"),
      )
      return json(c, 201, rows[0])
    }),
  ),

  get(
    "/projects/:id",
    guard(async (c) => {
      const project = await getProject(Number(c.params.id))
      if (!project) return json(c, 404, { error: "Project not found" })

      const [deps, env, doms] = await Promise.all([
        db.all<Deployment>(
          from(deployments)
            .where((q) => q("projectId").equals(project.id))
            .orderBy("id", "DESC")
            .limit(50),
        ),
        db.all(from(envvars).where((q) => q("projectId").equals(project.id))),
        db.all(from(domains).where((q) => q("projectId").equals(project.id))),
      ])

      return json(c, 200, { ...project, deployments: deps, env, domains: doms })
    }),
  ),

  patch(
    "/projects/:id",
    authed(async (c) => {
      const id = Number(c.params.id)
      const project = await getProject(id)
      if (!project) return json(c, 404, { error: "Project not found" })

      const body = (c.body ?? {}) as Partial<Project>
      const patchData: Partial<Project> = {}
      for (const key of [
        "repoUrl",
        "branch",
        "buildType",
        "rootDir",
        "buildCommand",
        "startCommand",
        "internalPort",
        "autoDeploy",
      ] as const) {
        if (key in body) (patchData as any)[key] = (body as any)[key]
      }
      if (Object.keys(patchData).length === 0) return json(c, 200, project)

      await db.execute(
        from(projects)
          .where((q) => q("id").equals(id))
          .update(patchData),
      )
      return json(c, 200, await getProject(id))
    }),
  ),

  // Rotate the webhook signing secret. Returns the new secret once.
  post(
    "/projects/:id/webhook/rotate",
    guard(async (c) => {
      const id = Number(c.params.id)
      if (!(await getProject(id))) return json(c, 404, { error: "Project not found" })
      const webhookSecret = randomBytes(24).toString("hex")
      await db.execute(
        from(projects)
          .where((q) => q("id").equals(id))
          .update({ webhookSecret }),
      )
      return json(c, 200, { webhookSecret })
    }),
  ),

  del(
    "/projects/:id",
    guard(async (c) => {
      const id = Number(c.params.id)
      const project = await getProject(id)
      if (!project) return json(c, 404, { error: "Project not found" })

      // Tear down running containers and any attached database first.
      const running = await db.all<{ id: number; containerId: string | null }>(
        from(deployments)
          .select("id", "containerId")
          .where((q) => q("projectId").equals(id)),
      )
      for (const d of running) {
        if (d.containerId) await removeContainer(d.containerId).catch(() => {})
      }
      await detachDatabase(id).catch(() => {})

      const deps = await db.all<{ id: number }>(
        from(deployments)
          .select("id")
          .where((q) => q("projectId").equals(id)),
      )
      const depIds = deps.map((d) => d.id)
      if (depIds.length > 0) {
        await db.execute(
          from("logs")
            .where((q) => q("deploymentId").inList(depIds))
            .del(),
        )
      }
      await db.execute(
        from(deployments)
          .where((q) => q("projectId").equals(id))
          .del(),
      )
      await db.execute(
        from(envvars)
          .where((q) => q("projectId").equals(id))
          .del(),
      )
      await db.execute(
        from(domains)
          .where((q) => q("projectId").equals(id))
          .del(),
      )
      await db.execute(
        from(projects)
          .where((q) => q("id").equals(id))
          .del(),
      )
      await syncRoutes()
      return json(c, 200, { deleted: true })
    }),
  ),
]

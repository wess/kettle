import { from } from "@atlas/db"
import { del, get, json, post } from "@atlas/server"
import { db } from "../db/index.ts"
import { getProject } from "../projects/index.ts"
import { syncRoutes } from "../proxy/index.ts"
import { type Domain, domains } from "../schema/index.ts"
import { authed, guard } from "./guard.ts"

const hostPattern = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/

export const domainRoutes = [
  get(
    "/projects/:id/domains",
    guard(async (c) => {
      const id = Number(c.params.id)
      if (!(await getProject(id))) return json(c, 404, { error: "Project not found" })
      const rows = await db.all<Domain>(from(domains).where((q) => q("projectId").equals(id)))
      return json(c, 200, rows)
    }),
  ),

  post(
    "/projects/:id/domains",
    authed(async (c) => {
      const id = Number(c.params.id)
      if (!(await getProject(id))) return json(c, 404, { error: "Project not found" })

      const host = String((c.body as { host?: string })?.host ?? "")
        .toLowerCase()
        .trim()
      if (!hostPattern.test(host)) return json(c, 422, { error: "Invalid domain" })

      const existing = await db.one<Domain>(from(domains).where((q) => q("host").equals(host)))
      if (existing) return json(c, 409, { error: "Domain already in use" })

      const rows = await db.execute(
        from(domains).insert({ projectId: id, host }).returning("id", "host"),
      )
      await syncRoutes()
      return json(c, 201, rows[0])
    }),
  ),

  del(
    "/domains/:domainId",
    guard(async (c) => {
      const domainId = Number(c.params.domainId)
      await db.execute(
        from(domains)
          .where((q) => q("id").equals(domainId))
          .del(),
      )
      await syncRoutes()
      return json(c, 200, { deleted: true })
    }),
  ),
]

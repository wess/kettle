import { del, get, json, post } from "@atlas/server"
import { attachDatabase, databaseFor, databaseUrl, detachDatabase } from "../postgres/index.ts"
import { getProject } from "../projects/index.ts"
import type { Database } from "../schema/index.ts"
import { guard } from "./guard.ts"

const present = (d: Database) => ({
  engine: d.engine,
  dbName: d.dbName,
  dbUser: d.dbUser,
  url: databaseUrl(d),
})

export const databaseRoutes = [
  get(
    "/projects/:id/database",
    guard(async (c) => {
      const id = Number(c.params.id)
      if (!(await getProject(id))) return json(c, 404, { error: "Project not found" })
      const record = await databaseFor(id)
      return json(c, 200, record ? present(record) : null)
    }),
  ),

  // Provision a dedicated Postgres database for the project. Idempotent.
  post(
    "/projects/:id/database",
    guard(async (c) => {
      const project = await getProject(Number(c.params.id))
      if (!project) return json(c, 404, { error: "Project not found" })
      try {
        const record = await attachDatabase(project)
        return json(c, 201, present(record))
      } catch (e) {
        return json(c, 500, { error: (e as Error).message })
      }
    }),
  ),

  del(
    "/projects/:id/database",
    guard(async (c) => {
      const id = Number(c.params.id)
      if (!(await getProject(id))) return json(c, 404, { error: "Project not found" })
      await detachDatabase(id)
      return json(c, 200, { detached: true })
    }),
  ),
]

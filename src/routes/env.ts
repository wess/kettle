import { from } from "@atlas/db"
import { get, json, put } from "@atlas/server"
import { db } from "../db/index.ts"
import { getProject } from "../projects/index.ts"
import { type EnvVar, envvars } from "../schema/index.ts"
import { authed, guard } from "./guard.ts"

export const envRoutes = [
  get(
    "/projects/:id/env",
    guard(async (c) => {
      const id = Number(c.params.id)
      if (!(await getProject(id))) return json(c, 404, { error: "Project not found" })
      const rows = await db.all<EnvVar>(from(envvars).where((q) => q("projectId").equals(id)))
      return json(c, 200, rows)
    }),
  ),

  // Replace the full env set for a project.
  put(
    "/projects/:id/env",
    authed(async (c) => {
      const id = Number(c.params.id)
      if (!(await getProject(id))) return json(c, 404, { error: "Project not found" })

      const body = (c.body ?? {}) as { vars?: Array<{ key: string; value: string }> }
      const vars = (body.vars ?? []).filter((v) => v.key && /^[A-Za-z_][A-Za-z0-9_]*$/.test(v.key))

      await db.execute(
        from(envvars)
          .where((q) => q("projectId").equals(id))
          .del(),
      )
      if (vars.length > 0) {
        await db.execute(
          from(envvars).insertMany(
            vars.map((v) => ({ projectId: id, key: v.key, value: String(v.value) })),
          ),
        )
      }
      const rows = await db.all<EnvVar>(from(envvars).where((q) => q("projectId").equals(id)))
      return json(c, 200, rows)
    }),
  ),
]

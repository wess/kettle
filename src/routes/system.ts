import { from } from "@atlas/db"
import { get, json } from "@atlas/server"
import { config } from "../config/index.ts"
import { db } from "../db/index.ts"
import { dockerAvailable } from "../docker/index.ts"
import { postgresStatus } from "../postgres/index.ts"
import { allRoutes } from "../proxy/index.ts"
import { deployments, projects } from "../schema/index.ts"
import { tangleEnabled } from "../tangle/index.ts"
import { guard } from "./guard.ts"

export const systemRoutes = [
  get(
    "/system",
    guard(async (c) => {
      const [docker, allProjects, liveDeps, postgres] = await Promise.all([
        dockerAvailable(),
        db.all(from(projects)),
        db.all(from(deployments).where((q) => q("status").equals("live"))),
        postgresStatus().catch(() => ({ provisioned: false, running: false })),
      ])
      const projectCount = allProjects.length
      const liveCount = liveDeps.length
      return json(c, 200, {
        docker,
        appDomain: config.appDomain,
        edgeEnabled: config.edgeEnabled,
        edgeHttpPort: config.edgeHttpPort,
        projects: projectCount,
        live: liveCount,
        routes: allRoutes(),
        postgres,
        tangle: tangleEnabled(),
      })
    }),
  ),
]

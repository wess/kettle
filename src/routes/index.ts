import { mcpRoutes } from "../mcp/http.ts"
import { authRoutes } from "./auth.ts"
import { databaseRoutes } from "./database.ts"
import { deploymentRoutes } from "./deployments.ts"
import { domainRoutes } from "./domains.ts"
import { envRoutes } from "./env.ts"
import { hookRoutes } from "./hooks.ts"
import { logRoutes } from "./logs.ts"
import { projectRoutes } from "./projects.ts"
import { systemRoutes } from "./system.ts"

export const allRoutes = [
  ...authRoutes,
  ...systemRoutes,
  ...hookRoutes,
  ...projectRoutes,
  ...deploymentRoutes,
  ...envRoutes,
  ...domainRoutes,
  ...databaseRoutes,
  ...logRoutes,
  ...mcpRoutes,
]

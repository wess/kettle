import { router } from "@atlas/server"
import { needsSetup } from "./src/auth/index.ts"
import { config } from "./src/config/index.ts"
import { runMigrations } from "./src/db/migrate.ts"
import { reconcile } from "./src/deploy/reconcile.ts"
import { startProxy, syncRoutes } from "./src/proxy/index.ts"
import { allRoutes } from "./src/routes/index.ts"
import index from "./src/web/index.html"

const isDev = (process.env.NODE_ENV ?? "development") === "development"

await runMigrations()
await reconcile()
await syncRoutes()

if (await needsSetup()) {
  console.log("[kettle] no users yet — open the dashboard to create the admin account")
}

const api = router(...allRoutes)

// Routes are mount-agnostic (/login, /projects, …). Strip /api before dispatch.
const apiHandler = (req: Request): Promise<Response> => {
  const url = new URL(req.url)
  url.pathname = url.pathname.replace(/^\/api/, "") || "/"
  return api(new Request(url, req))
}

const server = Bun.serve({
  port: config.port,
  hostname: "0.0.0.0",
  development: isDev ? { hmr: true, console: true } : false,
  routes: {
    "/api/*": apiHandler,
    "/*": index,
  },
})

console.log(`[kettle] control plane on ${server.url}`)

if (config.edgeEnabled) startProxy()

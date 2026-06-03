import { from } from "@atlas/db"
import { proxy } from "@atlas/edge"
import { config } from "../config/index.ts"
import { db } from "../db/index.ts"
import { syncMdns } from "../mdns/index.ts"
import {
  type Deployment,
  type Domain,
  deployments,
  domains,
  type Project,
  projects,
} from "../schema/index.ts"
import { allRoutes, lookup, setRoutes, type Target } from "./table.ts"

export { allRoutes } from "./table.ts"

// Rebuild the routing table from the current live deployments.
export const syncRoutes = async (): Promise<void> => {
  const live = await db.all<Deployment>(from(deployments).where((q) => q("status").equals("live")))
  const byProject = new Map<number, Deployment>()
  for (const d of live) {
    if (d.hostPort) byProject.set(d.projectId, d)
  }

  const routes = new Map<string, Target>()
  if (byProject.size > 0) {
    const projectRows = await db.all<Project>(from(projects))
    const customDomains = await db.all<Domain>(from(domains))

    for (const p of projectRows) {
      const dep = byProject.get(p.id)
      if (!dep?.hostPort) continue
      const target: Target = { port: dep.hostPort, projectId: p.id, project: p.name }
      routes.set(`${p.name}.${config.appDomain}`, target)
      for (const d of customDomains.filter((d) => d.projectId === p.id)) {
        routes.set(d.host.toLowerCase(), target)
      }
    }
  }

  setRoutes(routes)
  // Keep mDNS aliases in sync with live hosts, plus the dashboard's own name.
  void syncMdns([...routes.keys(), `kettle.${config.appDomain}`])
}

const errorPage = (title: string, detail: string): Response =>
  new Response(
    `<!doctype html><meta charset=utf-8><title>${title}</title>` +
      `<body style="background:#0a0a0a;color:#e5e5e5;font-family:system-ui;display:grid;place-items:center;height:100vh;margin:0">` +
      `<div style="text-align:center"><h1 style="font-size:48px;margin:0">${title}</h1>` +
      `<p style="color:#888">${detail}</p><p style="color:#444">kettle</p></div>`,
    { status: title.startsWith("404") ? 404 : 502, headers: { "content-type": "text/html" } },
  )

// Reverse-proxy handler: route by Host header to the matching upstream container.
export const proxyHandler = async (req: Request): Promise<Response> => {
  const host = (req.headers.get("host") ?? "").split(":")[0]!.toLowerCase()

  // The dashboard itself is reachable at kettle.<domain> or the bare domain.
  if (host === `kettle.${config.appDomain}` || host === config.appDomain) {
    return forwardTo(req, config.port, host)
  }

  const target = lookup(host)
  if (!target) return errorPage("404 — no app here", `No deployment is routed to ${host}`)

  try {
    return await forwardTo(req, target.port, host)
  } catch {
    return errorPage("502 — app unreachable", `${target.project} is not responding`)
  }
}

const forwardTo = (req: Request, port: number, host: string): Promise<Response> =>
  proxy(`http://127.0.0.1:${port}`, { preserveHost: true })(req, {
    remoteIp: "127.0.0.1",
    tls: false,
    host,
  })

// Start the reverse proxy on a plain HTTP port. (.local mDNS hosts can't use ACME.)
export const startProxy = (): void => {
  const server = Bun.serve({
    port: config.edgeHttpPort,
    hostname: "0.0.0.0",
    fetch: proxyHandler,
  })
  console.log(`[kettle] edge proxy on :${server.port} routing *.${config.appDomain}`)
}

export const routeCount = (): number => allRoutes().length

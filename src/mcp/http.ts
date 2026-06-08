import { createContext, createMcpServer } from "@atlas/mcp"
import { get, json, post } from "@atlas/server"
import { config } from "../config/index.ts"
import { authed, guard } from "../routes/guard.ts"
import { enabledTools } from "./index.ts"

// HTTP transport for Kettle's MCP. Exposes the control-plane domain tools
// (projects.*, deploy, deployments.get) over a bearer-authenticated POST /mcp
// so remote AI clients can drive a deployed Kettle. The bearer token is
// kettle's own JWT — for now an operator mints a static admin token via
// signToken (see src/auth); later this becomes a broker-minted token, but the
// verification path (requireAuth in routes/guard.ts) stays the same.
//
// GET /mcp is unauthenticated discovery, matching Tangle: it advertises
// whether MCP is enabled, the endpoint, protocol version, and per-category
// gating so a client knows up front what it can call.

const PROTOCOL_VERSION = "2024-11-05"
const SERVER_NAME = "kettle-mcp"
const SERVER_VERSION = "0.1.0"

const endpointUrl = (): string => {
  const base = config.publicUrl.replace(/\/$/, "")
  return base ? `${base}/api/mcp` : "/api/mcp"
}

type JsonRpcBody = {
  jsonrpc?: string
  id?: string | number
  method?: string
  params?: unknown
}

export const mcpRoutes = [
  // Unauthenticated discovery — AI clients (and the dashboard) hit this to
  // confirm MCP is on and learn the endpoint + which categories are exposed.
  get("/mcp", async (c) => {
    return json(c, 200, {
      enabled: config.mcpEnabled,
      endpoint: endpointUrl(),
      protocol_version: PROTOCOL_VERSION,
      server: { name: SERVER_NAME, version: SERVER_VERSION },
      categories: { read: config.mcpEnabled, write: config.mcpEnabled && config.mcpWrite },
      auth: "Bearer (Kettle JWT) on POST /mcp",
    })
  }),

  // Authenticated JSON-RPC. requireAuth (via guard) verifies the Kettle JWT
  // and populates c.assigns.auth before we touch the body.
  post(
    "/mcp",
    authed(async (c) => {
      if (!config.mcpEnabled) {
        return json(c, 503, { error: "MCP is disabled on this instance" })
      }

      const body = (c.body ?? {}) as JsonRpcBody
      if (body.jsonrpc !== "2.0" || typeof body.method !== "string") {
        return json(c, 400, {
          jsonrpc: "2.0",
          id: body.id ?? null,
          error: { code: -32600, message: "Invalid JSON-RPC request" },
        })
      }

      // Pre-handle ping for MCP-spec compliance — createMcpServer treats it as
      // an unknown method.
      if (body.method === "ping") {
        return json(c, 200, { jsonrpc: "2.0", id: body.id ?? 0, result: {} })
      }

      // Write tools are only advertised/callable when MCP_WRITE is also set;
      // otherwise the server only knows about the read tools, so a tools/call
      // for a write tool comes back as an unknown-tool JSON-RPC error.
      const tools = enabledTools(config.mcpWrite)
      const ctx = createContext({})
      const server = createMcpServer(tools, ctx)

      const res = await server.handleRequest({
        jsonrpc: "2.0",
        id: body.id,
        method: body.method,
        params: body.params,
      })
      return json(c, 200, res)
    }),
  ),
]

// Re-export the bare guard so server wiring can reuse the same auth pipeline
// shape if it ever mounts MCP outside the route bundle.
export { guard }

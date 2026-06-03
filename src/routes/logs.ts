import { token } from "@atlas/auth"
import { from } from "@atlas/db"
import { get, json } from "@atlas/server"
import { config } from "../config/index.ts"
import { db } from "../db/index.ts"
import { subscribeLogs } from "../deploy/logs.ts"
import { type Deployment, deployments, type LogLine, logs as logsTable } from "../schema/index.ts"

const encoder = new TextEncoder()
const sse = (event: string, data: unknown): Uint8Array =>
  encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)

const verifyQueryToken = async (c: { request: Request }): Promise<boolean> => {
  const url = new URL(c.request.url)
  const t = url.searchParams.get("token")
  if (!t) return false
  try {
    await token.verify(t, config.secret)
    return true
  } catch {
    return false
  }
}

export const logRoutes = [
  // Live log stream. Replays history then follows new lines until the client disconnects.
  get("/deployments/:id/logs", async (c) => {
    if (!(await verifyQueryToken(c))) return json(c, 401, { error: "Unauthorized" })
    const deploymentId = Number(c.params.id)
    const dep = await db.one<Deployment>(
      from(deployments).where((q) => q("id").equals(deploymentId)),
    )
    if (!dep) return json(c, 404, { error: "Deployment not found" })

    const history = await db.all<LogLine>(
      from(logsTable)
        .where((q) => q("deploymentId").equals(deploymentId))
        .orderBy("id", "ASC"),
    )

    let unsubscribe: (() => void) | undefined
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(sse("connected", { deploymentId }))
        for (const line of history) {
          controller.enqueue(sse("log", { stream: line.stream, line: line.line }))
        }
        controller.enqueue(sse("status", { status: dep.status }))
        unsubscribe = subscribeLogs(deploymentId, (e) => {
          try {
            controller.enqueue(sse("log", { stream: e.stream, line: e.line }))
          } catch {
            unsubscribe?.()
          }
        })
      },
      cancel() {
        unsubscribe?.()
      },
    })

    const headers = new Headers(c.respHeaders)
    headers.set("content-type", "text/event-stream")
    headers.set("cache-control", "no-cache")
    headers.set("connection", "keep-alive")
    return { ...c, status: 200, body: stream, respHeaders: headers, halted: true }
  }),
]

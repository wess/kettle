import { createHmac, timingSafeEqual } from "node:crypto"
import { json, post } from "@atlas/server"
import { triggerDeploy } from "../deploy/index.ts"
import { projectsForRepo } from "../projects/index.ts"
import type { Project } from "../schema/index.ts"

// GitHub/Tangle-style signature: sha256=<hmac-hex> over the exact request body.
const verify = (secret: string, body: string, header: string | null): boolean => {
  if (!header) return false
  const expected = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`
  const a = Buffer.from(header)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

type PushPayload = {
  event?: string
  repository?: { owner?: string; name?: string }
}

export const hookRoutes = [
  // Public endpoint — authenticated by per-project HMAC, not a session token.
  // Tangle sends a minimal push payload (repo owner/name, no ref), so we
  // redeploy the configured branch of every matching auto-deploy project.
  post("/hooks/tangle", async (c) => {
    const event = c.request.headers.get("x-tangle-event") ?? ""
    const signature = c.request.headers.get("x-tangle-signature")
    const body = await c.request.text()

    if (event && event !== "push") return json(c, 202, { ignored: event })

    let payload: PushPayload
    try {
      payload = JSON.parse(body) as PushPayload
    } catch {
      return json(c, 400, { error: "Invalid JSON" })
    }

    const owner = payload.repository?.owner
    const name = payload.repository?.name
    if (!owner || !name) return json(c, 400, { error: "Missing repository owner/name" })

    const candidates = await projectsForRepo(owner, name)
    const triggered: string[] = []
    for (const p of candidates) {
      if (!shouldDeploy(p, body, signature)) continue
      await triggerDeploy(p.id, "push")
      triggered.push(p.name)
    }

    if (triggered.length === 0) return json(c, 202, { matched: candidates.length, triggered: [] })
    return json(c, 202, { triggered })
  }),
]

const shouldDeploy = (p: Project, body: string, signature: string | null): boolean => {
  if (!p.autoDeploy) return false
  // A configured secret must verify; projects without one accept unsigned hooks
  // (fine on a trusted LAN, but the dashboard nudges you to set one).
  if (p.webhookSecret) return verify(p.webhookSecret, body, signature)
  return true
}

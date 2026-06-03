import { requireAuth } from "@atlas/auth"
import { parseJson, pipeline } from "@atlas/server"
import type { Claims } from "../auth/index.ts"
import { config } from "../config/index.ts"

// requireAuth populates conn.assigns.auth from the Bearer token.
export const authed = pipeline(requireAuth({ secret: config.secret }), parseJson)
export const guard = pipeline(requireAuth({ secret: config.secret }))

export const currentUser = (c: { assigns: Record<string, unknown> }): Claims =>
  c.assigns.auth as Claims

import { verify } from "@atlas/auth"
import { from } from "@atlas/db"
import { get, json, parseJson, pipeline, post } from "@atlas/server"
import { createUser, needsSetup, signToken } from "../auth/index.ts"
import { db } from "../db/index.ts"
import { type User, users } from "../schema/index.ts"
import { currentUser, guard } from "./guard.ts"

const emailRe = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export const authRoutes = [
  // Tells the dashboard whether to show "create admin account" vs "sign in".
  get("/setup", async (c) => json(c, 200, { needsSetup: await needsSetup() })),

  // The first account created becomes the admin. Registration closes after that.
  post(
    "/signup",
    pipeline(parseJson)(async (c) => {
      if (!(await needsSetup())) {
        return json(c, 403, { error: "Registration is closed — an admin already exists" })
      }
      const { email, password } = (c.body ?? {}) as { email?: string; password?: string }
      const trimmed = email?.trim().toLowerCase()
      if (!trimmed || !emailRe.test(trimmed)) return json(c, 422, { error: "Valid email required" })
      if (!password || password.length < 8) {
        return json(c, 422, { error: "Password must be at least 8 characters" })
      }

      const user = await createUser(trimmed, password, "admin")
      console.log(`[kettle] created admin user ${user.email}`)
      return json(c, 201, {
        token: await signToken(user),
        user: { id: user.id, email: user.email },
      })
    }),
  ),

  post(
    "/login",
    pipeline(parseJson)(async (c) => {
      const { email, password } = (c.body ?? {}) as { email?: string; password?: string }
      if (!email || !password) return json(c, 422, { error: "Email and password required" })

      const user = await db.one<User>(
        from(users).where((q) => q("email").equals(email.trim().toLowerCase())),
      )
      if (!user || !(await verify(password, user.password))) {
        return json(c, 401, { error: "Invalid credentials" })
      }

      return json(c, 200, {
        token: await signToken(user),
        user: { id: user.id, email: user.email },
      })
    }),
  ),

  get(
    "/me",
    guard(async (c) => json(c, 200, currentUser(c))),
  ),
]

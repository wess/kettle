import { hash, token } from "@atlas/auth"
import { from } from "@atlas/db"
import { config } from "../config/index.ts"
import { db } from "../db/index.ts"
import { type User, users } from "../schema/index.ts"

export type Claims = { id: number; email: string }

export const signToken = (user: Pick<User, "id" | "email">) =>
  token.sign({ id: user.id, email: user.email }, config.secret, { expiresIn: 60 * 60 * 24 * 7 })

export const userCount = async (): Promise<number> =>
  (await db.all<{ id: number }>(from(users).select("id"))).length

// Registration is open only until the first account exists; that account is the admin.
export const needsSetup = async (): Promise<boolean> => (await userCount()) === 0

export const createUser = async (
  email: string,
  password: string,
  role = "admin",
): Promise<User> => {
  const hashed = await hash(password)
  const rows = await db.execute(
    from(users)
      .insert({ email, password: hashed, role })
      .returning("id", "email", "role", "createdAt"),
  )
  return rows[0] as User
}

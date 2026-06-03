import { readdir } from "node:fs/promises"
import { join } from "node:path"
import { db } from "./index.ts"

// Split a SQL file into individual statements. Our migration SQL has no
// semicolons inside string literals, so a naive split is safe here.
const statements = (sql: string): string[] =>
  sql
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith("--"))

// Run every migration's up.sql, statement by statement. Statements are
// idempotent (IF NOT EXISTS), and applied migrations are recorded so each
// folder only runs once.
export const runMigrations = async (dir = "./migrations"): Promise<void> => {
  await db.execute({
    text: "CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, appliedAt DATETIME DEFAULT CURRENT_TIMESTAMP)",
    values: [],
  })

  const applied = new Set(
    (await db.all<{ name: string }>({ text: "SELECT name FROM _migrations", values: [] })).map(
      (r) => r.name,
    ),
  )

  const entries = (await readdir(dir, { withFileTypes: true }))
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()

  for (const name of entries) {
    if (applied.has(name)) continue
    const sql = await Bun.file(join(dir, name, "up.sql")).text()
    for (const stmt of statements(sql)) {
      await db.execute({ text: stmt, values: [] })
    }
    await db.execute({ text: "INSERT INTO _migrations (name) VALUES (?)", values: [name] })
    console.log(`[kettle] applied migration ${name}`)
  }
}

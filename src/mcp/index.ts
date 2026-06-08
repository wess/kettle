import type { Tool } from "@atlas/mcp"
import { kettleTools } from "./tools/index.ts"

// Kettle's MCP catalog plus the explicit category map that drives gating in
// http.ts. Categories are decided here, never inferred from a tool name — a
// new tool added without a CATEGORY entry is treated as `write` (the safe
// default) so it can't leak as read-only by accident.

export type Category = "read" | "write"

export const CATEGORY: Record<string, Category> = {
  "kettle.projects.list": "read",
  "kettle.deployments.get": "read",
  "kettle.projects.create": "write",
  "kettle.deploy": "write",
}

// Unmapped tools default to write so they stay hidden until categorised.
const FALLBACK: Category = "write"

export const categoryOf = (name: string): Category => CATEGORY[name] ?? FALLBACK

// All kettle domain tools, optionally narrowed to the allowed categories.
// When `allowWrite` is false only read tools come back.
export const enabledTools = (allowWrite: boolean): Tool[] => {
  const all = kettleTools()
  if (allowWrite) return all
  return all.filter((t) => categoryOf(t.name) === "read")
}

export { kettleTools } from "./tools/index.ts"

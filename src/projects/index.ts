import { from } from "@atlas/db"
import { db } from "../db/index.ts"
import { type Project, projects } from "../schema/index.ts"

export const slugify = (name: string): string =>
  name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)

export const isValidSlug = (slug: string): boolean => /^[a-z0-9][a-z0-9-]{0,47}$/.test(slug)

export const getProject = (id: number): Promise<Project | null> =>
  db.one<Project>(from(projects).where((q) => q("id").equals(id)))

export const getProjectByName = (name: string): Promise<Project | null> =>
  db.one<Project>(from(projects).where((q) => q("name").equals(name)))

export const listProjects = (): Promise<Project[]> =>
  db.all<Project>(from(projects).orderBy("createdAt", "DESC"))

// Pull "owner/name" out of a git URL — handles http(s)://host/owner/name(.git),
// git@host:owner/name.git, and bare local paths (…/owner/name).
export const parseRepoSlug = (repoUrl: string | null): { owner: string; name: string } | null => {
  if (!repoUrl) return null
  let path = repoUrl.trim()
  const scp = path.match(/^[^@]+@[^:]+:(.+)$/) // git@host:owner/name.git
  if (scp) path = scp[1]!
  else
    try {
      path = new URL(path).pathname
    } catch {
      /* local path or bare — use as-is */
    }
  const parts = path
    .replace(/\.git$/, "")
    .split("/")
    .filter(Boolean)
  if (parts.length < 2) return null
  const [owner, name] = parts.slice(-2)
  return { owner: owner!.toLowerCase(), name: name!.toLowerCase() }
}

// Projects whose repo URL resolves to the given owner/name (case-insensitive).
export const projectsForRepo = async (owner: string, name: string): Promise<Project[]> => {
  const all = await db.all<Project>(from(projects))
  const o = owner.toLowerCase()
  const n = name.toLowerCase()
  return all.filter((p) => {
    const slug = parseRepoSlug(p.repoUrl)
    return slug?.owner === o && slug?.name === n
  })
}

import { rm } from "node:fs/promises"
import { exec, execCapture, type LineSink } from "../exec/index.ts"

// Fresh shallow clone of a repo at a branch into `dest`. Replaces any prior checkout.
export const fetchSource = async (opts: {
  repoUrl: string
  branch: string
  dest: string
  onLine?: LineSink
}): Promise<string> => {
  await rm(opts.dest, { recursive: true, force: true })
  const result = await exec(
    ["git", "clone", "--depth", "1", "--branch", opts.branch, opts.repoUrl, opts.dest],
    { onLine: opts.onLine },
  )
  if (result.code !== 0) throw new Error(`git clone failed (exit ${result.code})`)
  return currentSha(opts.dest)
}

export const currentSha = async (dir: string): Promise<string> => {
  try {
    return (await execCapture(["git", "rev-parse", "--short", "HEAD"], { cwd: dir })).trim()
  } catch {
    return "unknown"
  }
}

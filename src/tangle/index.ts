import { config } from "../config/index.ts"
import { parseRepoSlug } from "../projects/index.ts"
import type { Project } from "../schema/index.ts"

export type StatusState = "pending" | "success" | "failure" | "error"

export const tangleEnabled = (): boolean => Boolean(config.tangleUrl && config.tangleToken)

const describe = (state: StatusState): string =>
  state === "success"
    ? "Deployed"
    : state === "failure" || state === "error"
      ? "Deploy failed"
      : "Deploying…"

// Post a commit status to Tangle for this project's repo. Best-effort: a
// missing repo, an unreachable host, or a non-Tangle repo never fail a deploy.
export const reportDeployStatus = async (
  project: Project,
  sha: string | null,
  state: StatusState,
  log?: (line: string, stream?: string) => void,
): Promise<void> => {
  if (!tangleEnabled() || !sha || sha === "unknown") return
  const slug = parseRepoSlug(project.repoUrl)
  if (!slug) return

  const targetUrl = config.publicUrl ? `${config.publicUrl}/#/projects/${project.id}` : undefined
  try {
    const res = await fetch(
      `${config.tangleUrl.replace(/\/$/, "")}/repos/${slug.owner}/${slug.name}/statuses/${sha}`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${config.tangleToken}`,
        },
        body: JSON.stringify({
          state,
          context: "kettle",
          description: describe(state),
          target_url: targetUrl,
        }),
      },
    )
    if (res.ok) log?.(`Reported ${state} to Tangle (${slug.owner}/${slug.name}@${sha})`, "runtime")
    else log?.(`Tangle status rejected (${res.status})`, "runtime")
  } catch (e) {
    log?.(`Tangle status post failed: ${(e as Error).message}`, "runtime")
  }
}

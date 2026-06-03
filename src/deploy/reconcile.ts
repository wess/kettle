import { from } from "@atlas/db"
import { db } from "../db/index.ts"
import { dockerAvailable, isRunning } from "../docker/index.ts"
import { type Deployment, deployments } from "../schema/index.ts"

// On boot, demote any deployment whose container is no longer running so the
// routing table reflects reality after a restart or crash.
export const reconcile = async (): Promise<void> => {
  if (!(await dockerAvailable())) {
    console.log("[kettle] docker not available — deploys disabled")
    return
  }

  const active = await db.all<Deployment>(
    from(deployments).where((q) => q.or(q("status").equals("live"), q("status").equals("running"))),
  )
  for (const d of active) {
    const alive = d.containerId ? await isRunning(d.containerId) : false
    if (!alive) {
      await db.execute(
        from(deployments)
          .where((q) => q("id").equals(d.id))
          .update({ status: "stopped" }),
      )
    }
  }
}

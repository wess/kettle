import { from } from "@atlas/db"
import { get, json, post } from "@atlas/server"
import { db } from "../db/index.ts"
import { runDeploy, stopDeployment, triggerDeploy } from "../deploy/index.ts"
import { historyFor } from "../deploy/logs.ts"
import { getProject } from "../projects/index.ts"
import { type Deployment, deployments } from "../schema/index.ts"
import { guard } from "./guard.ts"

const getDeployment = (id: number) =>
  db.one<Deployment>(from(deployments).where((q) => q("id").equals(id)))

export const deploymentRoutes = [
  post(
    "/projects/:id/deploy",
    guard(async (c) => {
      const id = Number(c.params.id)
      const project = await getProject(id)
      if (!project) return json(c, 404, { error: "Project not found" })
      if (!project.repoUrl) return json(c, 422, { error: "Set a repository URL before deploying" })
      const deployment = await triggerDeploy(id, "manual")
      return json(c, 202, deployment)
    }),
  ),

  get(
    "/deployments/:id",
    guard(async (c) => {
      const dep = await getDeployment(Number(c.params.id))
      if (!dep) return json(c, 404, { error: "Deployment not found" })
      return json(c, 200, dep)
    }),
  ),

  get(
    "/deployments/:id/logs/history",
    guard(async (c) => {
      const dep = await getDeployment(Number(c.params.id))
      if (!dep) return json(c, 404, { error: "Deployment not found" })
      return json(c, 200, await historyFor(dep.id))
    }),
  ),

  post(
    "/deployments/:id/stop",
    guard(async (c) => {
      const dep = await getDeployment(Number(c.params.id))
      if (!dep) return json(c, 404, { error: "Deployment not found" })
      await stopDeployment(dep.id)
      return json(c, 200, { stopped: true })
    }),
  ),

  post(
    "/deployments/:id/redeploy",
    guard(async (c) => {
      const dep = await getDeployment(Number(c.params.id))
      if (!dep) return json(c, 404, { error: "Deployment not found" })
      void runDeploy(dep.id)
      return json(c, 202, { redeploying: true })
    }),
  ),
]

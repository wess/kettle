import { randomBytes } from "node:crypto"
import { from } from "@atlas/db"
import { defineTool, type Tool } from "@atlas/mcp"
import { db } from "../../db/index.ts"
import { triggerDeploy } from "../../deploy/index.ts"
import {
  getProject,
  getProjectByName,
  isValidSlug,
  listProjects,
  slugify,
} from "../../projects/index.ts"
import { type Deployment, deployments, type Project, projects } from "../../schema/index.ts"

// Kettle's MCP domain tools. Each one wraps an existing in-process module
// (src/projects, src/deploy, src/schema) rather than going over HTTP, so the
// MCP surface stays in lockstep with the dashboard API. Handlers ignore the
// AtlasMcpContext argument on purpose — kettle's modules use the singleton
// `db` connection, so the tools need no per-request context.

const latestDeployment = (projectId: number): Promise<Deployment | null> =>
  db.one<Deployment>(
    from(deployments)
      .where((q) => q("projectId").equals(projectId))
      .orderBy("id", "DESC")
      .limit(1),
  )

// kettle.projects.create — mirrors POST /projects. Write tool.
const createProject = defineTool({
  name: "kettle.projects.create",
  description:
    "Create a Kettle project. Returns the new project's id and slug name. The name is slugified; a repoUrl can be set now or later. Write operation.",
  inputSchema: {
    type: "object",
    properties: {
      name: { type: "string", description: "Human name; slugified to a lowercase a-z0-9- slug." },
      repoUrl: {
        type: "string",
        description: "Git remote to deploy from (https or git@). Optional.",
      },
      branch: { type: "string", description: "Branch to track. Defaults to 'main'." },
    },
    required: ["name"],
  },
  handler: async (params) => {
    const name = slugify(String(params.name ?? ""))
    if (!isValidSlug(name)) throw new Error("Invalid project name")
    if (await getProjectByName(name)) throw new Error("Project name already taken")

    const repoUrl = params.repoUrl ? String(params.repoUrl) : null
    const branch = params.branch ? String(params.branch) : "main"

    const rows = await db.execute(
      from(projects)
        .insert({
          name,
          repoUrl,
          branch,
          buildType: "auto",
          rootDir: ".",
          buildCommand: null,
          startCommand: null,
          internalPort: 3000,
          webhookSecret: randomBytes(24).toString("hex"),
          autoDeploy: 1,
        })
        .returning("id", "name"),
    )
    return rows[0]
  },
})

// kettle.projects.list — mirrors GET /projects (each project + its latest deployment).
const listProjectsTool = defineTool({
  name: "kettle.projects.list",
  description:
    "List all Kettle projects, each annotated with its most recent deployment (status, commit, etc.). Read operation.",
  inputSchema: { type: "object", properties: {} },
  handler: async () => {
    const rows = await listProjects()
    return Promise.all(rows.map(async (p) => ({ ...p, latest: await latestDeployment(p.id) })))
  },
})

// kettle.deploy — mirrors POST /projects/:id/deploy. Write tool.
const deployTool = defineTool({
  name: "kettle.deploy",
  description:
    "Trigger a deployment for a project by id. Queues a build+release pipeline and returns the new deployment row (id, status). Requires the project to have a repoUrl. Write operation.",
  inputSchema: {
    type: "object",
    properties: {
      projectId: { type: "number", description: "Numeric id of the project to deploy." },
    },
    required: ["projectId"],
  },
  handler: async (params) => {
    const projectId = Number(params.projectId)
    if (!Number.isInteger(projectId)) throw new Error("projectId must be an integer")
    const project = await getProject(projectId)
    if (!project) throw new Error("Project not found")
    if (!project.repoUrl) throw new Error("Set a repository URL before deploying")
    return triggerDeploy(projectId, "mcp")
  },
})

// kettle.deployments.get — mirrors GET /deployments/:id.
const getDeploymentTool = defineTool({
  name: "kettle.deployments.get",
  description:
    "Fetch a single deployment by id, including status, commit sha, image, and timestamps. Read operation.",
  inputSchema: {
    type: "object",
    properties: {
      deploymentId: { type: "number", description: "Numeric id of the deployment." },
    },
    required: ["deploymentId"],
  },
  handler: async (params) => {
    const deploymentId = Number(params.deploymentId)
    if (!Number.isInteger(deploymentId)) throw new Error("deploymentId must be an integer")
    const dep = await db.one<Deployment>(
      from(deployments).where((q) => q("id").equals(deploymentId)),
    )
    if (!dep) throw new Error("Deployment not found")
    return dep
  },
})

export const kettleTools = (): Tool[] => [
  createProject,
  listProjectsTool,
  deployTool,
  getDeploymentTool,
]

export type { Deployment, Project }

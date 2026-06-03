const BASE = "/api"

let token: string | null = localStorage.getItem("kettle_token")

export const getToken = (): string | null => token
export const setToken = (t: string | null): void => {
  token = t
  if (t) localStorage.setItem("kettle_token", t)
  else localStorage.removeItem("kettle_token")
}

const req = async <T = any>(method: string, path: string, body?: unknown): Promise<T> => {
  const headers: Record<string, string> = {}
  if (body !== undefined) headers["content-type"] = "application/json"
  if (token) headers.authorization = `Bearer ${token}`
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (res.status === 401) {
    setToken(null)
    location.hash = "#/login"
  }
  const text = await res.text()
  const data = text ? JSON.parse(text) : null
  if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status})`)
  return data as T
}

export type Deployment = {
  id: number
  projectId: number
  status: string
  trigger: string
  commitSha: string | null
  image: string | null
  hostPort: number | null
  error: string | null
  createdAt: string
  finishedAt: string | null
}

export type Project = {
  id: number
  name: string
  repoUrl: string | null
  branch: string
  buildType: string
  rootDir: string
  buildCommand: string | null
  startCommand: string | null
  internalPort: number
  webhookSecret: string | null
  autoDeploy: number
  createdAt: string
  latest?: Deployment | null
}

export type EnvVar = { id: number; projectId: number; key: string; value: string }
export type Domain = { id: number; projectId: number; host: string }
export type ProjectDetail = Project & {
  deployments: Deployment[]
  env: EnvVar[]
  domains: Domain[]
}
export type DatabaseInfo = { engine: string; dbName: string; dbUser: string; url: string }
export type SystemInfo = {
  docker: boolean
  appDomain: string
  edgeEnabled: boolean
  edgeHttpPort: number
  projects: number
  live: number
  routes: Array<{ host: string; port: number; project: string }>
  postgres: { provisioned: boolean; running: boolean }
}

export const checkSetup = (): Promise<{ needsSetup: boolean }> => req("GET", "/setup")

export const login = async (email: string, password: string): Promise<void> => {
  const data = await req<{ token: string }>("POST", "/login", { email, password })
  setToken(data.token)
}

export const signup = async (email: string, password: string): Promise<void> => {
  const data = await req<{ token: string }>("POST", "/signup", { email, password })
  setToken(data.token)
}

export const system = (): Promise<SystemInfo> => req("GET", "/system")
export const listProjects = (): Promise<Project[]> => req("GET", "/projects")
export const getProject = (id: number): Promise<ProjectDetail> => req("GET", `/projects/${id}`)
export const createProject = (data: Partial<Project>): Promise<{ id: number; name: string }> =>
  req("POST", "/projects", data)
export const updateProject = (id: number, data: Partial<Project>): Promise<Project> =>
  req("PATCH", `/projects/${id}`, data)
export const deleteProject = (id: number): Promise<void> => req("DELETE", `/projects/${id}`)
export const rotateWebhook = (id: number): Promise<{ webhookSecret: string }> =>
  req("POST", `/projects/${id}/webhook/rotate`)

export const deploy = (id: number): Promise<Deployment> => req("POST", `/projects/${id}/deploy`)
export const getDeployment = (id: number): Promise<Deployment> => req("GET", `/deployments/${id}`)
export const stopDeployment = (id: number): Promise<void> => req("POST", `/deployments/${id}/stop`)
export const redeploy = (id: number): Promise<void> => req("POST", `/deployments/${id}/redeploy`)

export const getEnv = (id: number): Promise<EnvVar[]> => req("GET", `/projects/${id}/env`)
export const setEnv = (
  id: number,
  vars: Array<{ key: string; value: string }>,
): Promise<EnvVar[]> => req("PUT", `/projects/${id}/env`, { vars })

export const getDatabase = (id: number): Promise<DatabaseInfo | null> =>
  req("GET", `/projects/${id}/database`)
export const attachDatabase = (id: number): Promise<DatabaseInfo> =>
  req("POST", `/projects/${id}/database`)
export const detachDatabase = (id: number): Promise<void> =>
  req("DELETE", `/projects/${id}/database`)

export const addDomain = (id: number, host: string): Promise<Domain> =>
  req("POST", `/projects/${id}/domains`, { host })
export const removeDomain = (domainId: number): Promise<void> =>
  req("DELETE", `/domains/${domainId}`)

// EventSource can't send headers; the log stream authenticates via ?token=.
export const logStream = (deploymentId: number): EventSource =>
  new EventSource(
    `${BASE}/deployments/${deploymentId}/logs?token=${encodeURIComponent(token ?? "")}`,
  )

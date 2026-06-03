import { exec, execCapture, type LineSink } from "../exec/index.ts"

export const LABEL = "io.kettle.project"
export const DEPLOY_LABEL = "io.kettle.deployment"

export const dockerAvailable = async (): Promise<boolean> => {
  try {
    const r = await exec(["docker", "version", "--format", "{{.Server.Version}}"])
    return r.code === 0
  } catch {
    return false
  }
}

export const buildImage = async (opts: {
  tag: string
  contextDir: string
  dockerfile?: string
  onLine?: LineSink
}): Promise<void> => {
  const cmd = ["docker", "build", "-t", opts.tag]
  if (opts.dockerfile) cmd.push("-f", opts.dockerfile)
  cmd.push(opts.contextDir)
  const result = await exec(cmd, { onLine: opts.onLine })
  if (result.code !== 0) throw new Error(`docker build failed (exit ${result.code})`)
}

export const runContainer = async (opts: {
  name: string
  image: string
  hostPort: number
  internalPort: number
  env: Record<string, string>
  project: string
  deploymentId: number
  network?: string
}): Promise<string> => {
  const cmd = [
    "docker",
    "run",
    "-d",
    "--name",
    opts.name,
    "--restart",
    "unless-stopped",
    "-p",
    `127.0.0.1:${opts.hostPort}:${opts.internalPort}`,
    "--label",
    `${LABEL}=${opts.project}`,
    "--label",
    `${DEPLOY_LABEL}=${opts.deploymentId}`,
  ]
  if (opts.network) cmd.push("--network", opts.network)
  for (const [k, v] of Object.entries(opts.env)) cmd.push("-e", `${k}=${v}`)
  cmd.push("-e", `PORT=${opts.internalPort}`)
  cmd.push(opts.image)
  return execCapture(cmd)
}

// Idempotently ensure a user-defined bridge network exists.
export const ensureNetwork = async (name: string): Promise<void> => {
  const r = await exec(["docker", "network", "inspect", name])
  if (r.code === 0) return
  await execCapture(["docker", "network", "create", name])
}

// Run a command inside a running container, throwing on non-zero exit.
export const execIn = (container: string, cmd: string[], env: Record<string, string> = {}) => {
  const full = ["docker", "exec"]
  for (const [k, v] of Object.entries(env)) full.push("-e", `${k}=${v}`)
  full.push(container, ...cmd)
  return execCapture(full)
}

export const stopContainer = async (id: string): Promise<void> => {
  await exec(["docker", "stop", "-t", "10", id])
}

export const removeContainer = async (id: string): Promise<void> => {
  await exec(["docker", "rm", "-f", id])
}

// Remove any container named `name`, ignoring "no such container" errors.
export const removeByName = async (name: string): Promise<void> => {
  await exec(["docker", "rm", "-f", name])
}

export const isRunning = async (id: string): Promise<boolean> => {
  const r = await exec(["docker", "inspect", "-f", "{{.State.Running}}", id])
  return r.code === 0 && r.output.trim() === "true"
}

export const containerLogs = (
  id: string,
  opts: { follow?: boolean; tail?: number; onLine: LineSink },
): { stop: () => void } => {
  const cmd = ["docker", "logs"]
  if (opts.follow) cmd.push("-f")
  if (opts.tail) cmd.push("--tail", String(opts.tail))
  cmd.push(id)
  const proc = Bun.spawn({ cmd, stdout: "pipe", stderr: "pipe" })

  const pump = async (stream: ReadableStream<Uint8Array>) => {
    const reader = stream.getReader()
    const decoder = new TextDecoder()
    let buffer = ""
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let nl = buffer.indexOf("\n")
      while (nl !== -1) {
        opts.onLine(buffer.slice(0, nl), "stdout")
        buffer = buffer.slice(nl + 1)
        nl = buffer.indexOf("\n")
      }
    }
  }
  void pump(proc.stdout as ReadableStream<Uint8Array>)
  void pump(proc.stderr as ReadableStream<Uint8Array>)

  return { stop: () => proc.kill() }
}

// List host ports currently bound by running kettle containers.
export const usedHostPorts = async (): Promise<Set<number>> => {
  const r = await exec(["docker", "ps", "--filter", `label=${LABEL}`, "--format", "{{.Ports}}"])
  const ports = new Set<number>()
  if (r.code !== 0) return ports
  for (const m of r.output.matchAll(/127\.0\.0\.1:(\d+)->/g)) {
    ports.add(Number(m[1]))
  }
  return ports
}

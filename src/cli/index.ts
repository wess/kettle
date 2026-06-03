import { cli, command, flag, type ParsedArgs } from "@atlas/cli"
import { type CliConfig, loadConfig, saveConfig } from "./config.ts"

const c = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  orange: "\x1b[38;5;208m",
  blue: "\x1b[34m",
}

const statusColor = (s: string): string =>
  s === "live" ? c.green : s === "failed" ? c.red : s === "stopped" ? c.dim : c.yellow

const api = async <T = any>(
  cfg: CliConfig,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> => {
  const res = await fetch(`${cfg.url}/api${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...(cfg.token ? { authorization: `Bearer ${cfg.token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  const data = text ? JSON.parse(text) : null
  if (!res.ok) throw new Error(data?.error ?? `${res.status} ${path}`)
  return data as T
}

const need = (cfg: CliConfig): CliConfig => {
  if (!cfg.token) {
    console.error(`${c.red}Not logged in.${c.reset} Run: kettle login`)
    process.exit(1)
  }
  return cfg
}

const findProject = async (cfg: CliConfig, name: string) => {
  const projects = await api<any[]>(cfg, "GET", "/projects")
  const p = projects.find((p) => p.name === name)
  if (!p) {
    console.error(`${c.red}No project named "${name}".${c.reset}`)
    process.exit(1)
  }
  return p
}

const streamLogs = async (cfg: CliConfig, deploymentId: number): Promise<void> => {
  // Poll history; the control plane persists every line.
  let seen = 0
  for (;;) {
    const [dep, lines] = await Promise.all([
      api<any>(cfg, "GET", `/deployments/${deploymentId}`),
      api<any[]>(cfg, "GET", `/deployments/${deploymentId}/logs/history`),
    ])
    for (const l of lines.slice(seen)) {
      const col = l.stream === "runtime" ? c.blue : c.dim
      console.log(`${col}${l.line}${c.reset}`)
    }
    seen = lines.length
    if (["live", "failed", "stopped"].includes(dep.status)) {
      const col = statusColor(dep.status)
      console.log(`\n${col}${c.bold}● ${dep.status}${c.reset}`)
      return
    }
    await Bun.sleep(1000)
  }
}

const commands = [
  command("login", {
    description: "Authenticate against a Kettle server",
    flags: {
      url: flag("u", { type: "string", description: "Server URL" }),
      email: flag("e", { type: "string" }),
      password: flag("p", { type: "string" }),
    },
    run: async ({ flags }: ParsedArgs) => {
      const cfg = await loadConfig()
      const url = (flags.url as string) ?? cfg.url
      const email = (flags.email as string) ?? prompt("Email:") ?? ""
      const password = (flags.password as string) ?? prompt("Password:") ?? ""
      const { token } = await api<{ token: string }>({ url }, "POST", "/login", { email, password })
      await saveConfig({ url, token })
      console.log(`${c.green}✓ Logged in to ${url}${c.reset}`)
    },
  }),

  command("status", {
    description: "Show server status",
    run: async () => {
      const cfg = need(await loadConfig())
      const s = await api<any>(cfg, "GET", "/system")
      console.log(`${c.bold}Kettle${c.reset} ${c.dim}${cfg.url}${c.reset}`)
      console.log(`  docker   ${s.docker ? `${c.green}ready` : `${c.red}down`}${c.reset}`)
      console.log(`  domain   ${s.appDomain}`)
      console.log(
        `  projects ${s.projects}   live ${c.green}${s.live}${c.reset}   routes ${s.routes.length}`,
      )
    },
  }),

  command("projects", {
    description: "List projects",
    run: async () => {
      const cfg = need(await loadConfig())
      const projects = await api<any[]>(cfg, "GET", "/projects")
      if (projects.length === 0) return console.log(`${c.dim}No projects.${c.reset}`)
      for (const p of projects) {
        const st = p.latest?.status ?? "none"
        console.log(
          `${c.orange}${p.name.padEnd(20)}${c.reset} ${statusColor(st)}${st.padEnd(10)}${c.reset} ${c.dim}${p.repoUrl ?? ""}${c.reset}`,
        )
      }
    },
  }),

  command("deploy", {
    description: "Deploy a project: kettle deploy <name>",
    flags: { detach: flag("d", { type: "boolean", description: "Don't follow logs" }) },
    run: async ({ args, flags }: ParsedArgs) => {
      const cfg = need(await loadConfig())
      const name = args[0]
      if (!name) {
        console.error("Usage: kettle deploy <name>")
        process.exit(1)
      }
      const p = await findProject(cfg, name)
      const dep = await api<any>(cfg, "POST", `/projects/${p.id}/deploy`)
      console.log(`${c.orange}→ Deploying ${name} (#${dep.id})${c.reset}`)
      if (flags.detach) return
      await streamLogs(cfg, dep.id)
    },
  }),

  command("logs", {
    description: "Stream logs for a project's latest deployment: kettle logs <name>",
    run: async ({ args }: ParsedArgs) => {
      const cfg = need(await loadConfig())
      const name = args[0]
      if (!name) {
        console.error("Usage: kettle logs <name>")
        process.exit(1)
      }
      const detail = await api<any>(cfg, "GET", `/projects/${(await findProject(cfg, name)).id}`)
      const latest = detail.deployments[0]
      if (!latest) {
        console.log(`${c.dim}No deployments.${c.reset}`)
        return
      }
      await streamLogs(cfg, latest.id)
    },
  }),
]

export const runCli = (): void => cli("kettle", commands)

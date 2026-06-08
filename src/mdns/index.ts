import { config } from "../config/index.ts"
import { exec } from "../exec/index.ts"

// One long-lived `avahi-publish` process per published host keeps its mDNS
// A-record alive. We reconcile the set whenever the live routes change.
const published = new Map<string, { kill: () => void }>()
let hostIp: string | null = null
let warned = false

const detectIp = async (): Promise<string> => {
  if (config.mdnsIp) return config.mdnsIp
  if (hostIp) return hostIp
  // The src address of the default route is the real LAN IP — avoids picking
  // up the docker bridge (172.x) that `hostname -I` may list first.
  const route = await exec(["ip", "-4", "route", "get", "1.1.1.1"])
  hostIp = route.output.match(/\bsrc\s+(\d+\.\d+\.\d+\.\d+)/)?.[1] ?? null
  if (!hostIp) {
    // Fallback: prefer a real LAN address. Skip loopback, link-local, and the
    // docker bridge range (172.16-31.x) — `hostname -I` often lists docker0
    // first, which would advertise an IP unreachable from the LAN.
    const usable = (ip: string): boolean =>
      !!ip && !ip.startsWith("127.") && !ip.startsWith("169.254.") && !/^172\.(1[6-9]|2\d|3[01])\./.test(ip)
    const r = await exec(["hostname", "-I"])
    hostIp = r.output.trim().split(/\s+/).find(usable) ?? "127.0.0.1"
  }
  return hostIp
}

// Publish an mDNS alias (-> this host's IP) for every live `.local` host, and
// retire aliases for hosts that are no longer routed. No-op unless enabled.
export const syncMdns = async (hosts: string[]): Promise<void> => {
  if (!config.mdnsPublish) return

  // The box already answers for its own name; only publish sub-names.
  const wanted = new Set(hosts.filter((h) => h.endsWith(".local") && h !== config.appDomain))

  for (const [host, handle] of published) {
    if (!wanted.has(host)) {
      handle.kill()
      published.delete(host)
    }
  }
  if (wanted.size === 0) return

  const ip = await detectIp()
  for (const host of wanted) {
    if (published.has(host)) continue
    try {
      const proc = Bun.spawn(["avahi-publish", "-a", "-R", host, ip], {
        stdout: "ignore",
        stderr: "ignore",
      })
      published.set(host, { kill: () => proc.kill() })
    } catch (e) {
      if (!warned) {
        console.error(
          `[kettle] mDNS publish unavailable (install avahi-utils): ${(e as Error).message}`,
        )
        warned = true
      }
    }
  }
}

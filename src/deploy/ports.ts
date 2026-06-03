import { config } from "../config/index.ts"
import { usedHostPorts } from "../docker/index.ts"

const reserved = new Set<number>()

const canBind = async (port: number): Promise<boolean> => {
  try {
    const server = Bun.listen({ hostname: "127.0.0.1", port, socket: { data() {} } })
    server.stop(true)
    return true
  } catch {
    return false
  }
}

// Pick a free host port in the configured range, avoiding live containers.
export const allocatePort = async (): Promise<number> => {
  const inUse = await usedHostPorts()
  for (let port = config.portRangeStart; port <= config.portRangeEnd; port++) {
    if (inUse.has(port) || reserved.has(port)) continue
    if (await canBind(port)) {
      reserved.add(port)
      // Release the soft reservation once the container has had time to bind.
      setTimeout(() => reserved.delete(port), 30_000)
      return port
    }
  }
  throw new Error("no free host ports available")
}

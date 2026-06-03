import { mkdirSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

export type CliConfig = { url: string; token?: string }

const dir = join(homedir(), ".kettle")
const file = join(dir, "config.json")

export const loadConfig = async (): Promise<CliConfig> => {
  try {
    return JSON.parse(await Bun.file(file).text()) as CliConfig
  } catch {
    return { url: process.env.KETTLE_URL ?? "http://localhost:4000" }
  }
}

export const saveConfig = async (cfg: CliConfig): Promise<void> => {
  mkdirSync(dir, { recursive: true })
  await Bun.write(file, JSON.stringify(cfg, null, 2))
}

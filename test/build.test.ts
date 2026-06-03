import { expect, test, describe, beforeAll, afterAll } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { detectStack } from "../src/build/detect.ts"
import { generateDockerfile } from "../src/build/dockerfile.ts"
import type { Project } from "../src/schema/index.ts"

const project = (over: Partial<Project> = {}): Project => ({
  id: 1, name: "app", repoUrl: null, branch: "main", buildType: "auto",
  rootDir: ".", buildCommand: null, startCommand: null, internalPort: 3000,
  createdAt: "", ...over,
})

let dir: string
beforeAll(() => { dir = mkdtempSync(join(tmpdir(), "kettle-")) })
afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe("detectStack", () => {
  test("Dockerfile wins", async () => {
    const d = mkdtempSync(join(tmpdir(), "k-"))
    await Bun.write(join(d, "Dockerfile"), "FROM scratch")
    await Bun.write(join(d, "package.json"), "{}")
    expect(await detectStack(d)).toBe("dockerfile")
    rmSync(d, { recursive: true, force: true })
  })
  test("bun lockfile -> bun", async () => {
    const d = mkdtempSync(join(tmpdir(), "k-"))
    await Bun.write(join(d, "package.json"), "{}")
    await Bun.write(join(d, "bun.lock"), "")
    expect(await detectStack(d)).toBe("bun")
    rmSync(d, { recursive: true, force: true })
  })
  test("bun script reference -> bun", async () => {
    const d = mkdtempSync(join(tmpdir(), "k-"))
    await Bun.write(join(d, "package.json"), JSON.stringify({ scripts: { start: "bun run index.ts" } }))
    expect(await detectStack(d)).toBe("bun")
    rmSync(d, { recursive: true, force: true })
  })
  test("node lockfile -> node", async () => {
    const d = mkdtempSync(join(tmpdir(), "k-"))
    await Bun.write(join(d, "package.json"), JSON.stringify({ scripts: { start: "node x.js" } }))
    await Bun.write(join(d, "package-lock.json"), "{}")
    expect(await detectStack(d)).toBe("node")
    rmSync(d, { recursive: true, force: true })
  })
  test("index.html -> static", async () => {
    const d = mkdtempSync(join(tmpdir(), "k-"))
    await Bun.write(join(d, "index.html"), "<html></html>")
    expect(await detectStack(d)).toBe("static")
    rmSync(d, { recursive: true, force: true })
  })
})

describe("generateDockerfile", () => {
  test("bun image + port", () => {
    const df = generateDockerfile({ stack: "bun", project: project(), pkg: { scripts: { start: "bun run index.ts" } }, internalPort: 3000 })
    expect(df).toContain("FROM oven/bun:1")
    expect(df).toContain("EXPOSE 3000")
    expect(df).toContain("bun run start")
  })
  test("node image", () => {
    const df = generateDockerfile({ stack: "node", project: project(), pkg: null, internalPort: 8080 })
    expect(df).toContain("node:22-slim")
    expect(df).toContain("EXPOSE 8080")
  })
  test("static uses nginx", () => {
    const df = generateDockerfile({ stack: "static", project: project(), pkg: null, internalPort: 80 })
    expect(df).toContain("nginx:alpine")
  })
  test("custom start command honored", () => {
    const df = generateDockerfile({ stack: "bun", project: project({ startCommand: "bun server.ts" }), pkg: null, internalPort: 3000 })
    expect(df).toContain("bun server.ts")
  })
})

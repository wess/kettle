import { createHmac } from "node:crypto"
import { describe, expect, test } from "bun:test"
import { parseRepoSlug } from "../src/projects/index.ts"

describe("parseRepoSlug", () => {
  test("https URL with .git", () => {
    expect(parseRepoSlug("https://git.local/wess/myapp.git")).toEqual({ owner: "wess", name: "myapp" })
  })
  test("http URL without .git", () => {
    expect(parseRepoSlug("http://git.local/Wess/MyApp")).toEqual({ owner: "wess", name: "myapp" })
  })
  test("scp-style git@host:owner/name.git", () => {
    expect(parseRepoSlug("git@git.local:wess/myapp.git")).toEqual({ owner: "wess", name: "myapp" })
  })
  test("local path", () => {
    expect(parseRepoSlug("/tmp/kettletest")).toEqual({ owner: "tmp", name: "kettletest" })
  })
  test("null / too short", () => {
    expect(parseRepoSlug(null)).toBeNull()
    expect(parseRepoSlug("justone")).toBeNull()
  })
})

describe("webhook signature (GitHub/Tangle convention)", () => {
  const sign = (secret: string, body: string) =>
    `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`

  test("signature is stable over the exact body", () => {
    const body = JSON.stringify({ event: "push", repository: { owner: "wess", name: "myapp" } })
    expect(sign("s3cr3t", body)).toBe(sign("s3cr3t", body))
    expect(sign("s3cr3t", body)).not.toBe(sign("other", body))
  })
})

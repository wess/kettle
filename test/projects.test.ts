import { expect, test, describe } from "bun:test"
import { slugify, isValidSlug } from "../src/projects/index.ts"

describe("slugify", () => {
  test("lowercases and hyphenates", () => {
    expect(slugify("My Cool App")).toBe("my-cool-app")
  })
  test("strips leading/trailing separators", () => {
    expect(slugify("  --Hello!! ")).toBe("hello")
  })
  test("collapses runs of non-alphanumerics", () => {
    expect(slugify("a___b...c")).toBe("a-b-c")
  })
  test("truncates to 48 chars", () => {
    expect(slugify("x".repeat(80)).length).toBe(48)
  })
})

describe("isValidSlug", () => {
  test("accepts valid slugs", () => {
    expect(isValidSlug("my-app")).toBe(true)
    expect(isValidSlug("app1")).toBe(true)
  })
  test("rejects invalid slugs", () => {
    expect(isValidSlug("")).toBe(false)
    expect(isValidSlug("-leading")).toBe(false)
    expect(isValidSlug("UPPER")).toBe(false)
    expect(isValidSlug("has space")).toBe(false)
  })
})

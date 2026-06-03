import { expect, test, describe } from "bun:test"
import { setRoutes, lookup, allRoutes, type Target } from "../src/proxy/table.ts"

describe("routing table", () => {
  test("lookup is case-insensitive and returns the target", () => {
    const t: Target = { port: 20000, projectId: 1, project: "hello" }
    setRoutes(new Map([["hello.krillin.local", t]]))
    expect(lookup("hello.krillin.local")).toEqual(t)
    expect(lookup("HELLO.krillin.local")).toEqual(t)
    expect(lookup("nope.krillin.local")).toBeUndefined()
  })

  test("allRoutes lists host + target", () => {
    setRoutes(new Map([["a.krillin.local", { port: 20001, projectId: 2, project: "a" }]]))
    expect(allRoutes()).toEqual([{ host: "a.krillin.local", port: 20001, projectId: 2, project: "a" }])
  })

  test("setRoutes replaces the table wholesale", () => {
    setRoutes(new Map())
    expect(allRoutes()).toEqual([])
    expect(lookup("a.krillin.local")).toBeUndefined()
  })
})

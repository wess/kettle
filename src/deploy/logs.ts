import { from } from "@atlas/db"
import { db } from "../db/index.ts"
import { logs } from "../schema/index.ts"

export type LogEvent = { deploymentId: number; stream: string; line: string; at: number }

const subscribers = new Map<number, Set<(e: LogEvent) => void>>()

// Persist a log line and fan it out to any live SSE subscribers.
export const emitLog = (deploymentId: number, stream: string, line: string): void => {
  const event: LogEvent = { deploymentId, stream, line, at: Date.now() }
  void db.execute(from(logs).insert({ deploymentId, stream, line })).catch(() => {})
  const subs = subscribers.get(deploymentId)
  if (subs) for (const cb of subs) cb(event)
}

export const subscribeLogs = (deploymentId: number, cb: (e: LogEvent) => void): (() => void) => {
  let subs = subscribers.get(deploymentId)
  if (!subs) {
    subs = new Set()
    subscribers.set(deploymentId, subs)
  }
  subs.add(cb)
  return () => {
    subs?.delete(cb)
    if (subs && subs.size === 0) subscribers.delete(deploymentId)
  }
}

export const historyFor = (deploymentId: number) =>
  db.all(
    from(logs)
      .where((q) => q("deploymentId").equals(deploymentId))
      .orderBy("id", "ASC"),
  )

import { useEffect, useRef, useState } from "react"
import * as api from "../api.ts"

type Line = { stream: string; line: string }

// Live-tailing log console backed by the SSE endpoint.
export const LogConsole = ({
  deploymentId,
  onStatus,
}: {
  deploymentId: number
  onStatus?: (s: string) => void
}) => {
  const [lines, setLines] = useState<Line[]>([])
  const boxRef = useRef<HTMLDivElement>(null)
  const stick = useRef(true)

  useEffect(() => {
    setLines([])
    const es = api.logStream(deploymentId)
    es.addEventListener("log", (e) => {
      const data = JSON.parse((e as MessageEvent).data) as Line
      setLines((prev) => [...prev, data])
    })
    es.addEventListener("status", (e) => {
      const data = JSON.parse((e as MessageEvent).data) as { status: string }
      onStatus?.(data.status)
    })
    es.onerror = () => {} // EventSource auto-reconnects
    return () => es.close()
  }, [deploymentId])

  useEffect(() => {
    if (stick.current && boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight
  }, [lines])

  const onScroll = () => {
    const el = boxRef.current
    if (!el) return
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
  }

  return (
    <div className="console" ref={boxRef} onScroll={onScroll}>
      {lines.length === 0 ? (
        <span className="empty">Waiting for output…</span>
      ) : (
        lines.map((l, i) => (
          <span
            key={i}
            className={`ln ${l.stream === "runtime" ? "runtime" : ""} ${/✗|error|failed/i.test(l.line) ? "err" : ""}`}
          >
            {l.line || " "}
          </span>
        ))
      )}
    </div>
  )
}

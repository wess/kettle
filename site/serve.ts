// Tiny static server for the Kettle marketing + docs site.
//
//   bun site/serve.ts            → http://localhost:4321
//   PORT=8000 bun site/serve.ts  → http://localhost:8000
//
// Serves the repository root so the landing page (/site) and the rendered
// Markdown docs (/docs/*.md) both resolve. No build step, no dependencies.

import { join, normalize } from "node:path"

const root = normalize(join(import.meta.dir, ".."))
const port = Number(Bun.env.PORT ?? 4321)

const types: Record<string, string> = {
  html: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  svg: "image/svg+xml",
  md: "text/markdown; charset=utf-8",
  json: "application/json; charset=utf-8",
  png: "image/png",
  jpg: "image/jpeg",
  ico: "image/x-icon",
  woff2: "font/woff2",
}

const contentType = (path: string): string => types[path.split(".").pop() ?? ""] ?? "application/octet-stream"

// Resolve a request path to a file inside root, blocking traversal.
const resolve = (pathname: string): string | null => {
  let rel = decodeURIComponent(pathname)
  if (rel === "/" || rel === "") rel = "/site/index.html"
  const full = normalize(join(root, rel))
  if (!full.startsWith(root)) return null
  return full
}

Bun.serve({
  port,
  async fetch(req) {
    const { pathname } = new URL(req.url)
    const full = resolve(pathname)
    if (!full) return new Response("Forbidden", { status: 403 })

    const file = Bun.file(full)
    if (await file.exists()) {
      return new Response(file, { headers: { "content-type": contentType(full) } })
    }
    return new Response("Not found", { status: 404 })
  },
})

console.log(`🫖  Kettle site → http://localhost:${port}`)

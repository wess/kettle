// Docs reader: fetch a Markdown file from /docs, render it, build nav + TOC.
// Self-contained — no external Markdown library.

const ORDER = [
  ["index", "Overview"],
  ["quickstart", "Quickstart"],
  ["installation", "Installation"],
  ["concepts", "Concepts"],
  ["deployments", "Deployments"],
  ["builds", "Builds"],
  ["environment", "Environment"],
  ["configuration", "Configuration"],
  ["routing", "Routing"],
  ["domains", "Domains"],
  ["databases", "Databases"],
  ["webhooks", "Webhooks"],
  ["cli", "CLI"],
  ["api", "HTTP API"],
  ["logs", "Logs"],
  ["security", "Security"],
  ["troubleshooting", "Troubleshooting"],
  ["faq", "FAQ"],
]
const TITLES = Object.fromEntries(ORDER)
const NAMES = ORDER.map(([n]) => n)

const content = document.getElementById("content")
const tocEl = document.getElementById("toc")
const pagerEl = document.getElementById("pager")
const sidebar = document.getElementById("sidebar")

// ---- helpers ----
const escapeHtml = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

// GitHub-style heading slug, so cross-doc #fragments resolve.
const slug = (s) =>
  s
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s/g, "-")

const parseHash = () => {
  const raw = location.hash.replace(/^#/, "")
  const [doc, ...rest] = raw.split("/")
  return { doc: NAMES.includes(doc) ? doc : "index", frag: rest.join("/") }
}

// Rewrite a Markdown link href for the single-page reader.
const rewriteHref = (href, currentDoc) => {
  if (/^(https?:|mailto:)/.test(href)) return { href, external: true }
  if (href.startsWith("#")) return { href: `#${currentDoc}/${slug(href.slice(1))}`, external: false }
  const md = href.match(/(?:^|\/)([\w]+)\.md(?:#(.+))?$/)
  if (md) {
    const name = md[1]
    const frag = md[2]
    return { href: `#${name}${frag ? `/${frag}` : ""}`, external: false }
  }
  if (href.startsWith("../")) return { href: `/${href.replace(/^\.\.\//, "")}`, external: false }
  return { href, external: false }
}

// ---- inline rendering ----
const inline = (text, currentDoc) => {
  const codes = []
  let s = escapeHtml(text).replace(/`([^`]+)`/g, (_, c) => {
    codes.push(c)
    return `\x00${codes.length - 1}\x00`
  })
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => {
    const { href: h, external } = rewriteHref(href.trim(), currentDoc)
    const attrs = external ? ' target="_blank" rel="noopener"' : ""
    return `<a href="${h}"${attrs}>${label}</a>`
  })
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
  s = s.replace(/\x00(\d+)\x00/g, (_, i) => `<code>${codes[+i]}</code>`)
  return s
}

const listItem = (text, currentDoc) => {
  const box = text.match(/^\[([ xX])\]\s+(.*)$/)
  if (box) {
    const checked = box[1].toLowerCase() === "x" ? " checked" : ""
    return `<li class="task"><input type="checkbox" disabled${checked}> ${inline(box[2], currentDoc)}</li>`
  }
  return `<li>${inline(text, currentDoc)}</li>`
}

// ---- block rendering ----
const renderMarkdown = (md, currentDoc) => {
  const lines = md.replace(/\r\n/g, "\n").split("\n")
  const out = []
  let i = 0
  const isTableSep = (l) => /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/.test(l) && l.includes("-")

  while (i < lines.length) {
    let line = lines[i]

    // blank
    if (/^\s*$/.test(line)) { i++; continue }

    // fenced code
    const fence = line.match(/^```(\w*)\s*$/)
    if (fence) {
      const buf = []
      i++
      while (i < lines.length && !/^```\s*$/.test(lines[i])) buf.push(lines[i++])
      i++ // closing fence
      out.push(`<pre><code>${escapeHtml(buf.join("\n"))}</code></pre>`)
      continue
    }

    // heading
    const h = line.match(/^(#{1,4})\s+(.*)$/)
    if (h) {
      const level = h[1].length
      const text = h[2].trim()
      if (level === 1) {
        out.push(`<h1>${inline(text, currentDoc)}</h1>`)
      } else {
        const id = slug(text)
        const anchor = `<a class="anchor" href="#${currentDoc}/${id}" aria-label="Link to section">#</a>`
        out.push(`<h${level} id="${id}">${inline(text, currentDoc)}${level <= 3 ? anchor : ""}</h${level}>`)
      }
      i++
      continue
    }

    // horizontal rule
    if (/^\s*---+\s*$/.test(line)) { out.push("<hr>"); i++; continue }

    // table
    if (line.includes("|") && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const cells = (l) => l.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map((c) => c.trim())
      const head = cells(line)
      i += 2
      const body = []
      while (i < lines.length && lines[i].includes("|") && !/^\s*$/.test(lines[i])) {
        body.push(cells(lines[i]))
        i++
      }
      const thead = `<thead><tr>${head.map((c) => `<th>${inline(c, currentDoc)}</th>`).join("")}</tr></thead>`
      const rows = body
        .map((r) => `<tr>${r.map((c) => `<td>${inline(c, currentDoc)}</td>`).join("")}</tr>`)
        .join("")
      out.push(`<table>${thead}<tbody>${rows}</tbody></table>`)
      continue
    }

    // blockquote
    if (/^\s*>/.test(line)) {
      const buf = []
      while (i < lines.length && /^\s*>/.test(lines[i])) {
        buf.push(lines[i].replace(/^\s*>\s?/, ""))
        i++
      }
      const inner = buf.join("\n").split(/\n{2,}/).map((p) => `<p>${inline(p.replace(/\n/g, " "), currentDoc)}</p>`).join("")
      out.push(`<blockquote>${inner}</blockquote>`)
      continue
    }

    // unordered list
    if (/^\s*[-*]\s+/.test(line)) {
      const buf = []
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        buf.push(listItem(lines[i].replace(/^\s*[-*]\s+/, ""), currentDoc))
        i++
      }
      out.push(`<ul>${buf.join("")}</ul>`)
      continue
    }

    // ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const buf = []
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        buf.push(`<li>${inline(lines[i].replace(/^\s*\d+\.\s+/, ""), currentDoc)}</li>`)
        i++
      }
      out.push(`<ol>${buf.join("")}</ol>`)
      continue
    }

    // paragraph (join soft-wrapped lines until a blank or a block starter)
    const buf = [line]
    i++
    while (
      i < lines.length &&
      !/^\s*$/.test(lines[i]) &&
      !/^(#{1,4})\s/.test(lines[i]) &&
      !/^```/.test(lines[i]) &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i]) &&
      !/^\s*>/.test(lines[i]) &&
      !/^\s*---+\s*$/.test(lines[i])
    ) {
      buf.push(lines[i])
      i++
    }
    out.push(`<p>${inline(buf.join(" "), currentDoc)}</p>`)
  }
  return out.join("\n")
}

// ---- copy buttons on code blocks ----
const addCopyButtons = () => {
  for (const pre of content.querySelectorAll("pre")) {
    const btn = document.createElement("button")
    btn.className = "code-copy"
    btn.type = "button"
    btn.textContent = "Copy"
    btn.addEventListener("click", async () => {
      const code = pre.querySelector("code")
      try {
        await navigator.clipboard.writeText(code.textContent)
        btn.textContent = "Copied"
        btn.classList.add("done")
        setTimeout(() => { btn.textContent = "Copy"; btn.classList.remove("done") }, 1400)
      } catch {
        btn.textContent = "⌘C"
      }
    })
    pre.appendChild(btn)
  }
}

// ---- table of contents ----
let spyObserver
const buildToc = () => {
  if (spyObserver) spyObserver.disconnect()
  const heads = [...content.querySelectorAll("h2, h3")]
  if (heads.length < 2) { tocEl.innerHTML = ""; return }
  const items = heads
    .map((h) => `<a href="#${parseHash().doc}/${h.id}" class="${h.tagName === "H3" ? "lvl3" : ""}" data-id="${h.id}">${h.textContent.replace(/#$/, "")}</a>`)
    .join("")
  tocEl.innerHTML = `<h5>On this page</h5>${items}`

  const links = new Map([...tocEl.querySelectorAll("a")].map((a) => [a.dataset.id, a]))
  spyObserver = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          for (const a of links.values()) a.classList.remove("active")
          links.get(e.target.id)?.classList.add("active")
        }
      }
    },
    { rootMargin: "-80px 0px -70% 0px", threshold: 0 },
  )
  for (const h of heads) spyObserver.observe(h)
}

// ---- pager ----
const buildPager = (doc) => {
  const idx = NAMES.indexOf(doc)
  const prev = idx > 0 ? NAMES[idx - 1] : null
  const next = idx < NAMES.length - 1 ? NAMES[idx + 1] : null
  const link = (name, dir) =>
    name
      ? `<a class="${dir}" href="#${name}"><span class="pager-label">${dir === "prev" ? "Previous" : "Next"}</span><span class="pager-title">${TITLES[name]}</span></a>`
      : `<span></span>`
  pagerEl.innerHTML = link(prev, "prev") + link(next, "next")
}

// ---- sidebar active state ----
const markActive = (doc) => {
  for (const a of sidebar.querySelectorAll("a[data-doc]")) {
    a.classList.toggle("active", a.dataset.doc === doc)
  }
}

// ---- load + render a doc ----
const cache = new Map()
let currentLoad = 0
const load = async () => {
  const { doc, frag } = parseHash()
  markActive(doc)
  const token = ++currentLoad

  let md = cache.get(doc)
  if (md === undefined) {
    content.innerHTML = `<p class="loading">Loading ${TITLES[doc]}…</p>`
    try {
      const res = await fetch(`/docs/${doc}.md`, { cache: "no-cache" })
      if (!res.ok) throw new Error(String(res.status))
      md = await res.text()
      cache.set(doc, md)
    } catch {
      if (token !== currentLoad) return
      content.innerHTML = `<h1>Couldn't load this page</h1><p>Try the <a href="#index">overview</a>, or read <code>docs/${doc}.md</code> directly.</p>`
      tocEl.innerHTML = ""
      buildPager(doc)
      return
    }
  }
  if (token !== currentLoad) return

  content.innerHTML = renderMarkdown(md, doc)
  addCopyButtons()
  buildToc()
  buildPager(doc)
  document.title = `${TITLES[doc]} — Kettle docs`
  sidebar.classList.remove("open")

  // Jump to a section fragment, or to the top.
  if (frag) {
    const target = document.getElementById(frag)
    if (target) { target.scrollIntoView(); return }
  }
  window.scrollTo(0, 0)
}

// ---- mobile sidebar toggle ----
const menuToggle = document.getElementById("menuToggle")
if (menuToggle) {
  menuToggle.addEventListener("click", () => {
    const open = sidebar.classList.toggle("open")
    menuToggle.setAttribute("aria-expanded", String(open))
  })
}

// Sidebar links set the hash.
for (const a of sidebar.querySelectorAll("a[data-doc]")) {
  a.setAttribute("href", `#${a.dataset.doc}`)
}

window.addEventListener("hashchange", load)
if (!location.hash) location.replace("#index")
load()

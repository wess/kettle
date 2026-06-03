// Landing-page interactions: sticky nav, scroll reveals, code tabs, copy buttons.

const nav = document.getElementById("nav")
const onScroll = () => nav.classList.toggle("scrolled", window.scrollY > 8)
onScroll()
window.addEventListener("scroll", onScroll, { passive: true })

// Reveal sections as they enter the viewport.
const reveals = document.querySelectorAll(".reveal")
if ("IntersectionObserver" in window && reveals.length) {
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add("in")
          io.unobserve(e.target)
        }
      }
    },
    { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
  )
  for (const el of reveals) io.observe(el)
} else {
  for (const el of reveals) el.classList.add("in")
}

// Code showcase tabs.
const tabs = document.querySelectorAll(".tab")
const panels = document.querySelectorAll(".panel")
for (const tab of tabs) {
  tab.addEventListener("click", () => {
    const name = tab.dataset.tab
    for (const t of tabs) t.classList.toggle("is-active", t === tab)
    for (const p of panels) p.classList.toggle("is-active", p.dataset.panel === name)
  })
}

// Copy buttons inside the showcase.
for (const btn of document.querySelectorAll(".copy")) {
  btn.addEventListener("click", async () => {
    const code = btn.parentElement.querySelector("code")
    if (!code) return
    try {
      await navigator.clipboard.writeText(code.textContent.trim())
      const prev = btn.textContent
      btn.textContent = "Copied"
      btn.classList.add("done")
      setTimeout(() => {
        btn.textContent = prev
        btn.classList.remove("done")
      }, 1400)
    } catch {
      btn.textContent = "Press ⌘C"
    }
  })
}

// Footer year.
const year = document.getElementById("year")
if (year) year.textContent = `© ${new Date().getFullYear()}`

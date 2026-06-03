# Kettle site

The marketing landing page and the in-browser documentation reader. Plain HTML, CSS, and a little
JavaScript — no build step and no external dependencies.

## Run it

```sh
bun site/serve.ts            # http://localhost:4321
PORT=8000 bun site/serve.ts  # pick a port
```

`serve.ts` serves the repository root so the landing page and the rendered Markdown docs both
resolve. The docs reader (`docs.html`) fetches the real files from `docs/*.md` and renders them
client-side, so the website and the handbook never drift apart.

## Layout

```
site/
├── index.html        landing page
├── docs.html         documentation reader (sidebar + content + on-page TOC)
├── serve.ts          zero-dependency Bun static server
├── styles/
│   ├── main.css      shared design system (used by both pages)
│   └── docs.css      docs reader layout
├── scripts/
│   ├── main.js       landing interactions (nav, reveals, tabs, copy)
│   └── docs.js       Markdown renderer + hash routing + TOC
└── assets/
    └── favicon.svg
```

## Editing docs

The reader pulls from the top-level `docs/` folder. Add a new page by dropping a Markdown file in
`docs/` and adding an entry to the `ORDER` array in `scripts/docs.js`. Cross-document links written as
`other.md#section` are rewritten to in-app routes automatically.

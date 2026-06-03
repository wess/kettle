# Builds

Kettle turns a source tree into a runnable Docker image. Either you ship your own `Dockerfile` and
Kettle uses it as-is, or Kettle detects the stack and generates one for you. This page explains the
detection rules, the generated Dockerfiles, and how to override them.

## Decision order

For each deploy, Kettle resolves a **build plan** from the checked-out source:

1. **Committed `Dockerfile`** — if the project root contains a `Dockerfile`, it is used verbatim. You
   own the build entirely.
2. **Explicit build type** — if the project's `buildType` is set to something other than `auto`
   (`bun`, `node`, `static`), that stack is used.
3. **Auto-detection** — otherwise Kettle inspects the tree and picks a stack.

The "project root" is `rootDir` relative to the repo (default `.`), which lets you deploy a
subdirectory of a monorepo.

## Stack detection

When `buildType` is `auto`, detection runs in this order:

| Result | Triggered when |
|--|--|
| `dockerfile` | A `Dockerfile` exists in the root. |
| `bun` | A `package.json` plus any of: `bun.lock`, `bun.lockb`, `bunfig.toml`, `engines.bun`, a script that invokes `bun`, or an `index.ts` with no node lockfile. |
| `node` | A `package.json` with a node lockfile (`package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`) and none of the Bun signals. |
| `static` | An `index.html` and no `package.json`. |
| `unknown` | None of the above. Kettle falls back to the Bun Dockerfile. |

The key disambiguation: a `package.json` with **no** node lockfile and an `index.ts` entry is treated
as **Bun**, not Node. Commit your lockfile to make the intent unambiguous.

## Generated Dockerfiles

When you don't ship a `Dockerfile`, Kettle generates one for the detected stack. The generated file is
written next to the source as `kettle.‹deploymentId›.dockerfile` and echoed into the build logs so you
can see exactly what ran.

### Bun (`oven/bun:1`)

```dockerfile
FROM oven/bun:1 AS base
WORKDIR /app
COPY package.json bun.lock* bun.lockb* ./
RUN bun install --frozen-lockfile || bun install
COPY . .
RUN <buildCommand>          # only if a build command or "build" script exists
ENV PORT=<internalPort>
EXPOSE <internalPort>
CMD ["sh","-c","<startCommand>"]
```

- **Build command** — the project's `buildCommand`, else `bun run build` if a `build` script exists,
  else nothing.
- **Start command** — the project's `startCommand`, else `bun run start` if a `start` script exists,
  else `bun run index.ts`.

### Node (`node:22-slim`)

```dockerfile
FROM node:22-slim AS base
WORKDIR /app
COPY package*.json ./
RUN npm ci || npm install
COPY . .
RUN <buildCommand>          # only if a build command or "build" script exists
ENV PORT=<internalPort>
EXPOSE <internalPort>
CMD ["sh","-c","<startCommand>"]
```

- **Build command** — `buildCommand`, else `npm run build` if a `build` script exists, else nothing.
- **Start command** — `startCommand`, else `npm run start` if a `start` script exists, else
  `node index.js`.

### Static (`nginx:alpine`)

If there's a build step, Kettle builds with Bun then copies the output into nginx; otherwise it serves
the directory directly:

```dockerfile
# with a build step
FROM oven/bun:1 AS build
WORKDIR /app
COPY . .
RUN bun install --frozen-lockfile || bun install || true
RUN <buildCommand>
FROM nginx:alpine
COPY --from=build /app/<outDir> /usr/share/nginx/html
EXPOSE 80
```

```dockerfile
# no build step — serve files as-is
FROM nginx:alpine
COPY <outDir> /usr/share/nginx/html
EXPOSE 80
```

- **Output directory** — `rootDir` if set to something other than `.`, else `dist` when there's a
  build step, else `.`.
- Static sites are always served on **port 80** regardless of the project's app-port setting.

## Customizing the build

You can influence the generated Dockerfile without writing one, from project **Settings** (or via
[`PATCH /api/projects/:id`](api.md#projects)):

| Setting | Field | Effect |
|--|--|--|
| Build type | `buildType` | Force `bun`/`node`/`static`, or `auto` to detect. |
| Root directory | `rootDir` | Build a subdirectory (monorepos). Default `.`. |
| Build command | `buildCommand` | Override the `RUN` build step. |
| Start command | `startCommand` | Override the container `CMD`. |
| App port | `internalPort` | The port your app listens on. Default `3000` (static ignores this and uses 80). |

When none of these is enough, commit a `Dockerfile` — it always wins.

## The port contract

Kettle injects `PORT=‹internalPort›` into the container and maps a host port from the
`20000–20999` range to it. **Your app must listen on the port given by `PORT`.** Most frameworks read
`process.env.PORT` / `Bun.env.PORT` by default. If your app hardcodes a port, either change it to read
`PORT` or set the project's app port to match. Static sites are served by nginx on 80 and need no
configuration.

## Environment during build vs. runtime

Project [environment variables](environment.md) are passed to the **running container**, not into the
`docker build`. If your build step needs a value (for example a build-time API base URL), bake it into
a committed `Dockerfile` with `ARG`/`ENV`, since the generated Dockerfiles don't forward project env
vars at build time.

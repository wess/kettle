# 🫖 Kettle

**Push a repo. Get a URL.**

Kettle is a self-hosted deployment platform — like Vercel, Heroku, Coolify, or Fly.io — built on
[Atlas](https://github.com/wess/atlas) and [Bun](https://bun.sh). Point it at a Git repository and
Kettle clones it, auto-detects the stack, builds a Docker image, runs the container, health-checks
it, and routes traffic to it with zero-downtime swaps. The whole control plane is a single Bun
process backed by SQLite — no Redis, no message queue, no external services.

Built to run `krillin.local`.

<p>
  <img alt="runtime: bun" src="https://img.shields.io/badge/runtime-bun%20%E2%89%A5%201.3-f9f1e1">
  <img alt="license: apache 2.0" src="https://img.shields.io/badge/license-Apache--2.0-ff7a18">
  <img alt="control plane: sqlite" src="https://img.shields.io/badge/control%20plane-sqlite-003b57">
  <img alt="status: alpha" src="https://img.shields.io/badge/status-alpha-yellow">
</p>

---

## Contents

- [What it does](#what-it-does)
- [Architecture](#architecture)
- [Requirements](#requirements)
- [Quick start](#quick-start)
- [Deploy your first app](#deploy-your-first-app)
- [Push-to-deploy](#push-to-deploy)
- [Managed databases](#managed-databases)
- [How a build is chosen](#how-a-build-is-chosen)
- [Configuration](#configuration)
- [CLI](#cli)
- [Documentation](#documentation)
- [Website](#website)
- [Tests](#tests)
- [License](#license)

---

## What it does

- **Git-to-running-app** — clone a repo, auto-detect the stack (Bun / Node / static / Dockerfile),
  build an image, and run a container.
- **Zero-downtime deploys** — a new deployment boots and health-checks before the old one is retired.
- **Push-to-deploy** — a signed webhook from [Tangle](https://github.com/wess/tangle) (`git.local`)
  redeploys on every push. HMAC-verified, per-project secret.
- **Managed Postgres** — attach a private database to any project; Kettle provisions an isolated
  database + role on a shared instance and injects `DATABASE_URL`.
- **Dynamic edge routing** — a built-in reverse proxy maps `‹project›.krillin.local` (and custom
  domains) to the right container, rebuilt live from the database.
- **Dashboard** — projects, deployments, live build logs (SSE), env vars, databases, domains, settings.
- **CLI** — `kettle deploy`, `kettle logs`, `kettle status` from your terminal.
- **Control plane** — SQLite, no external services. The whole thing is one Bun process.

## Architecture

```
                    ┌──────────────── kettle (one bun process) ────────────────┐
  browser ───▶ :4000 control plane (API + dashboard, SQLite)                   │
                    │      │                                                    │
  *.krillin.local ─▶ :8080 edge proxy ──┐  syncs routing table from DB         │
                    │                    ▼                                      │
                    │   docker run ─▶ app container :20000  (built from Git)    │
                    └───────────────────────────────────────────────────────────┘
```

| Piece | Module | Atlas package |
|--|--|--|
| Config | `src/config` | `@atlas/config` |
| DB + schema | `src/db`, `src/schema` | `@atlas/db` |
| API routes | `src/routes` | `@atlas/server` |
| Auth (JWT) | `src/auth` | `@atlas/auth` |
| Reverse proxy | `src/proxy` | `@atlas/edge` |
| Deploy engine | `src/deploy`, `src/docker`, `src/git`, `src/build` | — (Bun + Docker CLI) |
| Push-to-deploy | `src/routes/hooks.ts` | — (HMAC) |
| Managed Postgres | `src/postgres` | — (Docker + psql) |
| CLI | `src/cli` | `@atlas/cli` |
| Dashboard | `src/web` | React 19 |

Atlas is consumed directly from the sibling checkout (`../atlas`) via the path aliases in
`tsconfig.json`. Keep both repos side by side under `~/Desktop/Dev`.

See [docs/concepts.md](docs/concepts.md) for the full architecture walkthrough.

## Requirements

- [Bun](https://bun.sh) ≥ 1.3
- Docker (the engine shells out to the `docker` CLI)
- `git`
- The Atlas repo checked out next to this one (`../atlas`)

## Quick start

```sh
bun install
cp .env.example .env        # set SECRET
EDGE_ENABLED=1 bun start    # or: bun dev  (hot reload)
```

- Dashboard → http://localhost:4000
- First visit → create the admin account. The first account registered becomes the admin;
  registration closes after that.
- Edge proxy → port `8080` (set to `80` on the server)

On first boot Kettle runs migrations, creates the admin user, and reconciles any containers still
running from a previous session.

Full install + production setup (systemd, mDNS, the `krillin.local` box) lives in
[docs/installation.md](docs/installation.md).

## Deploy your first app

**Dashboard:** New project → set a Git URL → **Deploy**. Watch the live logs; when it goes green,
visit `‹project›.krillin.local`.

**CLI:**

```sh
bun cli.ts login --url http://localhost:4000 --email you@example.com --password '••••••'
bun cli.ts deploy my-app      # streams build logs, exits when live
bun cli.ts logs my-app
bun cli.ts status
```

More in [docs/quickstart.md](docs/quickstart.md) and [docs/deployments.md](docs/deployments.md).

## Push-to-deploy

Each project has a deploy hook (Settings → **Deploy hook**). On Tangle (`git.local`) open the repo →
**Settings → Webhooks → Add**, paste Kettle's payload URL (`http://‹kettle›/api/hooks/tangle`) and
the project's secret, content-type `application/json`, event `push`. Every push to the project's
tracked branch redeploys it. The hook verifies an HMAC signature (`X-Tangle-Signature`); Tangle's
minimal push payload carries no ref, so Kettle redeploys the configured branch and records the real
commit SHA at clone time.

**Status back (green/red checks).** Set `TANGLE_URL` and `TANGLE_TOKEN` and Kettle posts commit
statuses back as it deploys — `pending` when the build starts, then `success`/`failure`.

Full walkthrough: [docs/webhooks.md](docs/webhooks.md).

## Managed databases

Project detail → **Database** → *Add PostgreSQL*. Kettle brings up one shared Postgres container
(`kettle-postgres`, named volume `kettle-pgdata`) the first time it's needed, then creates a
dedicated database + login role with a random password and injects `DATABASE_URL` on the next
deploy. App containers reach it over a private `kettle-data` Docker network; each role can connect
only to its own database. Detaching drops the database and role.

Details and isolation model: [docs/databases.md](docs/databases.md).

## How a build is chosen

1. A committed `Dockerfile` is always used as-is.
2. Otherwise the stack is auto-detected and a Dockerfile is generated:
   - **Bun** — `bun.lock`/`bun.lockb`/`bunfig.toml`, `engines.bun`, a `bun` script, or a `.ts`
     entry with no node lockfile → `oven/bun:1`
   - **Node** — a `package.json` with a node lockfile → `node:22-slim`
   - **Static** — an `index.html` with no `package.json` → `nginx:alpine`
3. `PORT` is injected into the container and every project env var is passed through. Set the app's
   listen port under **Settings → App port** (default 3000; static is served on 80).

Generated Dockerfiles, custom build/start commands, and monorepo `rootDir` are covered in
[docs/builds.md](docs/builds.md).

## Configuration

All via environment (`.env`). See [`.env.example`](.env.example) for the full list and
[docs/configuration.md](docs/configuration.md) for every variable. Highlights:

| Var | Default | Meaning |
|--|--|--|
| `PORT` | `4000` | Control plane + dashboard |
| `EDGE_ENABLED` | `0` | Start the reverse proxy |
| `EDGE_HTTP_PORT` | `8080` | Proxy listen port (use `80` in prod) |
| `APP_DOMAIN` | `krillin.local` | Wildcard base domain for apps |
| `SECRET` | — | JWT signing secret (set this!) |
| `PORT_RANGE_START`/`END` | `20000`–`20999` | Host ports handed to containers |

## CLI

```sh
kettle login    --url <url> --email <email> --password <pw>   # authenticate
kettle status                                                  # docker / domain / counts
kettle projects                                                # list projects + latest status
kettle deploy <name> [--detach]                                # deploy, stream logs
kettle logs   <name>                                           # stream latest deployment logs
```

Full reference: [docs/cli.md](docs/cli.md). HTTP API: [docs/api.md](docs/api.md).

## Documentation

The `docs/` folder is the complete handbook. Start at [docs/index.md](docs/index.md).

| Guide | What's inside |
|--|--|
| [quickstart](docs/quickstart.md) | Install and ship your first app in five minutes |
| [installation](docs/installation.md) | Full install, production setup, systemd, the krillin box |
| [concepts](docs/concepts.md) | Architecture, control plane, edge, deploy lifecycle, glossary |
| [configuration](docs/configuration.md) | Every environment variable, with defaults |
| [deployments](docs/deployments.md) | Lifecycle, zero-downtime swaps, redeploy, reconcile |
| [builds](docs/builds.md) | Stack detection, generated Dockerfiles, custom commands |
| [routing](docs/routing.md) | Edge proxy, host routing, mDNS, the routing table |
| [domains](docs/domains.md) | Attaching custom domains |
| [databases](docs/databases.md) | Managed Postgres, isolation, backups |
| [environment](docs/environment.md) | Per-project env vars and managed injection |
| [webhooks](docs/webhooks.md) | Push-to-deploy and Tangle status-back |
| [cli](docs/cli.md) | Command-line reference |
| [api](docs/api.md) | Complete HTTP API reference |
| [logs](docs/logs.md) | Log streaming (SSE), history, persistence |
| [security](docs/security.md) | Auth, HMAC, database isolation, hardening |
| [troubleshooting](docs/troubleshooting.md) | Common failures and fixes |
| [faq](docs/faq.md) | Frequently asked questions |

## Website

A static marketing + docs site lives in [`site/`](site/). Serve it locally:

```sh
bun site/serve.ts          # http://localhost:4321
```

It has no build step and no external dependencies — plain HTML, CSS, and a little JavaScript.

## Tests

```sh
bun test          # pure logic: slugs, stack detection, Dockerfile gen, routing table
bun run check     # biome lint/format
```

The deploy engine itself is verified against real Docker — see `bun cli.ts deploy`.

## License

Licensed under the [Apache License 2.0](LICENSE).

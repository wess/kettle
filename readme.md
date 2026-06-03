# 🫖 Kettle

A self-hosted deployment platform — like Vercel, Heroku, Coolify, or Fly.io — built on
[Atlas](https://github.com/wess/atlas) and Bun. Push a Git repo, Kettle builds a Docker
image, runs it, health-checks it, and routes traffic to it with zero-downtime swaps.

Built to run `krillin.local`.

## What it does

- **Git-to-running-app** — clone a repo, auto-detect the stack (Bun / Node / static / Dockerfile),
  build an image, and run a container.
- **Push-to-deploy** — a signed webhook from [Tangle](https://github.com/wess/tangle) (git.local)
  redeploys on every push. HMAC-verified, per-project secret.
- **Managed Postgres** — attach a private database to any project; Kettle provisions an isolated
  database + role on a shared instance and injects `DATABASE_URL`.
- **Zero-downtime deploys** — a new deployment boots and health-checks before the old one is retired.
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

## Requirements

- [Bun](https://bun.sh) ≥ 1.3
- Docker (the engine shells out to the `docker` CLI)
- `git`
- The Atlas repo checked out next to this one (`../atlas`)

## Run it

```sh
bun install
cp .env.example .env        # set SECRET
EDGE_ENABLED=1 bun start    # or: bun dev  (hot reload)
```

- Dashboard → http://localhost:4000
- First visit → create the admin account. The first account registered becomes the admin; registration closes after that.
- Edge proxy → port `8080` (set to `80` on the server)

On first boot Kettle runs migrations, creates the admin user, and reconciles any
containers still running from a previous session.

### Deploy on krillin

Apps resolve LAN-wide automatically: with `MDNS_PUBLISH=1` (Linux + `avahi-utils`), Kettle
publishes an mDNS alias for every live `<app>.krillin.local` (and `kettle.krillin.local`) pointing
at the box — no per-client `/etc/hosts`, no wildcard DNS server. Then:

```sh
SECRET=$(openssl rand -hex 32) \
EDGE_ENABLED=1 EDGE_HTTP_PORT=80 APP_DOMAIN=krillin.local \
bun start
```

Run it under a process supervisor (systemd, pm2, or `tmux`) so it survives reboots.
Deployed apps use `--restart unless-stopped`, so they come back on their own; Kettle
reconciles the routing table on startup.

## Deploy your first app

**Dashboard:** New project → set a Git URL → **Deploy**. Watch the live logs; when it goes
green, visit `‹project›.krillin.local`.

**CLI:**

```sh
bun cli.ts login --url http://localhost:4000 --email you@example.com --password '••••••'
bun cli.ts deploy my-app      # streams build logs, exits when live
bun cli.ts logs my-app
bun cli.ts status
```

### Push-to-deploy from Tangle

Each project has a deploy hook (Settings → **Deploy hook**). On Tangle (git.local) open the repo
→ **Settings → Webhooks → Add**, paste Kettle's payload URL (`http://‹kettle›/api/hooks/tangle`)
and the project's secret, content-type `application/json`, event `push`. Every push to the
project's tracked branch redeploys it. The hook verifies an HMAC signature
(`X-Tangle-Signature`); Tangle's minimal push payload carries no ref, so Kettle redeploys the
configured branch and records the real commit SHA at clone time.

**Status back (green/red checks).** Set `TANGLE_URL` and `TANGLE_TOKEN` (a Tangle personal access
token with repo write) and Kettle posts commit statuses back as it deploys — `pending` when the
build starts, then `success`/`failure` — under the `kettle` context, with a `Details` link to the
deployment (`KETTLE_PUBLIC_URL`). This drives the commit/PR checks UI on Tangle. Best-effort: if
Tangle is unreachable or the repo isn't on it, the deploy is unaffected.

### Databases

Project detail → **Database** → *Add PostgreSQL*. Kettle brings up one shared Postgres container
(`kettle-postgres`, named volume `kettle-pgdata`) the first time it's needed, then creates a
dedicated database + login role with a random password and injects `DATABASE_URL` on the next
deploy. App containers reach it over a private `kettle-data` Docker network; each role can connect
only to its own database (PUBLIC `CONNECT` is revoked on every app DB and on the maintenance DBs).
Detaching drops the database and role. The instance isn't published to the host by default — set
`PG_HOST_PORT` to expose it for external tools/backups.

> Connection pooling (PgBouncer) and automated `pg_dump` backups are the natural next step for
> heavier use; per-role `CONNECTION LIMIT` is set today to bound noisy neighbors.

### How a build is chosen

1. A committed `Dockerfile` is always used as-is.
2. Otherwise the stack is auto-detected and a Dockerfile is generated:
   - **Bun** — `bun.lock`, a `bun` script, or a `.ts` entry with no node lockfile → `oven/bun:1`
   - **Node** — a `package.json` with a node lockfile → `node:22-slim`
   - **Static** — an `index.html` with no `package.json` → `nginx:alpine`
3. `PORT` is injected into the container and every project env var is passed through.
   Set the app's listen port under **Settings → App port** (default 3000; static is served on 80).

## Configuration

All via environment (`.env`). See `.env.example` for the full list. Highlights:

| Var | Default | Meaning |
|--|--|--|
| `PORT` | `4000` | Control plane + dashboard |
| `EDGE_ENABLED` | `0` | Start the reverse proxy |
| `EDGE_HTTP_PORT` | `8080` | Proxy listen port (use `80` in prod) |
| `APP_DOMAIN` | `krillin.local` | Wildcard base domain for apps |
| `SECRET` | — | JWT signing secret (set this!) |
| `PORT_RANGE_START/END` | `20000`–`20999` | Host ports handed to containers |

## Tests

```sh
bun test          # pure logic: slugs, stack detection, Dockerfile gen, routing table
bun run check     # biome lint/format
```

The deploy engine itself is verified against real Docker — see `bun cli.ts deploy`.

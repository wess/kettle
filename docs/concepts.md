# Concepts

Kettle has a small number of moving parts. Understanding how they fit together makes everything else
in these docs obvious.

## One process, three jobs

Kettle runs as a **single Bun process** that does three things at once:

```
                    ┌──────────────── kettle (one bun process) ────────────────┐
  browser ───▶ :4000 control plane (API + dashboard, SQLite)                   │
                    │      │                                                    │
  *.krillin.local ─▶ :8080 edge proxy ──┐  syncs routing table from DB         │
                    │                    ▼                                      │
                    │   docker run ─▶ app container :20000  (built from Git)    │
                    └───────────────────────────────────────────────────────────┘
```

1. **Control plane** (`:4000`) — the JSON API and the React dashboard. All state lives in a local
   SQLite database. This is where projects, deployments, env vars, domains, and logs are managed.
2. **Edge proxy** (`:8080`, or `:80` in production) — a reverse proxy that routes incoming requests
   to app containers by `Host` header. Enabled with `EDGE_ENABLED=1`.
3. **Deploy engine** — shells out to `docker` and `git` to clone, build, run, and health-check apps.

There is no separate database server, job queue, or worker pool. The whole platform is the one
process plus the Docker daemon it drives.

## Boot sequence

When `server.ts` starts it:

1. **Migrates** — runs any pending SQL migrations (idempotent, tracked in `_migrations`).
2. **Reconciles** — checks every deployment marked `live`/`running` against Docker; anything whose
   container no longer exists is marked `stopped` so the routing table stays honest.
3. **Serves** — starts the control-plane API and dashboard on `:4000`.
4. **Starts the proxy** — if `EDGE_ENABLED=1`, brings up the edge proxy and (on Linux with
   `MDNS_PUBLISH=1`) publishes mDNS aliases.

## The pieces in code

| Concern | Module | Backed by |
|--|--|--|
| Typed environment config | `src/config` | `@atlas/config` |
| SQLite connection + migrations | `src/db` | `bun:sqlite`, `@atlas/db` |
| Row types + query building | `src/schema` | `@atlas/db` |
| HTTP API | `src/routes` | `@atlas/server` |
| JWT auth, first-user-is-admin | `src/auth` | `@atlas/auth` |
| Deploy orchestration | `src/deploy` | Bun + Docker CLI |
| Docker CLI wrapper | `src/docker` | `Bun.spawn` |
| Git clone + SHA | `src/git` | `Bun.spawn` |
| Stack detection + Dockerfile gen | `src/build` | Bun |
| Reverse proxy + routing table | `src/proxy` | `Bun.serve` |
| Managed Postgres | `src/postgres` | Docker + `psql` |
| mDNS publishing | `src/mdns` | `avahi-publish` |
| CLI client | `src/cli` | `@atlas/cli` |
| Dashboard | `src/web` | React 19 |

## Projects and deployments

A **project** is a named thing you deploy: a Git URL, a branch, a build type, an app port, and some
settings. Its name is slugified and becomes its hostname (`‹name›.‹APP_DOMAIN›`).

A **deployment** is one attempt to build and run a project at a point in time. Deployments are
immutable history — every deploy creates a new row, and each moves through a fixed lifecycle:

```
queued ──▶ building ──▶ running ──▶ live
                          │
                          └──▶ failed        (build or health check failed)

live/running ──▶ stopped   (retired by a newer deploy, or stopped by hand)
```

Only one deployment per project is `live` at a time. When a new deployment becomes healthy, the
previous live container is stopped and removed, and its row is marked `stopped`. This is the
**zero-downtime swap**: the old container keeps serving until the new one is proven healthy. See
[deployments](deployments.md) for the full pipeline.

## The routing table

The edge proxy doesn't read the database on every request. It keeps an **in-memory routing table**
(`Host → host port`) that is rebuilt by `syncRoutes()` whenever a deployment changes state — going
live, being stopped, or having a domain attached or removed. Each live deployment contributes its
project's default host (`‹name›.‹APP_DOMAIN›`) plus any custom domains, all pointing at the container's
allocated host port. See [routing](routing.md).

## Ports

| Port | Used by |
|--|--|
| `4000` | Control plane + dashboard (`PORT`) |
| `8080` | Edge proxy (`EDGE_HTTP_PORT`; set to `80` in production) |
| `20000–20999` | Allocated to app containers (`PORT_RANGE_START`/`END`) |

Each running container gets one host port from the range, mapped to the app's internal listen port.

## Glossary

- **Control plane** — the API + dashboard + SQLite that manages everything. Port `4000`.
- **Edge proxy** — the built-in reverse proxy that routes by `Host`. Port `8080`/`80`.
- **Deploy engine** — the code that drives `docker` and `git` to build and run apps.
- **Routing table** — the in-memory `Host → port` map the proxy serves from.
- **Stack** — the detected project type: `dockerfile`, `bun`, `node`, `static`, or `unknown`.
- **Reconcile** — the startup check that drops routes for containers that no longer exist.
- **Retire** — stopping and removing a previous live container after a new one goes live.
- **Managed database** — a per-project Postgres database Kettle provisions and injects as
  `DATABASE_URL`.
- **Tangle** — the Git server (`git.local`) Kettle integrates with for push-to-deploy.

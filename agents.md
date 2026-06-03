# AGENTS.md — Kettle

Self-hosted PaaS (Vercel/Heroku-style) built on Atlas + Bun + Docker. One Bun process runs
the control-plane API, the dashboard, and an edge reverse proxy; the deploy engine shells out
to `docker` and `git`.

## Conventions (inherited from Atlas + global rules)

- Filenames lowercase, **no** `-`, `_`, or spaces; hierarchy via subdirectories (`src/<feature>/index.ts`).
- Functional only — no classes. Immutable data.
- Bun APIs over Node (`Bun.spawn`, `Bun.file`, `Bun.write`, `Bun.serve`, `bun:sqlite`).
- Atlas is imported via `@atlas/*` aliases resolving to `../atlas/packages/*` (see `tsconfig.json`).

## Layout

```
server.ts            boot: migrate → reconcile → serve API+dashboard → start proxy
cli.ts               kettle CLI entry
src/
  config/            typed env (@atlas/config)
  db/                connect (bun:sqlite) + migrate runner (splits multi-statement SQL)
  schema/            defineSchema for users/projects/deployments/envvars/domains/logs
  auth/              JWT sign + first-user-is-admin (needsSetup/createUser)
  routes/            API: auth, projects, deployments, env, domains, database, logs(SSE), system, hooks
  projects/          slug + project lookups + repo-slug parsing
  deploy/            orchestrator (runDeploy), ports, logs(pub/sub+DB), reconcile
  postgres/          managed shared Postgres: ensure/attach/detach/databaseFor
  docker/            docker CLI wrapper (build/run/stop/inspect/ps/network/exec)
  git/               shallow clone + sha
  build/             detect stack + generate Dockerfile
  proxy/             routing table + host-based reverse proxy (syncRoutes)
  mdns/              publishes an avahi mDNS alias per live *.local host (MDNS_PUBLISH)
  cli/               CLI commands (client of the API)
  web/               React 19 dashboard (app, views, ui, api client)
migrations/          timestamped folders with up.sql/down.sql
```

## Key facts an agent needs

- **Migrations**: `@atlas/migrate` / the sqlite driver run a statement via `db.prepare().run()`,
  which executes only the **first** statement of a multi-statement string. Kettle's own runner
  (`src/db/migrate.ts`) splits on `;` and runs each. All DDL is `IF NOT EXISTS` + tracked in `_migrations`.
- **Dates**: SQLite can't bind a `Date` object. Timestamp columns are typed `text`; write ISO strings.
- **Query operators**: `q("col").equals(...)`, `inList`, `notInList`, `like`, `ilike`,
  `greaterThan`, `isNull`, …; combinators `q.or(...)`, `q.raw(frag)`. `orderBy(col, "ASC"|"DESC")`.
- **insert** takes `Partial<Row>`; column `.default()` is metadata only (not required for typing).
- **Routes** are mount-agnostic; `server.ts` strips `/api` before dispatch. Guards:
  `guard` = requireAuth, `authed` = requireAuth + parseJson. Don't use `authed` on bodyless POSTs —
  `parseJson` throws on an empty body.
- **Proxy** isn't `@atlas/edge`'s static `defineEdge` (sites are fixed at listen). It's a plain
  `Bun.serve` doing Host→port lookup against an in-memory table (`src/proxy/table.ts`), rebuilt by
  `syncRoutes()` from `live` deployments. `.local` mDNS hosts can't use ACME, so the proxy is plain HTTP.
- **Deploy lifecycle**: queued → building → running → live; old live deploys for the same project are
  retired (container removed, status `stopped`) only after the new one is healthy.
- **Log streaming**: `src/deploy/logs.ts` is an in-memory pub/sub that also persists to the `logs` table.
  The dashboard reads the SSE endpoint (`/deployments/:id/logs?token=…` — EventSource can't set headers).
- **Push-to-deploy**: `POST /hooks/tangle` is public (auth is per-project HMAC over the raw body, header
  `x-tangle-signature: sha256=…`). Verify against `c.request.text()` — never re-serialize. Tangle's push
  payload has no ref/SHA, so match by repo owner/name (`parseRepoSlug`) and deploy the configured branch.
- **Managed Postgres** (`src/postgres`): one shared `kettle-postgres` container; attach creates a dedicated
  database + role and injects `DATABASE_URL`. Provisioning runs via `docker exec … psql -U postgres` (peer
  auth on the local socket — no password needed). Apps join the `kettle-data` docker network and reach PG at
  `kettle-postgres:5432`. Isolation: PUBLIC `CONNECT` is revoked on every app DB and on `postgres`/`template1`,
  so a role reaches only its own database. Tangle has **no commit-status API yet**, so CI status-back isn't wired.

## Run / test

```sh
EDGE_ENABLED=1 bun dev      # hot reload
bun test                    # pure logic
bun cli.ts status           # against a running server
```

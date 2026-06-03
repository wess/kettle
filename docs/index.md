# Kettle documentation

**Push a repo. Get a URL.** Kettle is a self-hosted deployment platform built on
[Atlas](https://github.com/wess/atlas) and [Bun](https://bun.sh). It clones a Git repository,
auto-detects the stack, builds a Docker image, runs the container, health-checks it, and routes
traffic to it with zero-downtime swaps — all from a single Bun process backed by SQLite.

If you've used Vercel, Heroku, Coolify, or Fly.io, Kettle will feel familiar. The difference is that
it runs entirely on hardware you control, with no external services in the loop.

## New here?

1. **[Quickstart](quickstart.md)** — install and ship your first app in about five minutes.
2. **[Concepts](concepts.md)** — how the control plane, edge proxy, and deploy engine fit together.
3. **[Installation](installation.md)** — full setup, including a production box like `krillin.local`.

## Guides

| Topic | Read this for |
|--|--|
| [Quickstart](quickstart.md) | The fastest path from clone to a live URL |
| [Installation](installation.md) | Requirements, dev vs. prod, systemd, mDNS, upgrades |
| [Concepts](concepts.md) | Architecture, ports, deploy lifecycle, the glossary |
| [Configuration](configuration.md) | Every environment variable and its default |
| [Deployments](deployments.md) | The build → release pipeline and zero-downtime swaps |
| [Builds](builds.md) | Stack detection, generated Dockerfiles, custom commands |
| [Routing](routing.md) | The edge proxy, host-based routing, and mDNS |
| [Domains](domains.md) | Attaching custom domains to a project |
| [Databases](databases.md) | Managed Postgres: provisioning, isolation, backups |
| [Environment variables](environment.md) | Per-project config and managed injection |
| [Webhooks](webhooks.md) | Push-to-deploy from Tangle and commit status-back |
| [CLI](cli.md) | The `kettle` command-line client |
| [HTTP API](api.md) | Every endpoint, with request and response shapes |
| [Logs](logs.md) | Live streaming (SSE), history, and persistence |
| [Security](security.md) | Auth, HMAC, database isolation, and hardening |
| [Troubleshooting](troubleshooting.md) | Diagnosing the common failures |
| [FAQ](faq.md) | Short answers to common questions |

## Mental model in one paragraph

Kettle runs **one Bun process**. On port `4000` it serves the control-plane API and the React
dashboard, with all state in a local SQLite file. When the edge proxy is enabled it also listens on
port `8080` (or `80` in production) and routes incoming requests by `Host` header to the right app
container. Each deploy clones your repo into a workdir, decides how to build it, runs
`docker build` and `docker run` on a port from a reserved range (`20000–20999`), waits for the
container to become healthy, and only then promotes it to live — retiring the previous container.
The routing table is rebuilt from the database every time a deployment changes state, so the proxy
always points at whatever is currently live.

## Project conventions

Kettle follows a few house rules worth knowing if you read or contribute to the source:

- **Functional only.** No classes; immutable data.
- **Bun APIs over Node** — `Bun.spawn`, `Bun.file`, `Bun.write`, `Bun.serve`, `bun:sqlite`.
- **Filenames are lowercase** with no `-`, `_`, or spaces; hierarchy is expressed through
  subdirectories (`src/<feature>/index.ts`).
- **Atlas** is imported through `@atlas/*` aliases that resolve to `../atlas/packages/*`.

See `agents.md` in the repo root for the full contributor notes.

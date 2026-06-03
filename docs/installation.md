# Installation

This guide covers a full install: requirements, development vs. production, running under a process
supervisor, and the LAN-wide `.local` setup that Kettle was built for. For the five-minute version,
see [quickstart](quickstart.md).

## Requirements

| Tool | Version | Why |
|--|--|--|
| [Bun](https://bun.sh) | ≥ 1.3 | Runtime, bundler, `bun:sqlite`, hot reload |
| Docker | any recent | Kettle shells out to the `docker` CLI to build and run apps |
| `git` | any recent | Cloning project repositories |
| [Atlas](https://github.com/wess/atlas) | sibling checkout | Imported via `@atlas/*` path aliases |

Atlas is **not** an npm dependency. It is consumed directly from a sibling checkout at `../atlas` via
the path aliases in `tsconfig.json`. Keep both repositories side by side:

```
~/Desktop/Dev/
├── atlas/
└── kettle/
```

## Install

```sh
git clone <kettle-repo> kettle
cd kettle
bun install
cp .env.example .env
```

Set a strong `SECRET` in `.env`:

```sh
SECRET=$(openssl rand -hex 32)
```

## Run in development

```sh
EDGE_ENABLED=1 bun dev        # --hot reload on every save
```

- Dashboard → http://localhost:4000
- Edge proxy → http://localhost:8080

`bun dev` runs `bun --hot server.ts`. Source changes reload in place; the SQLite database and any
running containers persist across reloads.

## Run in production

```sh
SECRET=$(openssl rand -hex 32) \
EDGE_ENABLED=1 EDGE_HTTP_PORT=80 APP_DOMAIN=krillin.local \
bun start
```

`bun start` runs `bun server.ts` with no hot reload. Put it behind a process supervisor so it
survives reboots and crashes. Deployed app containers use `--restart unless-stopped`, so they come
back on their own; Kettle reconciles the routing table against the live containers on startup.

### systemd unit

```ini
# /etc/systemd/system/kettle.service
[Unit]
Description=Kettle
After=network.target docker.service
Requires=docker.service

[Service]
Type=simple
WorkingDirectory=/opt/kettle
EnvironmentFile=/opt/kettle/.env
ExecStart=/usr/local/bin/bun server.ts
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now kettle
sudo journalctl -u kettle -f      # follow logs
```

Because the edge proxy binds port `80`, either run the service as root or grant the Bun binary the
capability to bind low ports (`sudo setcap 'cap_net_bind_service=+ep' $(which bun)`).

## LAN-wide `.local` resolution (mDNS)

Kettle was built to host `krillin.local`. With `MDNS_PUBLISH=1` on a Linux host with `avahi-utils`
installed, Kettle publishes an mDNS alias for every live `‹app›.krillin.local` (and for
`kettle.krillin.local` itself) pointing at the box. That means **no per-client `/etc/hosts` edits and
no wildcard DNS server** — any machine on the LAN resolves the names automatically.

```sh
MDNS_PUBLISH=1 APP_DOMAIN=krillin.local EDGE_ENABLED=1 EDGE_HTTP_PORT=80 bun start
```

`MDNS_IP` auto-detects via `hostname -I`; set it explicitly if the box has several interfaces. mDNS
publishing is Linux + avahi only — on other platforms Kettle degrades gracefully and you fall back to
`/etc/hosts` or your own DNS. See [routing](routing.md) for the full story.

## Data and where it lives

| Path | Contents | Configurable with |
|--|--|--|
| `./data/kettle.db` | SQLite control plane (users, projects, deployments, logs, …) | `DATABASE_PATH` |
| `./workdir/‹project›/‹id›/` | Per-deploy source checkouts and build context | `WORKDIR` |
| Docker volume `kettle-pgdata` | Managed Postgres data | `PG_VOLUME` |

Back up `data/kettle.db` and the `kettle-pgdata` volume to protect platform state and managed
databases. See [databases](databases.md#backups).

## Upgrading

```sh
git pull
bun install
sudo systemctl restart kettle     # or restart however you supervise it
```

Migrations are idempotent (`IF NOT EXISTS`, tracked in `_migrations`) and run automatically on boot,
so a restart is all an upgrade needs. Live containers are reconciled on startup.

## Verify

```sh
bun cli.ts login --url http://localhost:4000 --email you@example.com --password '••••••'
bun cli.ts status
```

A healthy server reports `docker ready`, your `APP_DOMAIN`, and project/live/route counts.

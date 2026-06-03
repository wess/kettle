# Configuration

Kettle is configured entirely through environment variables, read once at startup. Copy
`.env.example` to `.env` and edit it, or export the variables in your service manager. Every variable
has a default except where noted.

## At a glance

| Variable | Default | Purpose |
|--|--|--|
| `PORT` | `4000` | Control-plane API + dashboard port |
| `SECRET` | `change-me-in-production` | JWT signing secret — **set this** |
| `EDGE_ENABLED` | `0` | Start the reverse proxy (`1`/`true` to enable) |
| `EDGE_HTTP_PORT` | `8080` | Proxy HTTP listen port (use `80` in production) |
| `EDGE_HTTPS_PORT` | `8443` | Reserved for future TLS support |
| `APP_DOMAIN` | `krillin.local` | Base domain; apps deploy to `‹project›.‹APP_DOMAIN›` |
| `ACME_EMAIL` | `` | Let's Encrypt email (production edge, future use) |
| `MDNS_PUBLISH` | `0` | Publish mDNS aliases for `.local` hosts (Linux + avahi) |
| `MDNS_IP` | `` | IP the aliases resolve to (empty = auto-detect) |
| `DATABASE_PATH` | `./data/kettle.db` | SQLite control-plane database file |
| `WORKDIR` | `./workdir` | Where source checkouts + build context live |
| `PORT_RANGE_START` | `20000` | First host port handed to app containers |
| `PORT_RANGE_END` | `20999` | Last host port handed to app containers |
| `PG_IMAGE` | `postgres:16` | Image for the managed Postgres container |
| `PG_CONTAINER` | `kettle-postgres` | Name of the managed Postgres container |
| `PG_NETWORK` | `kettle-data` | Docker network apps join to reach Postgres |
| `PG_VOLUME` | `kettle-pgdata` | Named volume backing Postgres data |
| `PG_HOST_PORT` | `0` | Host port for Postgres (`0` = not published) |
| `TANGLE_URL` | `` | Tangle base URL for commit status-back |
| `TANGLE_TOKEN` | `` | Tangle personal access token (repo write) |
| `KETTLE_PUBLIC_URL` | `` | Public base URL, used for status "Details" links |

## Control plane

### `PORT`
The port the control-plane API and dashboard listen on. Default `4000`.

### `SECRET`
The signing key for JWT dashboard sessions and for the token that authorizes the log-stream SSE
endpoint. **Always set a strong, unique value in production:**

```sh
SECRET=$(openssl rand -hex 32)
```

Leaving it at the default `change-me-in-production` means anyone who knows the default can forge
sessions. Changing it later invalidates existing sessions (everyone must log in again).

## Edge proxy

### `EDGE_ENABLED`
Whether to start the reverse proxy. Accepts `1` or `true`. With the proxy off, Kettle still builds and
runs containers and serves the dashboard — you just have to reach apps by their host port directly.

### `EDGE_HTTP_PORT`
The proxy's HTTP listen port. Use `8080` in development and `80` in production. Binding `80` requires
root or `cap_net_bind_service` on the Bun binary.

### `EDGE_HTTPS_PORT`
Reserved for future TLS termination. `.local` mDNS hosts can't use ACME, so the proxy currently
serves plain HTTP. See [security](security.md#tls).

### `APP_DOMAIN`
The base domain for deployed apps. A project named `blog` deploys to `blog.‹APP_DOMAIN›`. Default
`krillin.local`. Custom domains attached to a project are served in addition to this. See
[routing](routing.md).

### `ACME_EMAIL`
The contact email for Let's Encrypt, used by the production edge when TLS is enabled. Unused for
`.local` domains.

## mDNS (LAN resolution)

### `MDNS_PUBLISH`
When `1` on a Linux host with `avahi-utils` installed, Kettle publishes an mDNS alias for every live
`‹app›.‹APP_DOMAIN›` (and for `kettle.‹APP_DOMAIN›`) pointing at this box. Clients on the LAN resolve
the names with no `/etc/hosts` edits. Linux + avahi only; degrades gracefully elsewhere.

### `MDNS_IP`
The address the aliases resolve to. Empty auto-detects via `hostname -I`; set it when the host has
multiple interfaces and you need a specific one.

## Storage

### `DATABASE_PATH`
Path to the SQLite control-plane database. Default `./data/kettle.db`. Back this file up to preserve
all platform state.

### `WORKDIR`
Where Kettle checks out source and assembles build context, under `‹WORKDIR›/‹project›/‹deploymentId›/`.
Default `./workdir`. Safe to prune old subdirectories; they are per-deploy.

### `PORT_RANGE_START` / `PORT_RANGE_END`
The inclusive range of host ports allocated to app containers, one per running container. Default
`20000–20999` (1000 concurrent containers). Pick a range that doesn't collide with other services on
the host.

## Managed Postgres

These configure the single shared Postgres instance Kettle provisions on demand. See
[databases](databases.md).

### `PG_IMAGE`
The Docker image for the Postgres container. Default `postgres:16`.

### `PG_CONTAINER`
The container name. Default `kettle-postgres`.

### `PG_NETWORK`
The Docker network app containers join so they can reach Postgres at `‹PG_CONTAINER›:5432`. Default
`kettle-data`. An app only joins this network if it has a database attached.

### `PG_VOLUME`
The named Docker volume backing Postgres data. Default `kettle-pgdata`. Back this up to protect
managed databases.

### `PG_HOST_PORT`
The host port to publish Postgres on. `0` (default) keeps it unpublished — apps reach it over the
Docker network and Kettle provisions it via `docker exec`. Set it (e.g. `5440`) to expose Postgres to
external tools or for backups.

## Tangle integration

Both `TANGLE_URL` and `TANGLE_TOKEN` are required to enable commit status-back. See
[webhooks](webhooks.md).

### `TANGLE_URL`
The base URL of your Tangle instance (`git.local`). When set with a token, Kettle posts commit
statuses as it deploys.

### `TANGLE_TOKEN`
A Tangle personal access token (Settings → tokens) with repo write, used to post statuses.

### `KETTLE_PUBLIC_URL`
The public base URL of this Kettle, used to build the "Details" link on the commit status that points
back at the deployment. Optional.

## Applying changes

Configuration is read at startup. After editing `.env`, restart the process:

```sh
sudo systemctl restart kettle      # or however you supervise it
```

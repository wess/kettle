# Quickstart

Get Kettle running and deploy your first app in about five minutes. For a production install (a real
box, systemd, mDNS), read [installation](installation.md) afterward.

## 1. Prerequisites

- [Bun](https://bun.sh) ≥ 1.3
- Docker, running and reachable as the `docker` CLI
- `git`
- The [Atlas](https://github.com/wess/atlas) repo checked out next to this one, so `../atlas` resolves

Verify Docker is up:

```sh
docker info >/dev/null && echo "docker ok"
```

## 2. Install and configure

```sh
bun install
cp .env.example .env
```

Open `.env` and set a real `SECRET` (it signs dashboard sessions and log-stream tokens):

```sh
SECRET=$(openssl rand -hex 32)
```

Paste that value into `.env`. Every other variable has a sensible default — see
[configuration](configuration.md) when you want to change them.

## 3. Start the server

```sh
EDGE_ENABLED=1 bun start      # or: EDGE_ENABLED=1 bun dev   (hot reload)
```

On first boot Kettle runs its migrations, prepares the SQLite database at `./data/kettle.db`, and
reconciles any containers left over from a previous session.

- **Dashboard** → http://localhost:4000
- **Edge proxy** → http://localhost:8080

## 4. Create the admin account

Open the dashboard. The first visit asks you to create an account — **the first account becomes the
admin, and registration closes after that.** There are no bootstrap credentials to manage.

## 5. Deploy an app

### From the dashboard

1. **New project**, give it a name (it becomes the `‹name›.krillin.local` slug).
2. Paste a Git repository URL.
3. Click **Deploy** and watch the live build logs.

When the deployment turns green it is live. With the edge proxy running locally, add a hosts entry
or use the proxy directly:

```sh
curl -H 'Host: my-app.krillin.local' http://localhost:8080
```

### From the CLI

```sh
bun cli.ts login --url http://localhost:4000 --email you@example.com --password '••••••'
bun cli.ts deploy my-app      # streams build logs, exits when the deploy is live
bun cli.ts status
```

See the [CLI reference](cli.md) for every command.

## What just happened

Kettle cloned your repo, [detected the stack](builds.md), generated a Dockerfile (unless you shipped
one), built an image, ran a container on a port from the `20000–20999` range, waited for it to become
healthy, then [promoted it to live](deployments.md) and pointed the [edge proxy](routing.md) at it.

## Next steps

- [Set environment variables](environment.md) for the app.
- [Attach a managed Postgres database](databases.md) — Kettle injects `DATABASE_URL`.
- [Wire up push-to-deploy](webhooks.md) so every Git push redeploys.
- [Attach a custom domain](domains.md).

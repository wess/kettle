# Troubleshooting

Common failures and how to diagnose them. Start by reading the deployment's logs — most problems
announce themselves there.

## Deploys

### "Set a repository URL before deploying" (422)
The project has no `repoUrl`. Set one in **Settings** (or `PATCH /api/projects/:id`) and deploy again.

### Clone fails
The build logs show the `git clone` error. Usual causes:

- The repo URL is wrong or the branch doesn't exist.
- The repo is private and the host has no credentials for it. Kettle clones with the host's `git`
  configuration — set up an SSH key or credential helper on the box, or use a public URL.

### Build fails
Read the `docker build` output in the logs. If Kettle generated the Dockerfile, confirm the
[detected stack](builds.md#stack-detection) is what you expect (it's logged as `Detected stack: …`).
Common fixes: commit your lockfile so detection is unambiguous, set an explicit `buildType`, or commit
your own `Dockerfile`.

### "health check failed" / "container exited during startup"
The container started but didn't stay up, or didn't bind its port within ~30 seconds. Check that:

- Your app listens on the port from the injected `PORT` env var. This is the most common cause — see
  the [port contract](builds.md#the-port-contract).
- The start command is right (`startCommand`, or the generated default).
- The app isn't crashing on boot. Inspect the container:

```sh
docker logs kettle-<project>-<deploymentId>
```

### Deploy is stuck in `building`
Builds can take a while on first run (pulling base images). If it's genuinely stuck, check the host:
`docker info`, disk space, and whether `docker build` works by hand in the workdir
(`‹WORKDIR›/‹project›/‹id›/`).

## Routing

### App is live but the URL doesn't resolve
- In development, `.local` names don't resolve to your machine by default. Send an explicit `Host`
  header (`curl -H 'Host: app.krillin.local' http://localhost:8080`) or add an `/etc/hosts` entry. See
  [routing](routing.md#reaching-apps-in-development).
- In production, confirm `MDNS_PUBLISH=1` on a Linux host with `avahi-utils`, or that your DNS points
  the host at the box.

### 502 / connection refused through the proxy
The route exists but the container isn't serving. Confirm the deployment is `live` (`kettle status`,
or `GET /api/system` → `routes`), and that the container is up (`docker ps`). A just-retired or
crashed container with a stale route is usually cleared by a route resync on the next state change or a
[reconcile](deployments.md#reconcile-on-startup) at startup.

### Custom domain doesn't route
Check the domain is attached (`GET /api/projects/:id/domains`), DNS points at the box, and the edge
proxy is reachable on port 80. See [domains](domains.md#pointing-dns-at-kettle).

## Databases

### Attach fails (500)
The error message is returned in the response and logged. Confirm Docker is healthy and can pull
`postgres:16`, and that the `kettle-data` network and `kettle-pgdata` volume can be created. Re-running
the attach is safe — it's idempotent.

### App can't reach the database
`DATABASE_URL` is injected on the **next deploy** after attaching — redeploy if you attached after the
last deploy. The app must be on the `kettle-data` network (Kettle joins it automatically when a
database is attached) and connect to `kettle-postgres:5432`.

## Edge / startup

### Proxy won't bind port 80
Binding low ports needs privileges. Run the service as root or grant the capability:

```sh
sudo setcap 'cap_net_bind_service=+ep' $(which bun)
```

### Port already in use
Something else holds `PORT` (4000), `EDGE_HTTP_PORT`, or a port in the container range
(`20000–20999`). Change the relevant variable or free the port. See
[configuration](configuration.md).

### Containers didn't come back after reboot
Deployed containers use `--restart unless-stopped` and Kettle reconciles on startup. If a container is
gone, its deployment is marked `stopped`; just deploy again. Check `docker ps -a` for exited
containers and their logs.

## Auth

### Can't log in / "Registration is closed"
The first account created is the admin and registration then closes (`GET /api/setup` →
`needsSetup: false`). If you've lost admin access, you'll need host access to the SQLite database to
recover. If sessions suddenly stop working, check whether `SECRET` changed — that invalidates all
existing tokens.

## General diagnostics

```sh
bun cli.ts status                 # docker, domain, project/live/route counts
docker ps                         # running app containers (kettle-<project>-<id>)
docker logs <container>           # an app's own output
sudo journalctl -u kettle -f      # the Kettle process logs (systemd)
bun test                          # verify core logic locally
```

If a problem isn't covered here, the deployment logs plus `docker logs` for the container almost always
point at the cause.

# Deployments

A **deployment** is one attempt to build and run a project. Every deploy creates a new immutable row
and runs through a fixed pipeline. This page describes that pipeline, the lifecycle states,
zero-downtime swaps, and how to trigger, stop, and redeploy.

## Lifecycle

```
queued ──▶ building ──▶ running ──▶ live
                          │
                          └──▶ failed        (build or health check failed)

live / running ──▶ stopped   (retired by a newer deploy, or stopped by hand)
```

| Status | Meaning |
|--|--|
| `queued` | Row created; the pipeline is about to start. |
| `building` | Cloning the repo and running `docker build`. |
| `running` | Container started; waiting for the health check to pass. |
| `live` | Healthy and receiving traffic through the edge proxy. |
| `failed` | The build or the health check failed; see the deployment's `error`. |
| `stopped` | Retired — either superseded by a newer live deploy or stopped manually. |

Only one deployment per project is `live` at any moment.

## The pipeline

When a deploy is triggered, `runDeploy` runs detached (in the background) and walks these steps,
emitting a log line at each one (see [logs](logs.md)):

1. **Mark building.** Status → `building`; logs `Deploying ‹project› (#id)`.
2. **Clone.** Shallow-clone the project's `repoUrl` at its `branch` into
   `‹WORKDIR›/‹project›/‹id›/`. The real commit SHA is captured and stored on the deployment.
3. **Report pending.** If [Tangle status-back](webhooks.md) is configured, post a `pending` status.
4. **Plan the build.** [Detect the stack](builds.md) (or use the project's explicit `buildType`) and
   either use a committed `Dockerfile` or generate one. The generated Dockerfile is written to
   `kettle.‹id›.dockerfile` and echoed into the logs.
5. **Build the image.** Run `docker build`, tagged `kettle/‹project›:‹id›`, streaming build output to
   the logs. The image name is recorded on the deployment.
6. **Allocate a port.** Reserve a free host port from the `20000–20999` range.
7. **Run the container.** `docker run` with `--restart unless-stopped`, the host port mapped to the
   app's internal port, every [project env var](environment.md) injected, plus a managed
   `DATABASE_URL` if a database is attached. If a database is attached, the container also joins the
   `kettle-data` network. Status → `running`.
8. **Health-check.** Wait up to ~30 seconds for the container to stay running and bind its port. If
   the container exits during startup, the deploy fails.
9. **Promote (zero-downtime swap).** Retire previous live/running containers for this project (stop +
   remove, mark `stopped`), mark this deployment `live`, set `finishedAt`, and rebuild the
   [routing table](routing.md).
10. **Report success.** Log `✓ Live at ‹project›.‹APP_DOMAIN›` and post a `success` status to Tangle.

If any step throws, the deployment is marked `failed` with the error message, a `failure` status is
posted to Tangle, and the routing table is resynced so nothing points at a dead container.

## Zero-downtime swaps

The previous container is **only retired after the new one passes its health check**. Until that
moment the old container keeps serving traffic; the routing table still points at it. The instant the
new deployment is healthy, the table is rebuilt to point at the new container and the old one is
stopped and removed. There is no window where the project has no live container — assuming the new
build is healthy.

If the new build fails, the previous deployment stays live and untouched.

## The health check

Kettle's health check is intentionally simple: it polls the container for up to ~30 seconds, failing
fast if the container exits during startup, and otherwise giving the app a moment to bind its port. It
logs `waiting for app to become healthy…` a couple of seconds in. It is a liveness check on the
container, not an HTTP probe of a specific path. Make sure your app binds the port Kettle gives it
(via the injected `PORT`) reasonably quickly. See [builds](builds.md#the-port-contract).

## Triggering a deploy

| How | Action |
|--|--|
| Dashboard | Open the project → **Deploy**. |
| CLI | `bun cli.ts deploy ‹name›` — streams logs, exits when terminal. Add `--detach` to skip following. |
| API | `POST /api/projects/:id/deploy`. |
| Git push | Configure [push-to-deploy](webhooks.md); every push to the tracked branch deploys. |

A project must have a `repoUrl` set before it can deploy.

## Stopping a deployment

Stop the live container without deploying anything new:

- API: `POST /api/deployments/:id/stop`
- The container is stopped and removed, the row is marked `stopped`, and the routing table is
  resynced. The project will have no live container until you deploy again.

## Redeploying

`POST /api/deployments/:id/redeploy` re-runs the build pipeline for an existing deployment row. Use it
to retry after a transient failure or to rebuild from the same source reference.

> **Rollback.** There is no one-click "promote a previous deployment" yet. To go back, redeploy the
> known-good commit (point the branch or repo reference at it and deploy). Previous images
> (`kettle/‹project›:‹id›`) are not pruned automatically, so they remain on the host until you clean
> them up.

## Reconcile on startup

When Kettle restarts, it reconciles: every deployment marked `live` or `running` is checked against
Docker, and any whose container no longer exists is marked `stopped`. This keeps the routing table
honest after a crash or reboot. Containers themselves use `--restart unless-stopped`, so they return
on their own and Kettle picks them back up.

## Container naming and labels

- Container name: `kettle-‹project›-‹deploymentId›`
- Image tag: `kettle/‹project›:‹deploymentId›`
- Source checkout: `‹WORKDIR›/‹project›/‹deploymentId›/`

This naming makes it easy to find a deployment's container and image with `docker ps` and
`docker images`.

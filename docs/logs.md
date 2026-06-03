# Logs

Every build and runtime line a deployment produces is captured, streamed live, and persisted so you
can read it after the fact.

## Two streams

Each log line belongs to one of two streams:

| Stream | Contents |
|--|--|
| `build` | Clone output, the generated Dockerfile, and `docker build` output. |
| `runtime` | Container startup, the health check, promotion, and the final result. |

The CLI dims `build` lines and highlights `runtime` lines so the important transitions stand out.

## How logging works

The deploy engine emits each line to an in-memory pub/sub and also writes it to the `logs` table in
SQLite. Live subscribers (the dashboard's SSE stream) get lines as they happen; the persisted copy
backs the history endpoint and the CLI. The database write is best-effort and never blocks a live
subscriber.

## Live stream (dashboard, SSE)

The dashboard reads `GET /api/deployments/:id/logs` as Server-Sent Events. Because `EventSource` can't
set headers, the auth token is passed as a query parameter:

```
GET /api/deployments/42/logs?token=<jwt>
```

The stream first replays the stored history, emits the current `status`, then follows new lines until
the client disconnects. Events:

- `connected` → `{ "deploymentId": 42 }`
- `log` → `{ "stream": "build" | "runtime", "line": "..." }`
- `status` → `{ "status": "building" }`

## History (CLI, API)

`GET /api/deployments/:id/logs/history` returns the persisted lines oldest-first:

```json
[
  { "stream": "build", "line": "Cloning https://git.local/you/app @ main" },
  { "stream": "build", "line": "Building image kettle/app:42" },
  { "stream": "runtime", "line": "✓ Live at app.krillin.local" }
]
```

The [CLI](cli.md) polls this endpoint once a second while following a deploy, printing new lines and
stopping when the deployment reaches `live`, `failed`, or `stopped`. Because history is persisted,
`kettle logs ‹name›` works whether the deployment is still running or finished long ago.

## Reading container logs directly

Kettle's logs cover the build and the deploy lifecycle. For an app's ongoing stdout/stderr after it's
live, use Docker against the deployment's container (`kettle-‹project›-‹id›`):

```sh
docker logs -f kettle-my-app-42
```

## Retention

Log lines are stored in the control-plane SQLite database and kept indefinitely; deleting a project
removes its deployments' log lines. There is no automatic rotation yet, so on a busy server the `logs`
table grows over time — prune old rows or vacuum the database periodically if size becomes a concern.

# HTTP API

Kettle's control plane is a JSON API. The [dashboard](concepts.md) and the [CLI](cli.md) are both
clients of it. This page documents every endpoint.

## Base URL and prefix

All endpoints are served under `/api` on the control-plane port (default `4000`):

```
http://localhost:4000/api/<path>
```

The paths below are written with the `/api` prefix as a client calls them.

## Authentication

Most endpoints require a **Bearer token** obtained from `POST /api/login` (or `POST /api/signup` for
the first admin):

```
Authorization: Bearer <token>
```

The token is a JWT signed with the server's [`SECRET`](configuration.md#secret). Two endpoints are
exceptions:

- `POST /api/hooks/tangle` is **public**, authenticated by a per-project HMAC signature
  ([webhooks](webhooks.md)).
- `GET /api/deployments/:id/logs` (SSE) takes the token as a **query parameter** because `EventSource`
  can't set headers: `?token=<token>`.

Endpoints that take a request body expect `Content-Type: application/json`.

## Conventions

- Success bodies are the resource or a small status object; errors are `{ "error": "message" }`.
- Common status codes: `200` OK, `201` created, `202` accepted (work started in the background), `401`
  unauthorized, `404` not found, `409` conflict, `422` validation error, `500` server error.

---

## Auth & setup

### `GET /api/setup`
Public. Tells the dashboard whether to show "create admin" or "sign in".

```json
{ "needsSetup": true }
```

### `POST /api/signup`
Public, but only works while setup is needed. Creates the **first** account as admin; registration
closes afterward.

Request:
```json
{ "email": "you@example.com", "password": "at-least-8-chars" }
```
Responses: `201 { "token": "...", "user": { "id": 1, "email": "you@example.com" } }`;
`403` if an admin already exists; `422` for an invalid email or a password under 8 characters.

### `POST /api/login`
Public. Exchange credentials for a token.

Request:
```json
{ "email": "you@example.com", "password": "••••••" }
```
Responses: `200 { "token": "...", "user": { "id": 1, "email": "..." } }`; `401` invalid credentials;
`422` if email or password is missing.

### `GET /api/me`
Auth. Returns the current token's claims.

---

## System

### `GET /api/system`
Auth. Server status and high-level counts.

```json
{
  "docker": true,
  "appDomain": "krillin.local",
  "edgeEnabled": true,
  "edgeHttpPort": 8080,
  "projects": 4,
  "live": 3,
  "routes": [ { "host": "blog.krillin.local", "port": 20007 } ],
  "postgres": { "provisioned": true, "running": true },
  "tangle": true
}
```

`routes` is the live [routing table](routing.md); `tangle` reflects whether
[status-back](webhooks.md#status-back-green--red-checks) is configured.

---

## Projects

### `GET /api/projects`
Auth. List all projects, each with its latest deployment under `latest`.

### `POST /api/projects`
Auth. Create a project. The name is slugified and must be a valid slug and unique.

Request (only `name` is required; the rest have defaults):
```json
{
  "name": "my-app",
  "repoUrl": "https://git.local/you/my-app",
  "branch": "main",
  "buildType": "auto",
  "rootDir": ".",
  "buildCommand": null,
  "startCommand": null,
  "internalPort": 3000
}
```
Responses: `201 { "id": 7, "name": "my-app" }`; `422` invalid name; `409` name taken. New projects get
a random `webhookSecret` and `autoDeploy` on by default.

### `GET /api/projects/:id`
Auth. Full project detail, including the latest 50 deployments, env vars, and domains.

```json
{
  "id": 7, "name": "my-app", "repoUrl": "...", "branch": "main",
  "buildType": "auto", "rootDir": ".", "internalPort": 3000,
  "autoDeploy": 1, "webhookSecret": "...",
  "deployments": [ /* newest first, up to 50 */ ],
  "env": [ { "key": "FOO", "value": "bar" } ],
  "domains": [ { "id": 3, "host": "shop.example.com" } ]
}
```
`404` if the project doesn't exist.

### `PATCH /api/projects/:id`
Auth. Update settings. Only these fields are accepted; others are ignored:
`repoUrl`, `branch`, `buildType`, `rootDir`, `buildCommand`, `startCommand`, `internalPort`,
`autoDeploy`. Returns the updated project. `404` if not found.

### `POST /api/projects/:id/webhook/rotate`
Auth. Generate a new webhook signing secret and return it once.

```json
{ "webhookSecret": "new-secret-hex" }
```

### `DELETE /api/projects/:id`
Auth. Delete a project: stops its containers, detaches its database, and removes its deployments, logs,
env vars, and domains, then resyncs routes.

```json
{ "deleted": true }
```

---

## Deployments

### `POST /api/projects/:id/deploy`
Auth. Trigger a deployment. Runs the build pipeline in the background.

Responses: `202` with the new deployment row (`queued`); `404` unknown project; `422` if the project
has no `repoUrl`.

### `GET /api/deployments/:id`
Auth. The deployment row: `status`, `trigger`, `commitSha`, `image`, `containerId`, `hostPort`,
`error`, `createdAt`, `finishedAt`. `404` if not found.

### `GET /api/deployments/:id/logs/history`
Auth. The persisted log lines for a deployment, oldest first:

```json
[ { "stream": "build", "line": "Building image ..." }, { "stream": "runtime", "line": "✓ Live ..." } ]
```

### `POST /api/deployments/:id/stop`
Auth. Stop and remove the deployment's container, mark it `stopped`, resync routes.

```json
{ "stopped": true }
```

### `POST /api/deployments/:id/redeploy`
Auth. Re-run the build pipeline for this deployment. Returns `202 { "redeploying": true }`.

### `GET /api/deployments/:id/logs`  (SSE)
Live log stream as Server-Sent Events. Auth via **query token**: `?token=<jwt>` (`EventSource` can't
set headers). Replays history, then follows new lines until the client disconnects. Events:

- `connected` → `{ "deploymentId": 7 }`
- `log` → `{ "stream": "build" | "runtime", "line": "..." }`
- `status` → `{ "status": "building" }`

`401` if the token is missing or invalid; `404` if the deployment doesn't exist. See [logs](logs.md).

---

## Environment variables

### `GET /api/projects/:id/env`
Auth. The project's env vars as `[{ "key", "value" }]`. `404` if the project doesn't exist.

### `PUT /api/projects/:id/env`
Auth. **Replace** the full env set.

Request:
```json
{ "vars": [ { "key": "API_KEY", "value": "..." }, { "key": "LOG_LEVEL", "value": "info" } ] }
```
Keys must match `^[A-Za-z_][A-Za-z0-9_]*$`; invalid entries are dropped. Returns the saved set. See
[environment](environment.md).

---

## Domains

### `GET /api/projects/:id/domains`
Auth. The project's custom domains.

### `POST /api/projects/:id/domains`
Auth. Attach a domain.

Request:
```json
{ "host": "shop.example.com" }
```
Responses: `201 { "id": 3, "host": "shop.example.com" }`; `422` invalid host; `409` already in use.
Resyncs routes.

### `DELETE /api/domains/:domainId`
Auth. Detach a domain by its id. Returns `{ "deleted": true }` and resyncs routes.

---

## Databases

### `GET /api/projects/:id/database`
Auth. The current attachment, or `null` if none:

```json
{ "engine": "postgres", "dbName": "...", "dbUser": "...", "url": "postgres://..." }
```

### `POST /api/projects/:id/database`
Auth. Provision (idempotent) a dedicated Postgres database for the project. Returns `201` with the
attachment shape above; `500` with an error message on failure. See [databases](databases.md).

### `DELETE /api/projects/:id/database`
Auth. Drop the project's database and role. Returns `{ "detached": true }`.

---

## Webhooks

### `POST /api/hooks/tangle`
Public; authenticated per project by HMAC. Headers `X-Tangle-Event` (only `push` is acted on) and
`X-Tangle-Signature: sha256=<hmac-hex>` over the raw body. Body carries `repository.owner` and
`repository.name`. Triggers a deploy for each matching auto-deploy project whose signature verifies.
Returns `202` listing the triggered projects. Full details in [webhooks](webhooks.md).

---

## Quick reference

| Method | Path | Auth | Purpose |
|--|--|--|--|
| GET | `/api/setup` | — | Whether setup is needed |
| POST | `/api/signup` | — | Create first admin |
| POST | `/api/login` | — | Get a token |
| GET | `/api/me` | Bearer | Current claims |
| GET | `/api/system` | Bearer | Status + counts |
| GET | `/api/projects` | Bearer | List projects |
| POST | `/api/projects` | Bearer | Create project |
| GET | `/api/projects/:id` | Bearer | Project detail |
| PATCH | `/api/projects/:id` | Bearer | Update project |
| POST | `/api/projects/:id/webhook/rotate` | Bearer | Rotate hook secret |
| DELETE | `/api/projects/:id` | Bearer | Delete project |
| POST | `/api/projects/:id/deploy` | Bearer | Trigger deploy |
| GET | `/api/deployments/:id` | Bearer | Deployment status |
| GET | `/api/deployments/:id/logs/history` | Bearer | Log history |
| GET | `/api/deployments/:id/logs` | Query token | Live SSE logs |
| POST | `/api/deployments/:id/stop` | Bearer | Stop deployment |
| POST | `/api/deployments/:id/redeploy` | Bearer | Redeploy |
| GET | `/api/projects/:id/env` | Bearer | List env vars |
| PUT | `/api/projects/:id/env` | Bearer | Replace env vars |
| GET | `/api/projects/:id/domains` | Bearer | List domains |
| POST | `/api/projects/:id/domains` | Bearer | Attach domain |
| DELETE | `/api/domains/:domainId` | Bearer | Detach domain |
| GET | `/api/projects/:id/database` | Bearer | Get database |
| POST | `/api/projects/:id/database` | Bearer | Attach database |
| DELETE | `/api/projects/:id/database` | Bearer | Detach database |
| POST | `/api/hooks/tangle` | HMAC | Push-to-deploy |

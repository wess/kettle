# Environment variables

Each project carries its own set of environment variables, injected into the container at runtime.
This is separate from [Kettle's own configuration](configuration.md), which is read from the host's
environment at startup.

## Setting variables

| How | Action |
|--|--|
| Dashboard | Project detail → **Environment** → edit the list, save. |
| API | `PUT /api/projects/:id/env` with `{ "vars": [{ "key": "...", "value": "..." }] }`. |

The editor is **replace-the-whole-set**: a `PUT` (or a save in the dashboard) replaces every variable
for the project with exactly what you send. To change one value, send the full list with that one
changed. To read the current set, `GET /api/projects/:id/env`.

## Key rules

Keys must be valid environment identifiers — they match `^[A-Za-z_][A-Za-z0-9_]*$` (a letter or
underscore, then letters, digits, or underscores). Entries with invalid keys are silently dropped on
save, so double-check anything unusual stuck.

Examples that are accepted: `DATABASE_URL`, `API_KEY`, `_INTERNAL`, `PORT2`. Rejected:
`2FA_SECRET` (leading digit), `MY-VAR` (hyphen), `MY VAR` (space).

## When they take effect

Variables are injected when a container **starts**, so they apply on the **next deploy**. Changing a
project's env vars does not restart the running container — deploy (or redeploy) to pick up the new
values. See [deployments](deployments.md).

## Build time vs. runtime

Project env vars are passed to the running container, **not** into `docker build`. The generated
Dockerfiles don't forward them at build time. If a build step needs a value, commit a `Dockerfile`
and bake it in with `ARG`/`ENV`. See [builds](builds.md#environment-during-build-vs-runtime).

## Managed variables

Kettle injects two values on top of yours:

- **`PORT`** — the port your app must listen on, set from the project's app-port setting. See the
  [port contract](builds.md#the-port-contract).
- **`DATABASE_URL`** — injected when a [managed Postgres database](databases.md) is attached.

**Managed values win.** If you set `DATABASE_URL` in your own env list while a database is attached,
Kettle's managed value overrides yours, so the editor can't accidentally point the app at the wrong
database. Detach the database if you want to manage the connection string yourself.

## Secrets

Environment values are stored in the control-plane SQLite database. Treat the database file as
sensitive — restrict filesystem access and back it up securely. Values are not separately encrypted at
rest today; see [security](security.md#secrets) for the current posture and recommendations.

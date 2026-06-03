# Databases

Kettle can attach a private, isolated PostgreSQL database to any project. It runs a single shared
Postgres instance and gives each project its own database, login role, and password — then injects the
connection string as `DATABASE_URL`.

## Attaching a database

| How | Action |
|--|--|
| Dashboard | Project detail → **Database** → *Add PostgreSQL*. |
| API | `POST /api/projects/:id/database` (idempotent). |

The first time any project attaches a database, Kettle brings up the shared Postgres container
(`kettle-postgres`, image `postgres:16`, backed by the named volume `kettle-pgdata`) on a private
Docker network (`kettle-data`). It then creates a dedicated database and a login role with a random
password for the project, and records the attachment.

The attachment is idempotent — calling it again returns the existing database rather than creating a
second one.

## What the app sees

On the next deploy, Kettle injects `DATABASE_URL` into the container and joins the container to the
`kettle-data` network so it can reach Postgres at `kettle-postgres:5432`. The app connects with its
own role to its own database — nothing else.

```
DATABASE_URL=postgres://<role>:<password>@kettle-postgres:5432/<dbname>
```

`DATABASE_URL` is a [managed variable](environment.md#managed-variables): it overrides any
`DATABASE_URL` you set by hand while a database is attached.

## Isolation

Each project gets a real boundary, not just a separate schema:

- A **dedicated database** and a **dedicated login role** with a random password.
- `PUBLIC CONNECT` is revoked on every app database and on the maintenance databases (`postgres`,
  `template1`), so a role can connect **only** to its own database.
- A per-role `CONNECTION LIMIT` bounds noisy neighbors.

Provisioning runs through `docker exec … psql -U postgres`, using peer authentication on the local
socket — no superuser password is stored or sent over the network.

## Detaching

| How | Action |
|--|--|
| Dashboard | Project detail → **Database** → remove. |
| API | `DELETE /api/projects/:id/database`. |

Detaching **drops the database and the role** — the data is gone. The shared Postgres container keeps
running for other projects. Deleting a project also detaches and drops its database.

## Reading the attachment

`GET /api/projects/:id/database` returns the current attachment (engine, database name, user, and the
connection URL) or `null` if none. The connection URL it returns is the same one injected as
`DATABASE_URL`.

## Exposing Postgres to external tools

By default the Postgres container is **not** published to the host — apps reach it over the Docker
network and Kettle provisions it via `docker exec`. To connect external tools (a GUI client, a backup
job) set [`PG_HOST_PORT`](configuration.md#pg_host_port) to a host port:

```sh
PG_HOST_PORT=5440 bun start
```

Then connect to `localhost:5440` with a role's credentials (or the superuser, if you exec into the
container).

## Backups

Kettle does not yet run automated backups. Until it does, back up the managed databases yourself:

```sh
# dump every database (requires PG_HOST_PORT set, or run inside the container)
docker exec kettle-postgres pg_dumpall -U postgres > kettle-pg-$(date +%F).sql

# or dump a single project database
docker exec kettle-postgres pg_dump -U postgres <dbname> > <dbname>-$(date +%F).sql
```

Also back up the `kettle-pgdata` Docker volume for a full-instance restore. Automated `pg_dump`
scheduling and connection pooling (PgBouncer) are the natural next steps for heavier use.

## Status

`GET /api/system` reports whether Postgres is provisioned and running (`postgres.provisioned`,
`postgres.running`), which is also surfaced in the dashboard and `kettle status`.

## Other engines

Only PostgreSQL is managed today. For other datastores (Redis, MySQL, object storage), run them as
their own containers or external services and pass connection details through the project's
[environment variables](environment.md).

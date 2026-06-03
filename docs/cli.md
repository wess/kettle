# CLI

The `kettle` CLI is a thin client over the [HTTP API](api.md). It logs in, lists and deploys
projects, and streams build logs from your terminal. Run it with Bun:

```sh
bun cli.ts <command> [args] [flags]
```

The CLI stores its server URL and auth token in a local config file, so you log in once and subsequent
commands reuse the session.

## `login`

Authenticate against a Kettle server and save the session.

```sh
bun cli.ts login --url http://localhost:4000 --email you@example.com --password '••••••'
```

| Flag | Alias | Description |
|--|--|--|
| `--url` | `-u` | Server URL. Reuses the saved URL if omitted. |
| `--email` | `-e` | Account email. Prompts if omitted. |
| `--password` | `-p` | Account password. Prompts if omitted. |

On success it prints `✓ Logged in to ‹url›` and saves the URL and token.

## `status`

Show server health and high-level counts.

```sh
bun cli.ts status
```

```
Kettle http://localhost:4000
  docker   ready
  domain   krillin.local
  projects 4   live 3   routes 5
```

Reports whether Docker is reachable, the configured `APP_DOMAIN`, and project / live / route counts.

## `projects`

List every project with its latest deployment status and repo URL.

```sh
bun cli.ts projects
```

```
blog                 live       https://git.local/you/blog
api                  building   https://git.local/you/api
landing              failed     https://git.local/you/landing
```

Status is color-coded: green `live`, red `failed`, dim `stopped`, yellow for in-progress states.

## `deploy`

Trigger a deployment for a project by name and stream its build logs until the deploy reaches a
terminal state (`live`, `failed`, or `stopped`).

```sh
bun cli.ts deploy my-app
bun cli.ts deploy my-app --detach     # trigger and return immediately
```

| Flag | Alias | Description |
|--|--|--|
| `--detach` | `-d` | Don't follow logs; trigger and exit. |

Build lines are dimmed; runtime lines (startup, health check) are highlighted. The command exits when
the deployment finishes, printing the final status.

## `logs`

Stream logs for a project's **latest** deployment.

```sh
bun cli.ts logs my-app
```

If the latest deployment is still running, this follows it to completion; if it has already finished,
it replays the stored history. Logs are persisted, so this works after the fact too.

## How streaming works

The CLI polls the deployment's [log history endpoint](api.md#deployments) once a second, printing new
lines as they appear, and stops when the deployment reaches `live`, `failed`, or `stopped`. (The
dashboard uses a live SSE stream instead; see [logs](logs.md).)

## Config file

`login` writes the server URL and token to a local config file read by every other command. If a
command reports you're not logged in, run `login` again. To point the CLI at a different server, log in
with a new `--url`.

## Exit behavior

Commands that need authentication exit with an error if there's no saved token. `deploy` and `logs`
exit non-zero if the named project doesn't exist. A finished `deploy` prints the terminal status so you
can gate scripts on it.

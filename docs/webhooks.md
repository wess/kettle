# Webhooks & push-to-deploy

Kettle redeploys a project automatically on every Git push, driven by a signed webhook from
[Tangle](https://github.com/wess/tangle) (`git.local`). It can also report build status back to Tangle
as commit statuses.

## How it works

Each project has a webhook signing secret (its **deploy hook**). When Tangle receives a push it POSTs
to Kettle's public hook endpoint with an HMAC signature over the request body. Kettle verifies the
signature, finds the matching project(s), and triggers a deploy of the configured branch.

Tangle's push payload is intentionally minimal — it carries the repository owner and name but **no ref
or commit SHA**. So Kettle matches projects by repository owner/name and redeploys each one's
*configured* branch, recording the real commit SHA when it clones. See
[deployments](deployments.md#the-pipeline).

## Configure the webhook

1. In Kettle, open the project → **Settings → Deploy hook** and copy the secret. (Rotate it any time
   with `POST /api/projects/:id/webhook/rotate`, which returns a fresh secret once.)
2. In Tangle, open the repo → **Settings → Webhooks → Add**:
   - **Payload URL** — `http://‹kettle›/api/hooks/tangle`
   - **Secret** — the project's deploy-hook secret
   - **Content type** — `application/json`
   - **Event** — `push`

Every push to the project's tracked branch now redeploys it.

## The endpoint

`POST /api/hooks/tangle` is **public** — it is authenticated by the per-project HMAC, not a session
token.

- Header `X-Tangle-Event` — only `push` is acted on; other events return `202 { "ignored": "<event>" }`.
- Header `X-Tangle-Signature` — `sha256=<hmac-hex>` over the **exact** request body, verified with a
  timing-safe comparison.
- Body — JSON with `repository.owner` and `repository.name`.

Kettle finds every auto-deploy project matching that repo and, for each, verifies the signature
against the project's secret before triggering a deploy. The response lists which projects were
triggered.

### Signing rule

The signature is computed over the raw request body, so it must be verified against the exact bytes
Tangle sent — never a re-serialized copy. If you build your own sender, sign the literal payload you
transmit:

```
X-Tangle-Signature: sha256=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SECRET" | awk '{print $2}')
```

### Projects without a secret

A project with no webhook secret accepts unsigned hooks. That's convenient on a trusted LAN, but the
dashboard nudges you to set one. Set a secret to require signatures. A project with `autoDeploy` off
is never triggered by the hook.

## Status-back (green / red checks)

Kettle can post commit statuses to Tangle as it deploys, driving the commit/PR checks UI. Enable it by
setting both:

```sh
TANGLE_URL=https://git.local
TANGLE_TOKEN=<personal-access-token>     # Tangle token with repo write
KETTLE_PUBLIC_URL=http://kettle.krillin.local   # optional: builds the "Details" link
```

With those set, each deploy posts:

- `pending` when the build starts,
- then `success` or `failure` when it finishes,

under the `kettle` context, with a **Details** link back to the deployment when `KETTLE_PUBLIC_URL` is
set. Status-back is best-effort: if Tangle is unreachable or the repo isn't hosted there, the deploy is
unaffected.

> Status-back depends on Tangle exposing a commit-status API. If your Tangle build doesn't have one
> yet, deploys still run; only the checks UI is skipped.

## Triggering from other Git servers

The endpoint expects Tangle's header names (`X-Tangle-Event`, `X-Tangle-Signature`) and a payload with
`repository.owner` / `repository.name`. To wire up a different server, send a `push` event with those
headers and that minimal JSON shape, signing the body with the project's secret as shown above.

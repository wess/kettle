# Routing

When the edge proxy is enabled, Kettle routes incoming HTTP requests to the right app container by
`Host` header. This page explains the proxy, the routing table, and LAN-wide `.local` resolution via
mDNS.

## The edge proxy

With `EDGE_ENABLED=1`, Kettle listens on `EDGE_HTTP_PORT` (`8080` in development, `80` in production)
and proxies each request to the container whose host matches the request's `Host` header. It is a
plain `Bun.serve` doing a host → port lookup — not a static site server — so routes can change at
runtime as deployments come and go.

```
client ──▶ Host: blog.krillin.local ──▶ edge proxy :80 ──▶ container :20007 ──▶ your app
```

## The routing table

The proxy serves from an **in-memory routing table**, a map of host → host port. It is rebuilt by
`syncRoutes()` from the database whenever a deployment changes state. Each `live` deployment
contributes:

- the project's default host, `‹project›.‹APP_DOMAIN›`, and
- every [custom domain](domains.md) attached to the project,

all pointing at the live container's allocated host port. When a deployment goes live, is stopped, or
has a domain added or removed, the table is rebuilt — so the proxy always reflects current state
without reading the database on every request.

You can see the live table in the [system endpoint](api.md#system) (`GET /api/system` → `routes`) and
summarized in `kettle status`.

## Default hostnames

A project's name is slugified and combined with `APP_DOMAIN` to form its default host. With the
default `APP_DOMAIN=krillin.local`:

| Project | Default host |
|--|--|
| `blog` | `blog.krillin.local` |
| `api` | `api.krillin.local` |
| Kettle itself | `kettle.krillin.local` |

Change the base domain with [`APP_DOMAIN`](configuration.md#app_domain).

## Reaching apps in development

In development the proxy is on `8080` and `.local` names won't resolve to your machine without help.
Two easy options:

```sh
# Send an explicit Host header
curl -H 'Host: blog.krillin.local' http://localhost:8080

# Or add a hosts entry
echo '127.0.0.1 blog.krillin.local' | sudo tee -a /etc/hosts
```

## LAN-wide resolution with mDNS

On the production box, Kettle can make every `.local` host resolve across the LAN automatically. With
`MDNS_PUBLISH=1` on a Linux host with `avahi-utils` installed, Kettle publishes an mDNS alias for each
live `‹app›.‹APP_DOMAIN›` (and for `kettle.‹APP_DOMAIN›`) pointing at the box's IP. Any machine on the
network resolves the names with **no per-client `/etc/hosts` and no wildcard DNS server**.

```sh
MDNS_PUBLISH=1 APP_DOMAIN=krillin.local EDGE_ENABLED=1 EDGE_HTTP_PORT=80 bun start
```

- `MDNS_IP` sets the address the aliases resolve to; empty auto-detects via `hostname -I`.
- Aliases track the live set — they appear as apps go live and are withdrawn as they stop.
- This is **Linux + avahi only**. On macOS/Windows hosts Kettle degrades gracefully; use `/etc/hosts`
  or your own DNS to point `*.‹APP_DOMAIN›` at the box.

See [installation](installation.md#lan-wide-local-resolution-mdns) for the full production setup.

## TLS

The proxy currently serves plain HTTP. `.local` mDNS hosts can't obtain ACME certificates, so there's
no automatic HTTPS for the default domain. `EDGE_HTTPS_PORT` and `ACME_EMAIL` are reserved for future
TLS on real custom domains. See [security](security.md#tls) for the implications and workarounds.

## When the proxy is off

With `EDGE_ENABLED=0`, Kettle still builds and runs containers and serves the dashboard — there's just
no host-based routing. Reach a running app directly on its allocated host port (visible on the
deployment, or via `docker ps`). This is fine for a single-app dev setup but you'll want the proxy on
for anything multi-app.

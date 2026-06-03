# Domains

Every project is reachable at its default host, `‹project›.‹APP_DOMAIN›`. You can attach additional
**custom domains** to a project, and the edge proxy will route them to the same live container.

## Adding a domain

| How | Action |
|--|--|
| Dashboard | Project detail → **Domains** → add a host. |
| API | `POST /api/projects/:id/domains` with `{ "host": "shop.example.com" }`. |

Hosts are lowercased and validated against a standard hostname pattern (labels of letters, digits, and
hyphens, separated by dots — at least two labels). Each host is unique across the platform; attaching
one that's already in use returns `409`. Adding or removing a domain rebuilds the
[routing table](routing.md) immediately.

## Removing a domain

- Dashboard: remove it from the project's **Domains** list.
- API: `DELETE /api/domains/:domainId`.

The route disappears from the proxy on the next sync (immediately).

## Pointing DNS at Kettle

A custom domain only works once its DNS resolves to the box running Kettle and the request reaches the
edge proxy's port:

1. Create a DNS record (`A`/`AAAA` for an apex, or `CNAME` for a subdomain) pointing the host at the
   server's address.
2. Make sure the edge proxy is reachable on port `80` (`EDGE_ENABLED=1`, `EDGE_HTTP_PORT=80`).
3. Attach the domain to the project in Kettle.

The proxy matches on the `Host` header, so as long as the request arrives with the right host and the
domain is attached to a live deployment, it routes through.

## TLS

The edge proxy serves plain HTTP today. For a public custom domain that needs HTTPS, terminate TLS in
front of Kettle — for example with a reverse proxy (Caddy, nginx, a load balancer, or Cloudflare) that
handles certificates and forwards plain HTTP to Kettle's edge port. Native ACME on the edge is
reserved for a future release (`EDGE_HTTPS_PORT`, `ACME_EMAIL`). See [security](security.md#tls).

## Default domain vs. custom domains

Attaching custom domains does **not** remove the default `‹project›.‹APP_DOMAIN›` host — both keep
working. The default host is always derived from the project name and `APP_DOMAIN`; custom domains are
stored per project and served in addition.

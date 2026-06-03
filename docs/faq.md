# FAQ

### What is Kettle, in one sentence?
A self-hosted deployment platform — push a Git repo and Kettle builds it into a Docker image, runs it,
health-checks it, and routes traffic to it with zero-downtime swaps, all from a single Bun process.

### How is it different from Vercel / Heroku / Fly?
Same idea, but it runs entirely on hardware you control with no external services. The control plane is
one Bun process backed by SQLite, and the deploy engine drives the local Docker daemon. See
[concepts](concepts.md).

### Do I need an account or internet access?
No. There's no hosted service and no telemetry. The first person to open the dashboard becomes the
admin. It works fully on a LAN.

### What can it build?
Bun, Node, and static sites are auto-detected and given a generated Dockerfile; any repo with its own
`Dockerfile` is built as-is. See [builds](builds.md).

### What languages/runtimes are supported beyond those?
Anything you can put in a `Dockerfile`. Commit a `Dockerfile` and Kettle will build and run it — Go,
Rust, Python, whatever. The auto-detection just covers the common JS cases.

### Does it support monorepos?
Yes — set a project's `rootDir` to the subdirectory to build. See [builds](builds.md#decision-order).

### How do zero-downtime deploys work?
A new deployment is built and health-checked while the old one keeps serving. Only when the new
container is healthy does Kettle repoint the [routing table](routing.md) and retire the old container.
If the build fails, the previous version stays live. See [deployments](deployments.md).

### Can I roll back?
There's no one-click rollback yet. Redeploy the known-good commit to go back. Previous images aren't
auto-pruned, so they remain on the host. See [deployments](deployments.md#redeploying).

### Where is data stored?
Platform state lives in a SQLite file (`data/kettle.db`); managed Postgres data lives in the
`kettle-pgdata` Docker volume; per-deploy source checkouts live under `workdir/`. Back up the first two.
See [installation](installation.md#data-and-where-it-lives).

### How do databases work?
Attach a database to a project and Kettle provisions an isolated Postgres database + role on a shared
instance and injects `DATABASE_URL`. Each role can reach only its own database. See
[databases](databases.md).

### Is there HTTPS?
The edge proxy serves plain HTTP today; `.local` domains can't use ACME. For public domains, terminate
TLS with a proxy in front of Kettle. See [security](security.md#tls).

### How does push-to-deploy work?
A signed webhook from [Tangle](https://github.com/wess/tangle) hits Kettle on every push and redeploys
the project's configured branch. Kettle can also post `pending`/`success`/`failure` commit statuses
back. See [webhooks](webhooks.md).

### Can I use a Git server other than Tangle?
Yes, if it can send a `push` webhook with `X-Tangle-Event`/`X-Tangle-Signature` headers and a payload
carrying `repository.owner`/`repository.name`, signed with the project's secret. See
[webhooks](webhooks.md#triggering-from-other-git-servers).

### Does it scale to multiple hosts?
Not today — Kettle runs apps on the single Docker host it's installed on. It's built for a personal
server or a small box, not a multi-node cluster.

### How many apps can it run?
As many as fit in the host-port range (`20000–20999` by default, 1000 concurrent containers) and your
hardware. Adjust the range in [configuration](configuration.md).

### Can I set resource limits per app?
Not through Kettle's settings yet. If you need hard CPU/memory caps, a committed `Dockerfile` plus
host-level controls are the current path.

### What does it cost?
Kettle is open source under the [Apache 2.0 license](../LICENSE). You provide the hardware.

### Where do I start?
[Quickstart](quickstart.md), then [concepts](concepts.md).

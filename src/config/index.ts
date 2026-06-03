import { defineConfig, env } from "@atlas/config"

export const config = defineConfig({
  port: env("PORT", { parse: Number, default: "4000" }),
  secret: env("SECRET", { default: "change-me-in-production" }),

  edgeEnabled: env("EDGE_ENABLED", { parse: (s) => s === "1" || s === "true", default: "0" }),
  edgeHttpPort: env("EDGE_HTTP_PORT", { parse: Number, default: "8080" }),
  edgeHttpsPort: env("EDGE_HTTPS_PORT", { parse: Number, default: "8443" }),
  appDomain: env("APP_DOMAIN", { default: "krillin.local" }),
  acmeEmail: env("ACME_EMAIL", { default: "" }),

  // Publish an mDNS alias per live *.local host (via avahi-publish) so apps
  // resolve LAN-wide without per-client /etc/hosts. Linux + avahi only.
  mdnsPublish: env("MDNS_PUBLISH", { parse: (s) => s === "1" || s === "true", default: "0" }),
  mdnsIp: env("MDNS_IP", { default: "" }), // empty = auto-detect via `hostname -I`

  databasePath: env("DATABASE_PATH", { default: "./data/kettle.db" }),
  workdir: env("WORKDIR", { default: "./workdir" }),

  portRangeStart: env("PORT_RANGE_START", { parse: Number, default: "20000" }),
  portRangeEnd: env("PORT_RANGE_END", { parse: Number, default: "20999" }),

  // Managed shared Postgres
  pgImage: env("PG_IMAGE", { default: "postgres:16" }),
  pgContainer: env("PG_CONTAINER", { default: "kettle-postgres" }),
  pgNetwork: env("PG_NETWORK", { default: "kettle-data" }),
  pgVolume: env("PG_VOLUME", { default: "kettle-pgdata" }),
  // 0 = don't publish a host port (apps reach it over the docker network;
  // Kettle provisions via `docker exec`). Set to expose it for external tools.
  pgHostPort: env("PG_HOST_PORT", { parse: Number, default: "0" }),

  // Report deploy status back to Tangle (git.local). Both required to enable.
  tangleUrl: env("TANGLE_URL", { default: "" }),
  tangleToken: env("TANGLE_TOKEN", { default: "" }),
  // Public base URL of this Kettle, used for status target links (optional).
  publicUrl: env("KETTLE_PUBLIC_URL", { default: "" }),
})

export type Config = typeof config

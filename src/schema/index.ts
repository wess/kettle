import { column, defineSchema, type RowOf } from "@atlas/db"

// Column defaults / DDL live in the migration SQL. Schemas here drive row
// types and query building only.
export const users = defineSchema("users", {
  id: column.serial().primaryKey(),
  email: column.text().unique(),
  password: column.text(),
  role: column.text(),
  createdAt: column.text(),
})

export const projects = defineSchema("projects", {
  id: column.serial().primaryKey(),
  name: column.text().unique(),
  repoUrl: column.text().nullable(),
  branch: column.text(),
  buildType: column.text(),
  rootDir: column.text(),
  buildCommand: column.text().nullable(),
  startCommand: column.text().nullable(),
  internalPort: column.integer(),
  webhookSecret: column.text().nullable(),
  autoDeploy: column.integer(),
  createdAt: column.text(),
})

export const deployments = defineSchema("deployments", {
  id: column.serial().primaryKey(),
  projectId: column.integer().ref("projects", "id"),
  status: column.text(),
  trigger: column.text(),
  commitSha: column.text().nullable(),
  image: column.text().nullable(),
  containerId: column.text().nullable(),
  hostPort: column.integer().nullable(),
  error: column.text().nullable(),
  createdAt: column.text(),
  finishedAt: column.text().nullable(),
})

export const envvars = defineSchema("envvars", {
  id: column.serial().primaryKey(),
  projectId: column.integer().ref("projects", "id"),
  key: column.text(),
  value: column.text(),
})

export const domains = defineSchema("domains", {
  id: column.serial().primaryKey(),
  projectId: column.integer().ref("projects", "id"),
  host: column.text().unique(),
  createdAt: column.text(),
})

export const logs = defineSchema("logs", {
  id: column.serial().primaryKey(),
  deploymentId: column.integer().ref("deployments", "id"),
  stream: column.text(),
  line: column.text(),
  createdAt: column.text(),
})

export const databases = defineSchema("databases", {
  id: column.serial().primaryKey(),
  projectId: column.integer().ref("projects", "id"),
  engine: column.text(),
  dbName: column.text(),
  dbUser: column.text(),
  dbPassword: column.text(),
  createdAt: column.text(),
})

export type User = RowOf<typeof users>
export type Project = RowOf<typeof projects>
export type Deployment = RowOf<typeof deployments>
export type EnvVar = RowOf<typeof envvars>
export type Domain = RowOf<typeof domains>
export type LogLine = RowOf<typeof logs>
export type Database = RowOf<typeof databases>

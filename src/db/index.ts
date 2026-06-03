import { mkdirSync } from "node:fs"
import { dirname } from "node:path"
import { connect } from "@atlas/db"
import { config } from "../config/index.ts"

mkdirSync(dirname(config.databasePath), { recursive: true })

export const db = connect({ driver: "sqlite", path: config.databasePath })

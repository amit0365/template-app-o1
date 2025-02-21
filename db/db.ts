/**
 * @description
 * This file initializes the database connection and schema for the entire application.
 * It uses Drizzle ORM with a PostgreSQL client from 'postgres'.
 *
 * Key features:
 * - Manages the top-level schema object for Drizzle.
 * - Imports .env.local for environment variables (DATABASE_URL).
 * - Connects to the database and supplies the schema to Drizzle.
 *
 * @dependencies
 * - drizzle-orm/postgres-js: Provides the Drizzle client to connect with PostgreSQL.
 * - dotenv: Loads environment variables from .env.local.
 * - eventsTable, subEventsTable: Newly added tables for the scheduling feature.
 *
 * @notes
 * - Make sure DATABASE_URL is set correctly in your .env.local.
 * - Do not commit .env.local to source control.
 */

import { profilesTable, eventsTable, subEventsTable } from "@/db/schema"
import { config } from "dotenv"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"

config({ path: ".env.local" })

/**
 * The `schema` object now includes profiles, events, and subEvents tables.
 */
const schema = {
  profiles: profilesTable,
  events: eventsTable,
  subEvents: subEventsTable
}

/**
 * Establish a connection to the PostgreSQL database using the connection URL.
 */
const client = postgres(process.env.DATABASE_URL!)

/**
 * Initialize the Drizzle ORM instance with the combined schema.
 */
export const db = drizzle(client, { schema })

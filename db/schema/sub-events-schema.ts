/**
 * @description
 * This file defines the database schema for storing sub-events (sessions, talks, etc.) within a parent event.
 *
 * Key changes:
 * - `startTime` and `endTime` are now `text(...)` columns instead of `timestamp(...)`.
 *   This lets us store strings like "4-5 pm" directly, without parsing them as dates.
 *
 * We still have:
 * - speaker, speakerPosition, speakerCompany
 * - location
 * - No `topic` column
 *
 * @notes
 * After updating this file, run:
 *   npx drizzle-kit generate
 *   npx drizzle-kit migrate
 * to apply the migration that changes these columns from timestamp to text.
 */

import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core"
import { eventsTable } from "./events-schema"

/**
 * The subEventsTable stores session-level data belonging to a parent event.
 * We store times as raw strings in `startTime` and `endTime`.
 */
export const subEventsTable = pgTable(
  "sub_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    eventId: uuid("event_id")
      .references(() => eventsTable.id, { onDelete: "cascade" })
      .notNull(),

    /**
     * Updated: Now using text columns for start/end time
     * so we can store raw strings like "4-5 pm"
     */
    startTime: text("start_time"),
    endTime: text("end_time"),

    subEventName: text("sub_event_name"),

    speaker: text("speaker"),
    speakerPosition: text("speaker_position"),
    speakerCompany: text("speaker_company"),

    location: text("location"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date())
  },
  table => {
    return {
      eventIdIdx: index("sub_events_event_id_idx").on(table.eventId)
    }
  }
)

/**
 * Type for inserting a new sub-event record into the DB.
 */
export type InsertSubEvent = typeof subEventsTable.$inferInsert

/**
 * Type for selecting a sub-event record from the DB.
 */
export type SelectSubEvent = typeof subEventsTable.$inferSelect

/**
 * @description
 * This file defines the database schema for storing sub-events (sessions, talks, etc.) within a parent event.
 * Each row in `subEventsTable` represents a sub-event that belongs to a specific record in `eventsTable`.
 *
 * Key features:
 * - Stores session-level details such as sub-event name, times, speaker, topic, etc.
 * - References the `eventsTable` so sub-events can be cascaded on event deletion.
 * - Includes timestamps (createdAt, updatedAt) with automatic updates on changes.
 *
 * @dependencies
 * - drizzle-orm/pg-core: For defining table schema, columns, references.
 * - types: InsertSubEvent and SelectSubEvent are exported for typed usage elsewhere.
 *
 * @notes
 * - `location` can override the parent event's location if sub-event has a specific location/room.
 * - The foreign key references the `eventsTable.id`.
 */

import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core"
import { eventsTable } from "./events-schema"

/**
 * The subEventsTable stores session-level data belonging to a parent event.
 */
export const subEventsTable = pgTable(
  "sub_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    eventId: uuid("event_id")
      .references(() => eventsTable.id, { onDelete: "cascade" })
      .notNull(),
    subEventName: text("sub_event_name"),
    startTime: timestamp("start_time"),
    endTime: timestamp("end_time"),
    speaker: text("speaker"),
    topic: text("topic"),
    location: text("location"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date())
  },
  /**
   * Table-level indexes for optimization.
   */
  table => {
    return {
      /**
       * Index for quickly querying all sub-events belonging to a specific parent event.
       */
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

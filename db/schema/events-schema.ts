/**
 * @description
 * This file defines the database schema for storing user events fetched from Google Calendar (or other sources).
 * Each row in `eventsTable` represents a single event belonging to a specific user.
 *
 * Key features:
 * - Stores event details such as title, times, location, Google Calendar ID, and external links (e.g., Luma).
 * - Enforces a unique constraint on (userId, calendarEventId) to avoid duplicates.
 * - Includes timestamps (createdAt, updatedAt) with automatic updates on changes.
 *
 * @dependencies
 * - drizzle-orm/pg-core: For defining table schema, columns, and constraints.
 * - types: InsertEvent and SelectEvent are exported for typed usage elsewhere.
 *
 * @notes
 * - The `calendarEventId` is typically the Google Calendar event ID.
 * - `externalLink` might be a Luma page or any other external URL for additional details.
 * - `location` can be parsed from the Google Calendar event or set by other means.
 * - `userId` references the Clerk user ID, but there's no foreign key constraint in Drizzle for that (it's just text).
 */

import {
  pgTable,
  uuid,
  text,
  timestamp,
  uniqueIndex
} from "drizzle-orm/pg-core"

/**
 * The eventsTable stores top-level event info synced from Google Calendar (or similar).
 */
export const eventsTable = pgTable(
  "events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id").notNull(),
    eventTitle: text("event_title").notNull(),
    startTime: timestamp("start_time"),
    endTime: timestamp("end_time"),
    location: text("location"),
    externalLink: text("external_link"),
    calendarEventId: text("calendar_event_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date())
  },
  /**
   * Table-level constraints such as indexes or unique constraints.
   */
  table => {
    return {
      /**
       * Unique constraint on (userId, calendarEventId) to prevent duplicates for the same user.
       */
      userCalendarUniqueIdx: uniqueIndex("events_user_calendar_id_unique").on(
        table.userId,
        table.calendarEventId
      )
    }
  }
)

/**
 * Type for inserting a new event into the DB.
 */
export type InsertEvent = typeof eventsTable.$inferInsert

/**
 * Type for selecting an event record from the DB.
 */
export type SelectEvent = typeof eventsTable.$inferSelect

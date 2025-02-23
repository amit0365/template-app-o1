import {
  pgTable,
  uuid,
  text,
  timestamp,
  uniqueIndex,
  date as pgDate // Drizzle's "date" type
} from "drizzle-orm/pg-core"

export const eventsTable = pgTable(
  "events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id").notNull(),
    eventTitle: text("event_title").notNull(),

    /**
     * We'll store just the "date" portion in a column named "startTime."
     * This is a PostgreSQL DATE column — so any time portion is discarded.
     */
    startTime: pgDate("start_time"),

    location: text("location"),
    externalLink: text("external_link"),
    calendarEventId: text("calendar_event_id"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date())
  },
  table => {
    return {
      userCalendarUniqueIdx: uniqueIndex("events_user_calendar_id_unique").on(
        table.userId,
        table.calendarEventId
      )
    }
  }
)

// Types for inserts & selects
export type InsertEvent = typeof eventsTable.$inferInsert
export type SelectEvent = typeof eventsTable.$inferSelect

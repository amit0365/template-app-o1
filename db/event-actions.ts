/**
 * @description
 * This server actions file handles CRUD operations for the eventsTable.
 * It allows creating, reading, updating, and deleting event records associated with a user.
 *
 * Key features:
 * - createEventAction: Inserts a new event into the database.
 * - getEventsAction: Retrieves all events for a specific user ID.
 * - getEventByIdAction: Retrieves a single event by its unique eventId (UUID).
 * - updateEventAction: Updates an existing event record.
 * - deleteEventAction: Removes an event record from the database.
 *
 * @dependencies
 * - db: The Drizzle ORM database instance configured in @/db/db
 * - eventsTable: The Drizzle schema for the "events" table
 * - ActionState: A union type describing success/failure states for server actions
 *
 * @notes
 * - Each function handles error logging and returns an ActionState object.
 * - We reference the userId primarily in getEventsAction, ensuring only that user’s events are fetched.
 * - For other actions, we rely on the eventId alone. Additional checks to ensure the user "owns" the event could be added if needed.
 */

"use server"

import { db } from "@/db/db"
import {
  eventsTable,
  InsertEvent,
  SelectEvent
} from "@/db/schema/events-schema"
import { ActionState } from "@/types"
import { eq } from "drizzle-orm"

/**
 * Creates a new event in the eventsTable.
 *
 * @function createEventAction
 * @async
 * @param {InsertEvent} eventData - The data required to create a new event.
 * @returns {Promise<ActionState<SelectEvent>>}
 *    - isSuccess: true, data: The inserted event record
 *    - isSuccess: false, message: Failure reason
 *
 * @example
 * const result = await createEventAction({
 *   userId: "user_123",
 *   eventTitle: "Conference",
 *   startTime: new Date().toISOString(),
 *   endTime: new Date().toISOString(),
 *   location: "Main Hall"
 * });
 */
export async function createEventAction(
  eventData: InsertEvent
): Promise<ActionState<SelectEvent>> {
  try {
    const [newEvent] = await db
      .insert(eventsTable)
      .values(eventData)
      .returning()
    return {
      isSuccess: true,
      message: "Event created successfully",
      data: newEvent
    }
  } catch (error) {
    console.error("Error creating event:", error)
    return { isSuccess: false, message: "Failed to create event" }
  }
}

/**
 * Retrieves all events from the eventsTable for a specific user.
 *
 * @function getEventsAction
 * @async
 * @param {string} userId - The user ID whose events should be retrieved.
 * @returns {Promise<ActionState<SelectEvent[]>>}
 *    - isSuccess: true, data: Array of events
 *    - isSuccess: false, message: Failure reason
 *
 * @example
 * const result = await getEventsAction("user_123");
 * if(result.isSuccess) {
 *   console.log(result.data); // All of the user's events
 * }
 */
export async function getEventsAction(
  userId: string
): Promise<ActionState<SelectEvent[]>> {
  try {
    const events = await db.query.events.findMany({
      where: eq(eventsTable.userId, userId),
      orderBy: (table, { desc }) => [desc(table.createdAt)]
    })
    return {
      isSuccess: true,
      message: "Events retrieved successfully",
      data: events
    }
  } catch (error) {
    console.error("Error getting events:", error)
    return { isSuccess: false, message: "Failed to get events" }
  }
}

/**
 * Retrieves a single event by its UUID primary key.
 *
 * @function getEventByIdAction
 * @async
 * @param {string} eventId - The unique event ID (UUID) to retrieve.
 * @returns {Promise<ActionState<SelectEvent>>}
 *    - isSuccess: true, data: The requested event
 *    - isSuccess: false, message: Failure reason
 *
 * @example
 * const result = await getEventByIdAction("some-event-uuid");
 */
export async function getEventByIdAction(
  eventId: string
): Promise<ActionState<SelectEvent>> {
  try {
    const event = await db.query.events.findFirst({
      where: eq(eventsTable.id, eventId)
    })

    if (!event) {
      return { isSuccess: false, message: "Event not found" }
    }

    return {
      isSuccess: true,
      message: "Event retrieved successfully",
      data: event
    }
  } catch (error) {
    console.error("Error getting event by ID:", error)
    return { isSuccess: false, message: "Failed to get event" }
  }
}

/**
 * Updates an existing event record by its ID.
 *
 * @function updateEventAction
 * @async
 * @param {string} eventId - The ID of the event to update.
 * @param {Partial<InsertEvent>} data - The fields to update.
 * @returns {Promise<ActionState<SelectEvent>>}
 *    - isSuccess: true, data: The updated event
 *    - isSuccess: false, message: Failure reason
 *
 * @example
 * const result = await updateEventAction("some-event-id", { eventTitle: "New Title" });
 */
export async function updateEventAction(
  eventId: string,
  data: Partial<InsertEvent>
): Promise<ActionState<SelectEvent>> {
  try {
    const [updatedEvent] = await db
      .update(eventsTable)
      .set(data)
      .where(eq(eventsTable.id, eventId))
      .returning()

    if (!updatedEvent) {
      return { isSuccess: false, message: "Event not found" }
    }

    return {
      isSuccess: true,
      message: "Event updated successfully",
      data: updatedEvent
    }
  } catch (error) {
    console.error("Error updating event:", error)
    return { isSuccess: false, message: "Failed to update event" }
  }
}

/**
 * Deletes an event record from the eventsTable by its ID.
 *
 * @function deleteEventAction
 * @async
 * @param {string} eventId - The ID of the event to delete.
 * @returns {Promise<ActionState<void>>}
 *    - isSuccess: true, data: undefined if successful
 *    - isSuccess: false, message: Failure reason
 *
 * @example
 * const result = await deleteEventAction("some-event-id");
 */
export async function deleteEventAction(
  eventId: string
): Promise<ActionState<void>> {
  try {
    await db.delete(eventsTable).where(eq(eventsTable.id, eventId))
    return {
      isSuccess: true,
      message: "Event deleted successfully",
      data: undefined
    }
  } catch (error) {
    console.error("Error deleting event:", error)
    return { isSuccess: false, message: "Failed to delete event" }
  }
}

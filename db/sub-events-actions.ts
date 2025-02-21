/**
 * @description
 * This server actions file handles CRUD operations for the subEventsTable.
 * Each sub-event is associated with a parent event via eventId.
 *
 * Key features:
 * - createSubEventAction: Inserts a new sub-event (e.g., session, talk).
 * - getSubEventsByEventAction: Retrieves all sub-events belonging to a parent event.
 * - getSubEventByIdAction: Retrieves a single sub-event by its unique ID.
 * - updateSubEventAction: Updates a sub-event's fields (speaker, topic, etc.).
 * - deleteSubEventAction: Removes a sub-event from the database.
 *
 * @dependencies
 * - db: The Drizzle ORM database instance
 * - subEventsTable: The Drizzle schema for the "sub_events" table
 * - ActionState: A union type describing success/failure states for server actions
 *
 * @notes
 * - Ensures that sub-events cascade delete if the parent event is removed (as set in the schema).
 * - Additional ownership or access checks can be performed if needed.
 * - The userId is not stored directly in sub_events; referencing is done via the eventId in events.
 */

"use server"

import { db } from "@/db/db"
import {
  subEventsTable,
  InsertSubEvent,
  SelectSubEvent
} from "@/db/schema/sub-events-schema"
import { ActionState } from "@/types"
import { eq } from "drizzle-orm"

/**
 * Creates a new sub-event (child session) in the subEventsTable.
 *
 * @function createSubEventAction
 * @async
 * @param {InsertSubEvent} subEventData - The data required to create a new sub-event.
 * @returns {Promise<ActionState<SelectSubEvent>>}
 *    - isSuccess: true, data: The inserted sub-event record
 *    - isSuccess: false, message: Failure reason
 *
 * @example
 * const result = await createSubEventAction({
 *   eventId: "parent-event-uuid",
 *   subEventName: "Keynote Session",
 *   startTime: new Date().toISOString(),
 *   endTime: new Date().toISOString(),
 *   speaker: "Jane Doe",
 *   topic: "AI Innovations",
 *   location: "Room 101"
 * });
 */
export async function createSubEventAction(
  subEventData: InsertSubEvent
): Promise<ActionState<SelectSubEvent>> {
  try {
    const [newSubEvent] = await db
      .insert(subEventsTable)
      .values(subEventData)
      .returning()
    return {
      isSuccess: true,
      message: "Sub-event created successfully",
      data: newSubEvent
    }
  } catch (error) {
    console.error("Error creating sub-event:", error)
    return { isSuccess: false, message: "Failed to create sub-event" }
  }
}

/**
 * Retrieves all sub-events from the subEventsTable for a specific parent event.
 *
 * @function getSubEventsByEventAction
 * @async
 * @param {string} eventId - The parent event ID for which to fetch sub-events.
 * @returns {Promise<ActionState<SelectSubEvent[]>>}
 *    - isSuccess: true, data: Array of sub-events
 *    - isSuccess: false, message: Failure reason
 *
 * @example
 * const result = await getSubEventsByEventAction("event-uuid");
 * if (result.isSuccess) {
 *   console.log(result.data); // All sub-events for that event
 * }
 */
export async function getSubEventsByEventAction(
  eventId: string
): Promise<ActionState<SelectSubEvent[]>> {
  try {
    const subEvents = await db.query.subEvents.findMany({
      where: eq(subEventsTable.eventId, eventId),
      orderBy: (table, { asc }) => [asc(table.startTime)]
    })
    return {
      isSuccess: true,
      message: "Sub-events retrieved successfully",
      data: subEvents
    }
  } catch (error) {
    console.error("Error getting sub-events by event:", error)
    return { isSuccess: false, message: "Failed to get sub-events" }
  }
}

/**
 * Retrieves a single sub-event by its UUID primary key.
 *
 * @function getSubEventByIdAction
 * @async
 * @param {string} subEventId - The unique sub-event ID (UUID) to retrieve.
 * @returns {Promise<ActionState<SelectSubEvent>>}
 *    - isSuccess: true, data: The requested sub-event
 *    - isSuccess: false, message: Failure reason
 *
 * @example
 * const result = await getSubEventByIdAction("some-sub-event-uuid");
 */
export async function getSubEventByIdAction(
  subEventId: string
): Promise<ActionState<SelectSubEvent>> {
  try {
    const subEvent = await db.query.subEvents.findFirst({
      where: eq(subEventsTable.id, subEventId)
    })

    if (!subEvent) {
      return { isSuccess: false, message: "Sub-event not found" }
    }

    return {
      isSuccess: true,
      message: "Sub-event retrieved successfully",
      data: subEvent
    }
  } catch (error) {
    console.error("Error getting sub-event by ID:", error)
    return { isSuccess: false, message: "Failed to get sub-event" }
  }
}

/**
 * Updates an existing sub-event record by its ID.
 *
 * @function updateSubEventAction
 * @async
 * @param {string} subEventId - The ID of the sub-event to update.
 * @param {Partial<InsertSubEvent>} data - The fields to update in the sub-event.
 * @returns {Promise<ActionState<SelectSubEvent>>}
 *    - isSuccess: true, data: The updated sub-event
 *    - isSuccess: false, message: Failure reason
 *
 * @example
 * const result = await updateSubEventAction("sub-event-uuid", { speaker: "John Smith" });
 */
export async function updateSubEventAction(
  subEventId: string,
  data: Partial<InsertSubEvent>
): Promise<ActionState<SelectSubEvent>> {
  try {
    const [updatedSubEvent] = await db
      .update(subEventsTable)
      .set(data)
      .where(eq(subEventsTable.id, subEventId))
      .returning()

    if (!updatedSubEvent) {
      return { isSuccess: false, message: "Sub-event not found" }
    }

    return {
      isSuccess: true,
      message: "Sub-event updated successfully",
      data: updatedSubEvent
    }
  } catch (error) {
    console.error("Error updating sub-event:", error)
    return { isSuccess: false, message: "Failed to update sub-event" }
  }
}

/**
 * Deletes a sub-event record from the subEventsTable by its ID.
 *
 * @function deleteSubEventAction
 * @async
 * @param {string} subEventId - The ID of the sub-event to delete.
 * @returns {Promise<ActionState<void>>}
 *    - isSuccess: true, data: undefined if successful
 *    - isSuccess: false, message: Failure reason
 *
 * @example
 * const result = await deleteSubEventAction("some-sub-event-id");
 */
export async function deleteSubEventAction(
  subEventId: string
): Promise<ActionState<void>> {
  try {
    await db.delete(subEventsTable).where(eq(subEventsTable.id, subEventId))
    return {
      isSuccess: true,
      message: "Sub-event deleted successfully",
      data: undefined
    }
  } catch (error) {
    console.error("Error deleting sub-event:", error)
    return { isSuccess: false, message: "Failed to delete sub-event" }
  }
}

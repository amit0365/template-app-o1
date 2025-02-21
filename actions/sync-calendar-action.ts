/**
 * @description
 * Provides a server action `syncNowAction` that triggers the Google Calendar sync logic
 * for a 1-week window starting from a given date.
 *
 * Key features:
 * - Marked with "use server"
 * - Accepts a string "startDate" from the client, converts to a Date
 * - "endDate" is startDate + 7 days
 * - Calls `syncCalendarEventsAction(userId, timeMin, timeMax)`
 *
 * @dependencies
 * - google-calendar-actions: The module that actually syncs the user's calendar
 * - ActionState<void>: Return type for success/failure
 *
 * @notes
 * - The client can pass a date string; we parse it as Date in the server action.
 * - If startDate is invalid, we can default or fail gracefully.
 */

"use server"

import { ActionState } from "@/types"
import { syncCalendarEventsAction } from "@/actions/google-calendar-actions"

export async function syncNowAction(
  userId: string,
  startDateStr: string
): Promise<ActionState<void>> {
  try {
    // 1. Convert the incoming startDateStr to a real Date
    const startDate = new Date(startDateStr)
    // Basic validation: if invalid, fallback to "now"
    if (isNaN(startDate.getTime())) {
      console.warn("Invalid startDate, defaulting to now.")
      startDate.setTime(Date.now())
    }

    // 2. Calculate timeMax as startDate + 7 days
    const oneWeekMs = 7 * 24 * 60 * 60 * 1000
    const endDate = new Date(startDate.getTime() + oneWeekMs)

    // 3. Call the main sync function
    return await syncCalendarEventsAction(userId, startDate, endDate)
  } catch (error) {
    console.error("syncNowAction error:", error)
    return { isSuccess: false, message: "Failed to sync calendar for 1-week." }
  }
}

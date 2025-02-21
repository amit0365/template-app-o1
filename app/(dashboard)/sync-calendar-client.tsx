/**
 * @description
 * A client component that allows the user to select a start date. We'll sync one week from that date.
 *
 * Key features:
 * - "use client" for interactivity
 * - Input: a text or date field for the start date
 * - On button click, calls `syncNowAction(userId, startDateStr)`
 *
 * @dependencies
 * - syncNowAction: The server action in `actions/sync-calendar-action`
 * - ActionState<void>: For typed results
 *
 * @notes
 * - The user picks a date. If it’s invalid, server action logs a warning and defaults to “now.”
 */

"use client"

import React, { useState } from "react"
import { Button } from "@/components/ui/button"
import { syncNowAction } from "@/actions/sync-calendar-action"
import { ActionState } from "@/types"

interface SyncCalendarEventsClientProps {
  userId: string
}

export default function SyncCalendarEventsClient({
  userId
}: SyncCalendarEventsClientProps) {
  const [message, setMessage] = useState<string | null>(null)
  const [isError, setIsError] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  // We'll store the user's chosen start date as a string: "YYYY-MM-DD"
  const [startDate, setStartDate] = useState<string>("")

  /**
   * handleSync
   * ----------
   * Called when the user clicks "Sync Calendar"
   */
  async function handleSync() {
    try {
      setIsLoading(true)
      setMessage(null)
      setIsError(false)

      // We pass the chosen start date to the server
      const result: ActionState<void> = await syncNowAction(userId, startDate)

      if (result.isSuccess) {
        setMessage(result.message)
      } else {
        setIsError(true)
        setMessage(result.message)
      }
    } catch (error) {
      console.error("Sync error:", error)
      setIsError(true)
      setMessage("An unexpected error occurred while syncing.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="container mx-auto flex flex-col items-center justify-center space-y-6 py-12">
      <h1 className="text-2xl font-bold">Dashboard: Google Events</h1>

      <div className="flex flex-col items-center space-y-2">
        <label htmlFor="startDate" className="font-medium">
          Choose Start Date (1-week sync)
        </label>

        {/* Use type="date" for a date picker, or type="text" for manual input */}
        <input
          id="startDate"
          type="date"
          value={startDate}
          onChange={e => setStartDate(e.target.value)}
          className="rounded border px-3 py-2"
        />
      </div>

      <Button onClick={handleSync} disabled={isLoading}>
        {isLoading ? "Syncing..." : "Sync Google Calendar (1-Week)"}
      </Button>

      {message && (
        <p
          className={`mt-4 ${
            isError ? "text-destructive" : "text-primary font-semibold"
          }`}
        >
          {message}
        </p>
      )}
    </div>
  )
}

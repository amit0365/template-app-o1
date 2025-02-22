/**
 * @description
 * A server component that fetches all events for the logged-in user along with each event's sub-events.
 * It then passes the combined data to a client component for displaying in a timeline.
 *
 * Key features:
 * - Auth check with Clerk; if not signed in, user is prompted to log in.
 * - Fetches the user's events from our eventsTable via `getEventsAction`.
 * - For each event, fetches its sub-events via `getSubEventsByEventAction`.
 * - Constructs a `UserEventWithSubs` array for the client component.
 * - Uses a Suspense boundary to handle async data fetching gracefully.
 *
 * @dependencies
 * - auth from "@clerk/nextjs/server": to retrieve the userId
 * - getEventsAction from "@/db/event-actions": fetch top-level user events
 * - getSubEventsByEventAction from "@/db/sub-events-actions": fetch sub-events for each event
 * - TimelineClient from "./_components/timeline": client component that displays the final timeline
 *
 * @notes
 * - Step 8 in the plan: "Display Events & SubEvents in UI"
 * - We store `startTime` and `endTime` for top-level events as Date objects in the DB.
 * - For sub-events, `startTime` and `endTime` are strings that can contain human-readable time ranges.
 *   We simply pass them through as-is for display.
 * - If 2+ events overlap, we highlight them in the timeline client component.
 *   Overlap detection is done in the client code, checking the event-level times (Dates).
 */

"use server"

import { Suspense } from "react"
import { auth } from "@clerk/nextjs/server"
import { notFound } from "next/navigation"

import { getEventsAction } from "@/db/event-actions"
import { getSubEventsByEventAction } from "@/db/sub-events-actions"
import { TimelineClient } from "./_components/timeline"

interface UserEventWithSubs {
  id: string
  eventTitle: string
  startTime: Date | null
  endTime: Date | null
  location?: string | null
  externalLink?: string | null
  subEvents: Array<{
    id: string
    subEventName?: string | null
    startTime?: string | null
    endTime?: string | null
    speaker?: string | null
    speakerPosition?: string | null
    speakerCompany?: string | null
    location?: string | null
  }>
}

/**
 * SchedulePage
 * ------------
 * Our main server component for displaying a user's schedule (events + sub-events).
 *
 * @returns JSX element that wraps the client timeline in a Suspense boundary.
 */
export default async function SchedulePage() {
  // 1) Check authentication
  const { userId } = await auth()
  if (!userId) {
    // If not logged in, we can show a 404, or a custom "Please sign in" message.
    // We'll just return notFound() to simplify.
    return notFound()
  }

  // 2) Fetch the user's events
  const eventsRes = await getEventsAction(userId)
  if (!eventsRes.isSuccess) {
    // In a real app, you might show an error message. We'll just return notFound().
    return notFound()
  }

  const userEvents = eventsRes.data // Array of SelectEvent

  // 3) For each event, fetch sub-events
  const eventsWithSubs: UserEventWithSubs[] = []
  for (const ev of userEvents) {
    const subEventRes = await getSubEventsByEventAction(ev.id)
    let subEvents = []
    if (subEventRes.isSuccess) {
      subEvents = subEventRes.data.map(subev => ({
        id: subev.id,
        subEventName: subev.subEventName ?? null,
        startTime: subev.startTime ?? null,
        endTime: subev.endTime ?? null,
        speaker: subev.speaker ?? null,
        speakerPosition: (subev as any).speakerPosition ?? null, // might be in the DB
        speakerCompany: (subev as any).speakerCompany ?? null,
        location: subev.location ?? null
      }))
    }

    eventsWithSubs.push({
      id: ev.id,
      eventTitle: ev.eventTitle,
      startTime: ev.startTime ? new Date(ev.startTime) : null,
      endTime: ev.endTime ? new Date(ev.endTime) : null,
      location: ev.location,
      externalLink: ev.externalLink,
      subEvents
    })
  }

  // 4) Render the timeline in a Suspense boundary
  return (
    <Suspense fallback={<p className="p-6">Loading schedule...</p>}>
      {/* 
        We pass `eventsWithSubs` to the client component to handle sorting, overlap, etc.
      */}
      <TimelineClient events={eventsWithSubs} />
    </Suspense>
  )
}

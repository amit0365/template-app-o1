"use server"

import { Suspense } from "react"
import { auth } from "@clerk/nextjs/server"
import { notFound } from "next/navigation"

import { getEventsAction } from "@/db/event-actions"
import { getSubEventsByEventAction } from "@/db/sub-events-actions"
import Timeline from "./_components/timeline"

interface SubEventWithParent {
  id: string
  subEventName: string
  speaker: string
  speakerPosition: string
  speakerCompany: string
  parentEventTitle: string
  parentLocation: string
  parentLink: string
  /**
   * The parent main event's date (startTime) from your DB, e.g. 2025-05-18 (no time).
   */
  parentDate: Date | null
  /**
   * Sub-event start/end as real Date objects, after combining subEvent’s
   * textual time ("9am") with the parent's date. Possibly null if parse fails.
   */
  start: Date | null
  end: Date | null
}

/**
 * parseSubEventTime
 * -----------------
 * Merges a date (parentDate) + a 12-hour time (e.g. "9am") into a full Date.
 * Returns null if parsing fails or if no parentDate/time is provided.
 */
function parseSubEventTime(parentDate: Date | null, subTime: string | null) {
  if (!parentDate || !subTime) return null

  const match = subTime.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i)
  if (!match) return null

  let hour = parseInt(match[1], 10)
  const minute = match[2] ? parseInt(match[2], 10) : 0
  const ampm = match[3].toLowerCase()

  if (ampm === "pm" && hour < 12) {
    hour += 12
  } else if (ampm === "am" && hour === 12) {
    hour = 0
  }

  const dateTime = new Date(parentDate.getTime())
  dateTime.setHours(hour, minute, 0, 0)
  return dateTime
}

/**
 * SchedulePage
 * ------------
 * Server component that:
 * 1) Checks auth,
 * 2) Fetches all main events,
 * 3) For each event, fetches sub-events,
 * 4) Converts sub-event "4pm" strings to real Date objects by combining with `event.startTime`,
 * 5) Passes them all to a single client timeline component.
 */
export default async function SchedulePage() {
  // 1) Auth
  const { userId } = await auth()
  if (!userId) return notFound()

  // 2) Get all main events
  const eventsRes = await getEventsAction(userId)
  if (!eventsRes.isSuccess) return notFound()
  const mainEvents = eventsRes.data

  // 3) Gather sub-events from each main event
  const allSubs: SubEventWithParent[] = []

  for (const event of mainEvents) {
    const subRes = await getSubEventsByEventAction(event.id)
    if (!subRes.isSuccess) continue

    for (const sub of subRes.data) {
      const parentDate = event.startTime ? new Date(event.startTime) : null
      const startDateTime = parseSubEventTime(parentDate, sub.startTime)
      const endDateTime = parseSubEventTime(parentDate, sub.endTime)

      allSubs.push({
        id: sub.id,
        subEventName: sub.subEventName ?? "Untitled",
        speaker: sub.speaker ?? "",
        speakerPosition: sub.speakerPosition ?? "",
        speakerCompany: sub.speakerCompany ?? "",
        parentEventTitle: event.eventTitle,
        parentLocation: event.location ?? "",
        parentLink: event.externalLink ?? "",
        parentDate: parentDate, // The main event's date
        start: startDateTime,
        end: endDateTime
      })
    }
  }

  // 4) Sort all sub-events by start time so the client can handle them in order
  allSubs.sort((a, b) => {
    if (a.start && b.start) return a.start.getTime() - b.start.getTime()
    if (a.start && !b.start) return -1
    if (!a.start && b.start) return 1
    return 0
  })

  // 5) Render in a Suspense boundary
  return (
    <Suspense fallback={<div className="p-4">Loading schedule...</div>}>
      <Timeline subEvents={allSubs} />
    </Suspense>
  )
}

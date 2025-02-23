"use client"

import { useMemo } from "react"
import { Globe } from "lucide-react"

interface SubEventWithParent {
  id: string
  subEventName: string
  speaker: string
  speakerPosition: string
  speakerCompany: string
  parentEventTitle: string
  parentLocation: string
  parentLink: string
  parentDate: Date | null
  start: Date | null
  end: Date | null
}

interface TimelineProps {
  subEvents: SubEventWithParent[]
}

/**
 * deduplicateSubEvents
 * --------------------
 * If the only difference is the DB "id" or the parent's link,
 * we consider them the same sub-event. We'll skip duplicates.
 *
 * For example, if two items have the same subEventName, speaker,
 * date, start time, end time, parentEventTitle, and location,
 * we treat them as duplicates.
 */
function deduplicateSubEvents(
  subEvents: SubEventWithParent[]
): SubEventWithParent[] {
  const seen = new Set<string>()
  const result: SubEventWithParent[] = []

  for (const s of subEvents) {
    // build a "fingerprint" ignoring s.id and s.parentLink
    const dateKey = s.parentDate
      ? s.parentDate.toISOString().split("T")[0]
      : "unknown"

    const nameKey = (s.subEventName || "").toLowerCase().trim()
    const speakKey = (s.speaker || "").toLowerCase().trim()
    const titleKey = (s.parentEventTitle || "").toLowerCase().trim()
    const locKey = (s.parentLocation || "").toLowerCase().trim()

    const startKey = s.start ? s.start.getTime() : "nostart"
    const endKey = s.end ? s.end.getTime() : "noend"

    // Combine them into a unique string
    // (Modify fields if you'd like a different dedup logic.)
    const fingerprint = [
      dateKey,
      nameKey,
      speakKey,
      titleKey,
      locKey,
      startKey,
      endKey
    ].join("||")

    if (!seen.has(fingerprint)) {
      seen.add(fingerprint)
      result.push(s)
    }
  }
  return result
}

/**
 * groupByDate
 * -----------
 * Puts sub-events into a bucket per parentDate (YYYY-MM-DD).
 */
function groupByDate(
  subEvents: SubEventWithParent[]
): Map<string, SubEventWithParent[]> {
  const map = new Map<string, SubEventWithParent[]>()
  for (const s of subEvents) {
    const key = s.parentDate
      ? s.parentDate.toISOString().split("T")[0] // e.g. "2025-05-18"
      : "unknown"
    if (!map.has(key)) {
      map.set(key, [])
    }
    map.get(key)!.push(s)
  }
  return map
}

/**
 * groupOverlapping
 * ----------------
 * For sub-events that share the same date, group them if their time ranges overlap.
 */
function groupOverlapping(
  subEvents: SubEventWithParent[]
): SubEventWithParent[][] {
  // Sort by start
  subEvents.sort((a, b) => {
    if (a.start && b.start) return a.start.getTime() - b.start.getTime()
    if (a.start && !b.start) return -1
    if (!a.start && b.start) return 1
    return 0
  })

  const result: SubEventWithParent[][] = []
  let currentGroup: SubEventWithParent[] = []
  let currentGroupEnd: Date | null = null

  for (const sub of subEvents) {
    const st = sub.start
    const en = sub.end ?? st

    if (currentGroup.length === 0) {
      currentGroup.push(sub)
      currentGroupEnd = en
    } else {
      // overlap if st <= currentGroupEnd
      if (st && currentGroupEnd && st <= currentGroupEnd) {
        currentGroup.push(sub)
        // update end if needed
        if (en && en > currentGroupEnd) {
          currentGroupEnd = en
        }
      } else {
        // new group
        result.push(currentGroup)
        currentGroup = [sub]
        currentGroupEnd = en
      }
    }
  }
  if (currentGroup.length > 0) {
    result.push(currentGroup)
  }

  return result
}

export default function Timeline({ subEvents }: TimelineProps) {
  // 1) Deduplicate sub-events
  const dedupedSubEvents = useMemo(() => {
    return deduplicateSubEvents(subEvents)
  }, [subEvents])

  // 2) Group sub-events by parentDate
  const groupedByDate = useMemo(
    () => groupByDate(dedupedSubEvents),
    [dedupedSubEvents]
  )

  // 3) Convert Map to array, sorted by date
  const sortedDates = Array.from(groupedByDate.entries()).sort(([a], [b]) =>
    a.localeCompare(b)
  )

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-4">
      <h1 className="text-2xl font-bold">Your Sub-Events</h1>

      {sortedDates.length === 0 ? (
        <p className="text-muted-foreground">No sub-events found.</p>
      ) : (
        sortedDates.map(([dateString, eventsOnDate]) => {
          const label = dateString === "unknown" ? "No Date" : dateString

          // 4) Within each date, group overlapping
          const overlapGroups = groupOverlapping(eventsOnDate)

          return (
            <div key={dateString} className="space-y-6">
              <div className="mb-2 mt-4 text-lg font-semibold">{label}</div>

              {overlapGroups.map((group, idx) => (
                <div
                  key={idx}
                  className="space-y-4 rounded-md border p-4 shadow-sm"
                >
                  {group.map(sub => (
                    <div
                      key={sub.id}
                      className="ml-2 space-y-1 border-l pl-4 last:mb-0 last:pb-0"
                    >
                      <div className="text-sm font-medium">
                        {sub.subEventName}
                      </div>

                      <div className="text-muted-foreground text-xs">
                        {formatTimeRange(sub.start, sub.end)}
                      </div>

                      {sub.speaker && (
                        <div className="text-xs">
                          <strong>Speaker:</strong> {sub.speaker}
                          {sub.speakerPosition
                            ? `, ${sub.speakerPosition}`
                            : ""}
                          {sub.speakerCompany ? ` @ ${sub.speakerCompany}` : ""}
                        </div>
                      )}

                      <div className="text-xs">
                        <strong>Parent:</strong> {sub.parentEventTitle}
                        {sub.parentLocation && ` (${sub.parentLocation})`}
                        {sub.parentLink && (
                          <a
                            href={sub.parentLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:text-primary/80 ml-2 inline-flex items-center underline"
                          >
                            <Globe className="mr-1 size-3" />
                            Visit
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )
        })
      )}
    </div>
  )
}

/**
 * formatTimeRange
 * ---------------
 * "9:00 AM - 10:30 AM" or "No time" if both are null, etc.
 */
function formatTimeRange(start: Date | null, end: Date | null): string {
  if (!start && !end) return "No time"
  if (start && end) {
    const s = start.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit"
    })
    const e = end.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    return `${s} - ${e}`
  }
  if (start) {
    return `Starts at ${start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
  }
  return `Ends at ${end!.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
}

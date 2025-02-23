"use server"

import { db } from "@/db/db"
import { eventsTable, InsertEvent } from "@/db/schema/events-schema"
import { profilesTable } from "@/db/schema/profiles-schema"
import { eq, and } from "drizzle-orm"
import { ActionState } from "@/types"
import { processExternalLinkAction } from "@/actions/external-data-actions"

/**
 * syncCalendarEventsAction
 * ------------------------
 * Syncs events from Google, storing only the "date" portion (ignoring clock time).
 */
export async function syncCalendarEventsAction(
  userId: string,
  timeMin: Date | null,
  timeMax: Date | null
): Promise<ActionState<void>> {
  try {
    // 1) Check user profile for Google tokens
    const userProfile = await db.query.profiles.findFirst({
      where: eq(profilesTable.userId, userId)
    })
    if (!userProfile) {
      return {
        isSuccess: false,
        message: "No profile found for user. Please create a profile or sign up."
      }
    }
    if (!userProfile.googleAccessToken) {
      return {
        isSuccess: false,
        message:
          "No Google token found. Please connect your Google account first."
      }
    }

    // 2) Possibly refresh token if expired
    let accessToken = userProfile.googleAccessToken
    if (
      userProfile.googleTokenExpires &&
      userProfile.googleTokenExpires < new Date()
    ) {
      const newToken = await refreshGoogleToken(
        userProfile.googleRefreshToken || ""
      )
      if (!newToken) {
        return {
          isSuccess: false,
          message: "Failed to refresh expired Google token. Please reconnect."
        }
      }
      accessToken = newToken
    }

    // 3) Time range for the calendar query
    const now = new Date()
    const defaultTimeMin = now
    const defaultTimeMax = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
    const usedTimeMin = timeMin ?? defaultTimeMin
    const usedTimeMax = timeMax ?? defaultTimeMax

    // 4) Fetch events from Google
    const googleEvents = await fetchGoogleCalendarEvents(accessToken, {
      timeMin: usedTimeMin.toISOString(),
      timeMax: usedTimeMax.toISOString(),
      maxResults: 100
    })
    if (!googleEvents || !Array.isArray(googleEvents.items)) {
      return {
        isSuccess: false,
        message: "No valid events array received from Google Calendar."
      }
    }

    // 5) Upsert each event
    for (const item of googleEvents.items) {
      if (!item.id || !item.summary) continue

      const description = item.description ?? ""
      const foundLink = extractFirstLink(description)

      // Build our date object from either "start.dateTime" or "start.date"
      let dateOnly: Date | null = null

      if (item.start?.dateTime) {
        // For time-based events, let's parse the dateTime
        const dt = new Date(item.start.dateTime)
        // Zero out hours to keep only the day portion
        dt.setHours(0, 0, 0, 0)
        dateOnly = dt
      } else if (item.start?.date) {
        // For all-day events, parse date directly (e.g. "2025-05-18")
        dateOnly = new Date(item.start.date)
      }

      const eventData: InsertEvent = {
        userId,
        eventTitle: item.summary,
        calendarEventId: item.id,

        // Our "startTime" date column
        startTime: dateOnly ? dateOnly.toISOString() : null,

        location: item.location || null,
        externalLink: foundLink || null
      }

      // Check if this event already exists
      const existing = await db.query.events.findFirst({
        where: and(
          eq(eventsTable.userId, userId),
          eq(eventsTable.calendarEventId, item.id)
        )
      })

      let finalEventId: string | null = null
      let linkIsNewOrChanged = false

      if (existing) {
        linkIsNewOrChanged =
          eventData.externalLink !== null &&
          eventData.externalLink !== existing.externalLink

        const [updatedEvent] = await db
          .update(eventsTable)
          .set(eventData)
          .where(eq(eventsTable.id, existing.id))
          .returning()

        if (updatedEvent) {
          finalEventId = updatedEvent.id
        }
      } else {
        const [newEvent] = await db.insert(eventsTable).values(eventData).returning()
        if (newEvent) {
          finalEventId = newEvent.id
          linkIsNewOrChanged = !!newEvent.externalLink
        }
      }

      // 6) If external link is new or changed, parse sub-events
      if (finalEventId && linkIsNewOrChanged) {
        try {
          const parseResult = await processExternalLinkAction(finalEventId)
          if (!parseResult.isSuccess) {
            console.warn(
              `Scrape/parse failed for event ${finalEventId}:`,
              parseResult.message
            )
          }
        } catch (scrapeError) {
          console.warn(
            `Unexpected error calling processExternalLinkAction:`,
            scrapeError
          )
        }
      }
    }

    return {
      isSuccess: true,
      message: `Google Calendar events synced. Only date portion stored (${usedTimeMin.toDateString()} to ${usedTimeMax.toDateString()}).`,
      data: undefined
    }
  } catch (error) {
    console.error("Error syncing Google Calendar events:", error)
    return {
      isSuccess: false,
      message: "Failed to sync Google Calendar events."
    }
  }
}

/**
 * fetchGoogleCalendarEvents
 *  - standard function to call the Google Calendar API
 */
async function fetchGoogleCalendarEvents(
  accessToken: string,
  options: { timeMin: string; timeMax: string; maxResults?: number }
): Promise<any | null> {
  const { timeMin, timeMax, maxResults = 50 } = options
  try {
    const urlParams = new URLSearchParams()
    urlParams.set("timeMin", timeMin)
    urlParams.set("timeMax", timeMax)
    urlParams.set("singleEvents", "true")
    urlParams.set("orderBy", "startTime")
    urlParams.set("maxResults", String(maxResults))

    const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?${urlParams.toString()}`

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    })

    if (!response.ok) {
      console.error("Google Calendar API error:", response.statusText)
      return null
    }

    return await response.json()
  } catch (err) {
    console.error("Error fetching calendar events from Google:", err)
    return null
  }
}

/**
 * refreshGoogleToken
 *  - same old function to refresh the token if expired
 */
async function refreshGoogleToken(refreshToken: string): Promise<string | null> {
  if (!refreshToken) {
    return null
  }
  const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID
  const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    console.error("Missing Google client env variables for token refresh.")
    return null
  }

  try {
    const tokenParams = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token"
    })

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: tokenParams.toString()
    })

    if (!tokenResponse.ok) {
      const err = await tokenResponse.text()
      console.error("Token refresh failed:", err)
      return null
    }

    const tokenData = (await tokenResponse.json()) as {
      access_token?: string
      expires_in?: number
      token_type?: string
    }

    if (!tokenData.access_token) {
      console.error("No access_token in refresh response.")
      return null
    }

    return tokenData.access_token
  } catch (error) {
    console.error("Error refreshing Google token:", error)
    return null
  }
}

/**
 * extractFirstLink
 *  - parse the first http(s) link from a string
 */
function extractFirstLink(text: string): string | null {
  const linkRegex = /(https?:\/\/[^\s]+)/i
  const match = text.match(linkRegex)
  return match ? match[0] : null
}

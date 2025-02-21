/**
 * @description
 * Provides a server action to sync Google Calendar events for a user's primary calendar,
 * optionally within a specified date range (timeMin -> timeMax).
 *
 * Key features:
 * - Fetches events from the user's Google Calendar using stored OAuth tokens.
 * - Accepts timeMin and timeMax to limit the sync period.
 * - Stores or updates the event data in the `eventsTable`.
 * - Extracts external links (like Luma) from the event description.
 * - Refreshes the Google token if expired.
 *
 * @dependencies
 * - db: Drizzle ORM instance for database operations
 * - eventsTable: Schema definition for storing top-level events
 * - profilesTable: For retrieving/storing user tokens
 * - InsertEvent, SelectEvent: Drizzle ORM types for typed insert/select
 * - ActionState<T>: Standard success/failure response for server actions
 *
 * @notes
 * - If no timeMin/timeMax provided, defaults to "now" -> "now + 30 days" example logic (or any default).
 * - In production, handle edge cases carefully (e.g., invalid dates).
 */

"use server"

import { db } from "@/db/db"
import { eventsTable, InsertEvent } from "@/db/schema/events-schema"
import { profilesTable } from "@/db/schema/profiles-schema"
import { eq, and } from "drizzle-orm"
import { ActionState } from "@/types"

/**
 * syncCalendarEventsAction
 * ------------------------
 * Fetches events in [timeMin, timeMax] from a user's Google Calendar and upserts them into the `eventsTable`.
 *
 * @async
 * @function
 * @param {string} userId - The Clerk user ID of the currently logged-in user.
 * @param {Date | null} timeMin - Lower bound for the event fetch window (inclusive).
 * @param {Date | null} timeMax - Upper bound for the event fetch window (inclusive).
 * @returns {Promise<ActionState<void>>}
 *    isSuccess: True if sync succeeded, false otherwise.
 *
 * Flow:
 * 1. Retrieve the user's Google tokens from `profilesTable`.
 * 2. Refresh the token if expired.
 * 3. Fetch events from Google Calendar in [timeMin, timeMax].
 * 4. Upsert each event into the DB, scanning description for external links.
 */
export async function syncCalendarEventsAction(
  userId: string,
  timeMin: Date | null,
  timeMax: Date | null
): Promise<ActionState<void>> {
  try {
    // 1. Check user profile for Google tokens
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

    // 2. Possibly refresh the token if we believe it's expired
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

    // 3. Determine timeMin/timeMax if not provided
    //    In this example, if not provided, default to now -> now+30 days.
    const now = new Date()
    const defaultTimeMin = now
    const defaultTimeMax = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

    const usedTimeMin = timeMin ?? defaultTimeMin
    const usedTimeMax = timeMax ?? defaultTimeMax

    // 4. Fetch events from Google Calendar
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

    // 5. Upsert each event
    for (const item of googleEvents.items) {
      if (!item.id || !item.summary) {
        continue
      }
      const description = item.description || ""
      const foundLink = extractFirstLink(description)

      // Prepare event data
      const eventData: InsertEvent = {
        userId,
        eventTitle: item.summary,
        calendarEventId: item.id,
        startTime: item.start?.dateTime
          ? new Date(item.start.dateTime)
          : undefined,
        endTime: item.end?.dateTime ? new Date(item.end.dateTime) : undefined,
        location: item.location || null,
        externalLink: foundLink || null
      }

      // Check if event for (userId, calendarEventId) exists
      const existing = await db.query.events.findFirst({
        where: and(
          eq(eventsTable.userId, userId),
          eq(eventsTable.calendarEventId, item.id)
        )
      })

      if (existing) {
        // Update existing
        await db
          .update(eventsTable)
          .set({
            eventTitle: eventData.eventTitle,
            startTime: eventData.startTime,
            endTime: eventData.endTime,
            location: eventData.location || null,
            externalLink: eventData.externalLink || null
          })
          .where(eq(eventsTable.id, existing.id))
      } else {
        // Insert new
        await db.insert(eventsTable).values(eventData)
      }
    }

    return {
      isSuccess: true,
      message: `Google Calendar events synced successfully for ${usedTimeMin.toDateString()} to ${usedTimeMax.toDateString()}.`,
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
 * -------------------------
 * Calls the Google Calendar API to retrieve events in [timeMin, timeMax] for the primary calendar.
 *
 * @param {string} accessToken - The user's Google OAuth access token
 * @param {object} options - Query parameters: timeMin, timeMax, maxResults, etc.
 * @returns {Promise<any | null>} - The JSON response from Google or null on failure.
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
 * ------------------
 * If the access token is expired, try to refresh it using the refresh token.
 *
 * @param {string} refreshToken - The stored Google refresh token for the user.
 * @returns {Promise<string | null>} - New access token or null if refresh fails.
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

    // Typically you'd also store the new token in DB with updated expiry
    // For brevity, we're just returning it here
    return tokenData.access_token
  } catch (error) {
    console.error("Error refreshing Google token:", error)
    return null
  }
}

/**
 * extractFirstLink
 * ----------------
 * Scans the text for the first http:// or https:// link and returns it. Otherwise null.
 *
 * @param {string} text - The text to scan (event description).
 * @returns {string | null} - Found link or null if none found.
 */
function extractFirstLink(text: string): string | null {
  const linkRegex = /(https?:\/\/[^\s]+)/i
  const match = text.match(linkRegex)
  return match ? match[0] : null
}

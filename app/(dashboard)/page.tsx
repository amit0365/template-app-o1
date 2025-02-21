/**
 * @description
 * A minimal "Dashboard" server page that allows a logged-in user to sync their Google Calendar events on demand.
 *
 * Key features:
 * - Displays a button that calls a server action to fetch events from Google Calendar.
 * - Renders success/failure messages based on the action's result.
 * - Only shows if the user is signed in. (If you want stricter route protection, see your `middleware.ts` logic.)
 *
 * @dependencies
 * - auth from "@clerk/nextjs/server": to retrieve userId
 * - syncCalendarEventsAction: the server action that fetches & stores events
 *
 * @notes
 * - For a more robust app, you might automatically sync on load, or show a list of synced events.
 * - We keep it simple for demonstration.
 */

/**
 * @description
 * A server component that checks if a user is logged in and renders our client component.
 */

"use server"

import { Suspense } from "react"
import { auth } from "@clerk/nextjs/server"
import SyncCalendarEventsClient from "./sync-calendar-client"

export default async function DashboardPage() {
  const { userId } = await auth()

  if (!userId) {
    return (
      <div className="container mx-auto mt-12 text-center">
        <h1 className="text-2xl font-bold">Please sign in first.</h1>
      </div>
    )
  }

  return (
    <Suspense fallback={<div className="p-6">Loading Dashboard...</div>}>
      <SyncCalendarEventsClient userId={userId} />
    </Suspense>
  )
}

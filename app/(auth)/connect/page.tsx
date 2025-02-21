/**
 * @description
 * This client page provides a "Connect Google Calendar" button for authenticated users.
 * When clicked, it navigates to /api/google/oauth, which handles both the redirect and callback phases.
 *
 * Key features:
 * - Displays a simple UI to prompt the user to connect their Google Calendar.
 * - A minimal example; in a real app, you might show the user's current connection status or errors.
 *
 * @dependencies
 * - "use client": Because we need a button the user can click (client-side).
 * - React & Next.js for typical page rendering.
 *
 * @notes
 * - The route /api/google/oauth is responsible for the entire OAuth flow.
 * - We assume the user is already authenticated by Clerk (the plan's instructions mention potential gating).
 */

"use client"

import React from "react"
import { Button } from "@/components/ui/button"
import { useRouter } from "next/navigation"

export default function ConnectGoogleCalendarPage() {
  const router = useRouter()

  const handleConnect = () => {
    // Simply push to the server route that handles Google OAuth
    router.push("/api/google/oauth")
  }

  return (
    <div className="container mx-auto flex flex-col items-center justify-center py-12">
      <h1 className="mb-6 text-2xl font-bold">Connect Google Calendar</h1>

      <p className="text-muted-foreground mb-8 max-w-md text-center text-sm">
        Connect your Google Calendar to automatically sync and enrich your
        events. You&apos;ll be asked to grant read-only access to your calendar.
      </p>

      <Button onClick={handleConnect} className="mb-4">
        Connect Google Calendar
      </Button>
    </div>
  )
}

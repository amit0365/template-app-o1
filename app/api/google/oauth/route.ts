/**
 * @description
 * This route handles Google OAuth for calendar read-only access. It performs two main functions:
 * 1. Redirect the user to Google's OAuth consent screen (if the `code` param is missing).
 * 2. Handle the callback (if `code` is present), exchanging the authorization code for tokens and storing them in the DB.
 *
 * Key features:
 * - Protects the route so only logged-in users can initiate OAuth.
 * - Fetches Google credentials (client ID, secret, redirect URI) from environment variables.
 * - Uses a standard approach for token exchange with `grant_type=authorization_code`.
 * - Updates the user's profile with the received tokens (access token, refresh token, and expiry).
 *
 * @dependencies
 * - Clerk: to identify the logged-in user
 * - updateProfileAction: to store tokens in the DB
 * - environment variables: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI
 *
 * @notes
 * - If the user is not logged in, we redirect to /login immediately.
 * - If your environment or Google console settings differ, adjust the scope or `redirect_uri`.
 * - For a production app, ensure you handle error states carefully.
 */

import { auth } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"
import { updateProfileAction } from "@/actions/db/profiles-actions"

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.readonly"

/**
 * A GET request to /api/google/oauth:
 * - If "code" query param is missing: we redirect to Google for OAuth.
 * - If "code" is present: we handle token exchange and store tokens in DB.
 */
export async function GET(request: Request) {
  // 1. Check if a user is logged in
  const { userId } = await auth()
  if (!userId) {
    // If not logged in, redirect to /login
    return NextResponse.redirect(new URL("/login", request.url))
  }

  // 2. Parse the URL and see if we have "code"
  const url = new URL(request.url)
  const code = url.searchParams.get("code")

  const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID
  const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET
  const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI) {
    console.error("Missing Google OAuth environment variables.")
    return NextResponse.json({
      error: "Server missing Google OAuth config. Please set in .env.local."
    })
  }

  // If we have NO code, let's redirect the user to Google's consent screen
  if (!code) {
    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: GOOGLE_REDIRECT_URI,
      response_type: "code",
      scope: CALENDAR_SCOPE,
      access_type: "offline", // indicates we want a refresh token
      prompt: "consent" // ensures we always get a refresh token
    })

    const googleAuthURL = `${GOOGLE_AUTH_URL}?${params.toString()}`
    return NextResponse.redirect(googleAuthURL)
  }

  // If code is present, handle the token exchange
  try {
    const tokenParams = new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: GOOGLE_REDIRECT_URI,
      grant_type: "authorization_code"
    })

    const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: tokenParams.toString()
    })

    if (!tokenResponse.ok) {
      const errorBody = await tokenResponse.text()
      console.error("Google token exchange failed:", errorBody)
      return NextResponse.json({
        error: "Failed to exchange code for tokens from Google."
      })
    }

    const tokenData = (await tokenResponse.json()) as {
      access_token: string
      refresh_token?: string
      expires_in: number
      token_type: string
      scope?: string
    }

    // expires_in is in seconds from now
    const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000)

    // 3. Store tokens in the user's profile
    const updateResult = await updateProfileAction(userId, {
      googleAccessToken: tokenData.access_token,
      googleRefreshToken: tokenData.refresh_token, // might be undefined if user already consented
      googleTokenExpires: expiresAt
    })

    if (!updateResult.isSuccess) {
      console.error("Failed to store Google tokens in profile:", updateResult)
      return NextResponse.json({ error: updateResult.message })
    }

    // 4. Redirect back to your desired page, e.g. /dashboard
    return NextResponse.redirect(new URL("/dashboard", request.url))
  } catch (error: any) {
    console.error("Error handling Google OAuth callback:", error)
    return NextResponse.json({
      error: "An unexpected error occurred during Google OAuth callback."
    })
  }
}

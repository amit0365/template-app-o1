/**
 * @description
 * Exports a single server action `processExternalLinkAction` that:
 *  1) Checks if the event has an external link,
 *  2) Scrapes the link for raw text/HTML,
 *  3) Calls GPT-4o to parse sub-event details,
 *  4) Stores the parsed sub-events in the DB.
 *
 * Key features:
 * - If no valid external link is found, returns early with a message.
 * - Uses existing actions: `getEventByIdAction` (for retrieving the event),
 *   `scrapePageContent` (for scraping), and `parseEventDetailsAction` (for GPT-4o).
 * - Returns an ActionState<void> indicating success or failure.
 *
 * @dependencies
 * - getEventByIdAction from "@/db/event-actions"
 * - scrapePageContent from "@/lib/scraping"
 * - parseEventDetailsAction from "@/actions/ai/parsing-actions"
 * - ActionState from "@/types"
 *
 * @notes
 * - Intended to be called after an event is created or updated if it has a new external link.
 * - Partial failures: if scraping fails or GPT parsing fails, returns isSuccess: false.
 */

"use server"

import { ActionState } from "@/types"
import { getEventByIdAction } from "@/db/event-actions"
import { scrapePageContent } from "@/lib/scraping"
import { parseEventDetailsAction } from "@/actions/ai/parsing-actions"

export async function processExternalLinkAction(
  eventId: string
): Promise<ActionState<void>> {
  try {
    // 1) Retrieve the event from the DB
    const eventRes = await getEventByIdAction(eventId)
    if (!eventRes.isSuccess || !eventRes.data) {
      return {
        isSuccess: false,
        message:
          "Could not find event with the specified eventId or encountered an error."
      }
    }

    const event = eventRes.data
    const link = event.externalLink?.trim()
    if (!link) {
      return {
        isSuccess: false,
        message:
          "Event does not have a valid external link to process or link is empty."
      }
    }

    // 2) Scrape the external link
    let pageContent: string
    try {
      pageContent = await scrapePageContent(link, { timeoutMs: 15000 })
    } catch (scrapeError) {
      console.error("Scraping failed:", scrapeError)
      return {
        isSuccess: false,
        message: `Failed to scrape the external link. Reason: ${String(
          scrapeError
        )}`
      }
    }

    // 3) Call GPT-4o parsing to store sub-events
    const parseRes = await parseEventDetailsAction(eventId, pageContent)
    if (!parseRes.isSuccess) {
      // pass through GPT failure reason
      return {
        isSuccess: false,
        message: `GPT-4o parsing failed: ${parseRes.message}`
      }
    }

    return {
      isSuccess: true,
      message: "Successfully scraped and parsed external link.",
      data: undefined
    }
  } catch (error) {
    console.error("processExternalLinkAction error:", error)
    return {
      isSuccess: false,
      message: "An unexpected error occurred while processing external link."
    }
  }
}
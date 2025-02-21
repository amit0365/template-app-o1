/**
 * @description
 * A server action that uses GPT-4o to parse event details (location, sub-events, speakers, topics)
 * from raw text (scraped HTML or extracted text). The action:
 * 1. Accepts an eventId and rawText
 * 2. Calls the OpenAI API with a structured prompt requesting JSON
 * 3. Parses the JSON, extracting the 'location' and an array of 'subEvents'
 * 4. Updates the event's location if provided
 * 5. Inserts each subEvent into subEventsTable via createSubEventAction
 * 6. Returns a success/failure status
 *
 * Key features:
 * - Leverages the openai.ts helper to handle the API request
 * - Ensures robust error handling if JSON parsing fails or if GPT-4 returns unexpected format
 * - Allows incremental improvement if GPT-4 fails to parse partial data
 *
 * @dependencies
 * - callOpenAiApi from @/lib/openai
 * - createSubEventAction, InsertSubEvent from @/db/sub-events-actions
 * - updateEventAction from @/db/event-actions (to update the location in eventsTable)
 * - ActionState<T> to indicate success/failure
 *
 * @notes
 * - This is a naive example prompt. Adjust or refine for real-world usage (like chunking large texts).
 * - Real usage might require more sophisticated error checking or fallback logic if GPT-4 fails.
 */

"use server"

import { callOpenAiApi, OpenAiChatMessage } from "@/lib/openai"
import { createSubEventAction } from "@/db/sub-events-actions"
import { updateEventAction } from "@/db/event-actions"
import { ActionState } from "@/types"
import { InsertSubEvent } from "@/db/schema/sub-events-schema"

/**
 * GPTSubEvent
 * -----------
 * Represents the shape of each sub-event returned by GPT-4o, which we will transform
 * into InsertSubEvent for DB insertion.
 */
interface GPTSubEvent {
  startTime?: string
  endTime?: string
  title?: string
  speaker?: string
  topic?: string
  location?: string
}

/**
 * GPTParsedSchedule
 * -----------------
 * The root-level object GPT-4o is expected to return after parsing. We attempt to
 * read 'location' (for the entire event) and 'subEvents' as an array of sessions/talks.
 */
interface GPTParsedSchedule {
  location?: string
  subEvents?: GPTSubEvent[]
}

/**
 * parseEventDetailsAction
 * -----------------------
 * Calls GPT-4o to parse sub-event details from a block of text. If successful,
 * updates the parent event's location (if found) and creates sub-events in DB.
 *
 * @async
 * @function
 * @param {string} eventId - The ID of the parent event in the DB's eventsTable
 * @param {string} rawText - The text scraped from an external source (e.g. Luma page)
 * @returns {Promise<ActionState<void>>} - The success/failure state
 *
 * Workflow:
 * 1. Prepare a system & user prompt encouraging GPT-4o to return strict JSON.
 * 2. Call GPT-4o with the text.
 * 3. Parse the JSON to extract location and an array of subEvents.
 * 4. If location is present, update the eventsTable's location field.
 * 5. For each subEvent, insert a new record in subEventsTable.
 *
 * @example
 * ```ts
 * const result = await parseEventDetailsAction("some-event-uuid", pageHtml);
 * if(result.isSuccess) {
 *   console.log("Successfully parsed & stored sub-events!");
 * } else {
 *   console.error("Parsing failed:", result.message);
 * }
 * ```
 */
export async function parseEventDetailsAction(
  eventId: string,
  rawText: string
): Promise<ActionState<void>> {
  try {
    // 1. Build the messages for GPT-4o
    const messages: OpenAiChatMessage[] = [
      {
        role: "system",
        content: `
You are a scheduling assistant. You will receive event descriptions or transcripts (possibly from a website).
Your job is to parse them into structured JSON with the following shape:

{
  "location": string or null,     // the venue or location if available
  "subEvents": [
    {
      "startTime": string in ISO or approximate format,
      "endTime": string in ISO or approximate format,
      "title": string,
      "speaker": string,
      "topic": string,
      "location": string // optional if sub-event location differs from main
    },
    ...
  ]
}

Provide valid JSON only. No extra keys. No markdown.
`
      },
      {
        role: "user",
        content: `
Here is the raw text from the event page. 
Please parse it into strict JSON following the specification above.

Raw text:
""" 
${rawText}
"""
`
      }
    ]

    // 2. Call GPT-4o
    const rawResponse = await callOpenAiApi(messages, "gpt-4", 0.7)

    // 3. Attempt to parse JSON
    let parsed: GPTParsedSchedule
    try {
      parsed = JSON.parse(rawResponse) as GPTParsedSchedule
    } catch (jsonError) {
      console.error("JSON parsing error from GPT-4o response:", rawResponse)
      return {
        isSuccess: false,
        message:
          "GPT-4o response was not valid JSON. Check console for raw output."
      }
    }

    // 4. Optionally update the event's location if found
    if (parsed.location && parsed.location.trim()) {
      // We can call updateEventAction to set 'location'
      await updateEventAction(eventId, { location: parsed.location.trim() })
    }

    // 5. Insert each subEvent into subEventsTable
    if (parsed.subEvents && parsed.subEvents.length > 0) {
      for (const gptSub of parsed.subEvents) {
        const subEventData: InsertSubEvent = {
          eventId,
          subEventName: gptSub.title?.trim() || "Untitled Session",
          startTime: gptSub.startTime ? new Date(gptSub.startTime) : undefined,
          endTime: gptSub.endTime ? new Date(gptSub.endTime) : undefined,
          speaker: gptSub.speaker?.trim() || null,
          topic: gptSub.topic?.trim() || null,
          location: gptSub.location?.trim() || null
        }

        // Create the sub-event
        await createSubEventAction(subEventData)
      }
    }

    return {
      isSuccess: true,
      message: "Successfully parsed and stored sub-events from GPT-4o.",
      data: undefined
    }
  } catch (error) {
    console.error("parseEventDetailsAction error:", error)
    return {
      isSuccess: false,
      message: "Failed to parse event details from GPT-4o."
    }
  }
}
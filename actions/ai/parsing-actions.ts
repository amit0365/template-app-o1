/**
 * @description
 * A server action that uses GPT-4o (e.g. "gpt-4o-mini") to parse event details (location, sub-events, speakers)
 * from raw text. 
 *
 * Key changes:
 * - We removed the date/time parsing logic. We simply store the raw strings from GPT into `startTime`/`endTime`.
 * - `startTime`/`endTime` are text columns in the DB, so we can store "4-5 pm", "4:00 PM", or any free-form string.
 * - No time-range logic or skipping sub-events for invalid times. 
 * - We still do chunking if text > 100k chars, to avoid token limits.
 * - We still store speakerPosition and speakerCompany if GPT provides them.
 * - We strip triple backticks if GPT encloses the JSON in code fences (```json ... ```).
 */

"use server"

import { callOpenAiApi, OpenAiChatMessage } from "@/lib/openai"
import { createSubEventAction } from "@/db/sub-events-actions"
import { getEventByIdAction, updateEventAction } from "@/db/event-actions"
import { ActionState } from "@/types"
import { InsertSubEvent } from "@/db/schema/sub-events-schema"

/**
 * GPTSubEvent
 * -----------
 * The shape we want from GPT for each sub-event:
 *  - "speakerPosition", "speakerCompany" for speaker details
 *  - No "topic" field
 *  - `startTime` & `endTime` stay as strings, e.g. "4-5 pm"
 */
interface GPTSubEvent {
  startTime?: string
  endTime?: string
  title?: string
  speaker?: string
  speakerPosition?: string
  speakerCompany?: string
  location?: string
}

/**
 * GPTParsedSchedule
 * -----------------
 * The root-level object from GPT:
 *  - "location": main event location
 *  - "subEvents": array of GPTSubEvent
 */
interface GPTParsedSchedule {
  location?: string
  subEvents?: GPTSubEvent[]
}

/**
 * chunkText
 * ---------
 * Splits text into 100k-char chunks if needed (naive approach).
 */
function chunkText(text: string, maxLen: number): string[] {
  const chunks: string[] = []
  let start = 0

  while (start < text.length) {
    const end = start + maxLen
    chunks.push(text.slice(start, end))
    start = end
  }
  return chunks
}

/**
 * parseSingleChunk
 * ----------------
 * Calls GPT with a system prompt describing sub-event fields:
 *   "startTime, endTime, title, speaker, speakerPosition, speakerCompany, location"
 * No "topic" field. Then we strip any triple backticks to avoid JSON parse errors.
 */
async function parseSingleChunk(
  eventId: string,
  chunk: string,
  chunkIndex: number
): Promise<GPTParsedSchedule> {
  const messages: OpenAiChatMessage[] = [
    {
      role: "system",
      content: `
You are a scheduling assistant. You receive part of an event page as text.
Return valid JSON with the following structure:

{
  "location": string or null,
  "subEvents": [
    {
      "startTime": string,
      "endTime": string,
      "title": string,
      "speaker": string,
      "speakerPosition": string,
      "speakerCompany": string,
      "location": string
    },
    ...
  ]
}

No other fields. Do not return "topic".
If the speaker has details like "(Position @ Company)", you can 
split them into "speakerPosition" and "speakerCompany" as best as possible. 
If unknown, make them empty strings or null. 
Output must be strictly JSON, no extra commentary.
`
    },
    {
      role: "user",
      content: `
Chunk #${chunkIndex} for event ID ${eventId}.
Parse the following partial text into the JSON format. 
If uncertain, do your best with this partial chunk. 
Text:
""" 
${chunk}
"""
`
    }
  ]

  // 1) Call GPT for a chunk
  let rawResponse = await callOpenAiApi(messages, "gpt-4o-mini", 0.7)

  // 2) Strip triple backticks if GPT used code fences (```json ... ```)
  rawResponse = rawResponse.replace(/^```(\w+)?\n?/, "").replace(/```$/, "")

  // 3) Parse the JSON
  let parsed: GPTParsedSchedule
  try {
    parsed = JSON.parse(rawResponse) as GPTParsedSchedule
  } catch (err) {
    console.error(`Chunk #${chunkIndex} JSON parse error:`, rawResponse)
    throw new Error(`Chunk #${chunkIndex} GPT response was not valid JSON.`)
  }

  return parsed
}

/**
 * parseEventDetailsAction
 * -----------------------
 * Main server action. If rawText <= 100k chars, parse once. Else, chunk it.
 * Merges subEvents from each chunk, then calls handleParsedSchedule to do DB insertion.
 *
 * Key difference: We do NOT parse times as Date objects. We store them as raw strings.
 */
export async function parseEventDetailsAction(
  eventId: string,
  rawText: string
): Promise<ActionState<void>> {
  try {
    const MAX_CHARS_PER_CHUNK = 100_000
    if (rawText.length <= MAX_CHARS_PER_CHUNK) {
      // single chunk parse
      const singleResult = await parseSingleChunk(eventId, rawText, 1)
      await handleParsedSchedule(eventId, singleResult, 1)
      return {
        isSuccess: true,
        message: "Successfully parsed sub-events from single chunk.",
        data: undefined
      }
    }

    // multiple chunk parse
    const textChunks = chunkText(rawText, MAX_CHARS_PER_CHUNK)
    let fullSubEvents: GPTSubEvent[] = []
    let eventLocation: string | undefined

    for (let i = 0; i < textChunks.length; i++) {
      const chunkIndex = i + 1
      try {
        const parsedChunk = await parseSingleChunk(eventId, textChunks[i], chunkIndex)

        // adopt location from first chunk if present
        if (chunkIndex === 1 && parsedChunk.location) {
          eventLocation = parsedChunk.location.trim()
        }

        if (parsedChunk.subEvents && parsedChunk.subEvents.length > 0) {
          fullSubEvents.push(...parsedChunk.subEvents)
        }
      } catch (chunkErr) {
        console.warn(
          `parseEventDetailsAction: chunk #${chunkIndex} parse error => `,
          chunkErr
        )
      }
    }

    // final schedule object
    const merged: GPTParsedSchedule = {
      location: eventLocation,
      subEvents: fullSubEvents
    }

    await handleParsedSchedule(eventId, merged, 0)

    return {
      isSuccess: true,
      message: `Successfully parsed sub-events from ${textChunks.length} chunks.`,
      data: undefined
    }
  } catch (error) {
    console.error("parseEventDetailsAction error:", error)
    return {
      isSuccess: false,
      message: "Failed to parse event details from GPT-4o (mini)."
    }
  }
}

/**
 * handleParsedSchedule
 * --------------------
 * 1) Looks up the parent event for location merging
 * 2) Possibly updates parent's location from GPT if 'parsed.location'
 * 3) Inserts each subEvent into DB, storing times as raw strings (no date parsing).
 *    - If subEvent's startTime/endTime is empty, we store null. 
 */
async function handleParsedSchedule(
  eventId: string,
  parsed: GPTParsedSchedule,
  chunkIndex: number
) {
  // fetch parent event for location merging
  const eventRes = await getEventByIdAction(eventId)
  let parentLoc = ""
  if (eventRes.isSuccess && eventRes.data) {
    parentLoc = eventRes.data.location?.trim() || ""
  }

  // optionally update parent's location
  if (parsed.location && parsed.location.trim()) {
    await updateEventAction(eventId, { location: parsed.location.trim() })
  }

  const subEvents = parsed.subEvents || []
  if (subEvents.length === 0) {
    console.log(`No subEvents found for chunkIndex=${chunkIndex}.`)
    return
  }

  console.log(
    `handleParsedSchedule: chunkIndex=${chunkIndex}, subEvents count=${subEvents.length}`
  )

  // insert each sub-event
  for (const gptSub of subEvents) {
    // No date parsing. We simply store the raw strings or null if empty.
    const start = gptSub.startTime?.trim() || null
    const end = gptSub.endTime?.trim() || null

    // combine parent's location with subEvent's location
    const childLoc = gptSub.location?.trim() || ""
    let finalLoc = ""
    if (parentLoc && childLoc) {
      finalLoc = `${parentLoc} -- ${childLoc}`
    } else if (parentLoc && !childLoc) {
      finalLoc = parentLoc
    } else if (!parentLoc && childLoc) {
      finalLoc = childLoc
    }

    // build the subEvent insertion with string times
    const subEventData: InsertSubEvent = {
      eventId,
      startTime: start,
      endTime: end,
      subEventName: gptSub.title?.trim() || "Untitled Session",
      speaker: gptSub.speaker?.trim() || null,
      speakerPosition: gptSub.speakerPosition?.trim() || null,
      speakerCompany: gptSub.speakerCompany?.trim() || null,
      location: finalLoc || null
    }

    try {
      const createResult = await createSubEventAction(subEventData)
      if (!createResult.isSuccess) {
        console.error("Sub-event insertion failed:", createResult.message)
      }
    } catch (err) {
      console.error("DB insert error for sub-event:", err)
    }
  }
}

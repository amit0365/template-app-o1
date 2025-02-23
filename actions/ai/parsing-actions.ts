/**
 * @description
 * A server action that uses GPT-4o (e.g. "gpt-4o-mini") to parse event details (location, sub-events, speakers)
 * from raw text.
 *
 * Key changes in this version:
 * - We specifically instruct GPT to produce sub-event times in a 12-hour format with am/pm,
 *   such as "9am" or "4:30pm", with no date or offset.
 * - We still store these times as text in the DB.
 * - All other logic (chunking, speaker parsing, etc.) remains the same.
 * - We strip triple backticks if GPT encloses the JSON in code fences (```json ... ```).
 *
 * -- Deduplication change --
 * After aggregating sub-events from all chunks, we call `deduplicateSubEvents(subEvents)`
 * which ensures that if `title, startTime, and endTime` match, we only keep one copy.
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
 *  - "startTime", "endTime" => short 12-hour times (e.g. "9am", "4:30pm")
 *  - "title" => name/title of the sub-event
 *  - "speaker", "speakerPosition", "speakerCompany" => optional speaker details
 *  - "location" => optional location
 */
interface GPTSubEvent {
  startTime?: string
  endTime?: string
  title?: string
  speaker?: string
  speakerPosition?: string
  speakerCompany?: string
  location?: string
  eventId?: string
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
 * We specifically instruct GPT to return times in a 12-hour format with am/pm.
 *
 * Then we strip any triple backticks to avoid JSON parse errors.
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

Important:
- "startTime" and "endTime" MUST be 12-hour times with am/pm.
  Examples: "9am", "4:30pm", "11:05am".
- No date, no time zone offset, no 24-hour format.
- If unknown, make them empty strings or null.
- If the speaker has details like "(Position @ Company)", you can
  split them into "speakerPosition" and "speakerCompany" as best as possible.
- Output must be strictly JSON, with NO extra commentary or code blocks.
`
    },
    {
      role: "user",
      content: `
Chunk #${chunkIndex} for event ID ${eventId}.
Parse the following partial text into the JSON format.
If uncertain, do your best with 12-hour times.
Text:
""" 
${chunk}
"""
`
    }
  ]

  // 1) Call GPT for this chunk
  let rawResponse = await callOpenAiApi(messages, "gpt-4o-mini", 0.7)

  // 2) Strip triple backticks if GPT used code fences
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
 * deduplicateSubEvents
 * --------------------
 * Removes duplicates if (title, startTime, endTime) match (case-insensitive).
 */
function deduplicateSubEvents(subEvents: GPTSubEvent[]): GPTSubEvent[] {
  const uniqueMap = new Map<string, GPTSubEvent>()

  for (const se of subEvents) {
    const speaker = (se.speaker ?? "").trim().toLowerCase()
    const start = (se.startTime ?? "").trim().toLowerCase()
    const end = (se.endTime ?? "").trim().toLowerCase()
    // Build a composite key
    const key = `${speaker}||${start}||${end}`

    if (!uniqueMap.has(key)) {
      uniqueMap.set(key, se)
    }
    // else: we skip it since it's considered a duplicate
  }

  return Array.from(uniqueMap.values())
}

/**
 * parseEventDetailsAction
 * -----------------------
 * Main server action. If rawText <= 100k chars, parse once. Else, chunk it.
 * Merges subEvents from each chunk, then calls handleParsedSchedule to do DB insertion.
 *
 * We store the raw 12-hour times as text in the DB. No date/time parsing here.
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

      // Deduplicate subEvents from single chunk
      if (singleResult.subEvents) {
        singleResult.subEvents = deduplicateSubEvents(singleResult.subEvents)
      }

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

    // Deduplicate across all chunks
    fullSubEvents = deduplicateSubEvents(fullSubEvents)

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
    // We do NOT parse times. We simply store the raw strings or null if empty.
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

    // build the subEvent insertion data
    const subEventData: InsertSubEvent = {
      eventId,
      startTime: start,
      endTime: end,
      subEventName: gptSub.title?.trim() || "Untitled Session",
      speaker: gptSub.speaker?.trim() || null,
      speakerPosition: gptSub.speakerPosition?.trim() || null,
      speakerCompany: gptSub.speakerCompany?.trim() || null,
      location: finalLoc || null,
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

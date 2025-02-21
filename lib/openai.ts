/**
 * @description
 * Provides a helper function to call the OpenAI (GPT-4o) API with a given prompt.
 * This isolates the API call logic (e.g., fetch, headers, error handling) into
 * a single module.
 *
 * Key features:
 * - Reads OPENAI_API_KEY from environment variables
 * - Sends a POST request to the OpenAI API's /v1/chat/completions or /v1/completions endpoint
 * - Returns the assistant's content string or throws an error on failure
 *
 * @dependencies
 * - fetch (built-in)
 * - process.env.OPENAI_API_KEY for authentication
 *
 * @notes
 * - If GPT-4o is a custom endpoint with a different base URL, adjust the baseUrl accordingly.
 * - This example uses a chat-completion format (role: system, user) for GPT-4. Adjust as needed.
 * - We do minimal error handling here; the caller can catch/handle errors.
 */

export interface OpenAiChatMessage {
  role: "system" | "user" | "assistant"
  content: string
}

export interface OpenAiCompletionResponse {
  id: string
  object: string
  created: number
  choices: Array<{
    index: number
    message: {
      role: "assistant"
      content: string
    }
    finish_reason: string
  }>
  usage: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1/chat/completions"

/**
 * callOpenAiApi
 * -------------
 * Sends a chat completion request to the OpenAI API (likely GPT-4 or GPT-4o),
 * returning the assistant's response as a string.
 *
 * @async
 * @function
 * @param {OpenAiChatMessage[]} messages - An array of messages representing the conversation so far.
 * @param {string} [model="gpt-4"] - The OpenAI model to use. For GPT-4o, set accordingly (ex: "gpt-4").
 * @param {number} [temperature=0.7] - The sampling temperature to use (higher = more creative).
 * @returns {Promise<string>} - The assistant's reply content.
 *
 * @throws Will throw an Error if the response is invalid or if there's an issue with the request.
 *
 * @example
 * ```ts
 * const messages: OpenAiChatMessage[] = [
 *   { role: "system", content: "You are an event parsing assistant..." },
 *   { role: "user", content: "Here is some event text..." }
 * ]
 * const response = await callOpenAiApi(messages, "gpt-4", 0.7)
 * console.log("Assistant said:", response)
 * ```
 */
export async function callOpenAiApi(
  messages: OpenAiChatMessage[],
  model: string = "gpt-4",
  temperature: number = 0.7
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY not set in environment variables.")
  }

  const response = await fetch(DEFAULT_OPENAI_BASE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages,
      temperature
    })
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(
      `OpenAI API returned an error: ${response.status} ${response.statusText}\n${errorText}`
    )
  }

  const jsonData = (await response.json()) as OpenAiCompletionResponse
  if (!jsonData.choices || jsonData.choices.length === 0) {
    throw new Error("No completion choices returned by the OpenAI API.")
  }

  const assistantMessage = jsonData.choices[0].message.content
  return assistantMessage
}

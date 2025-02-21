/**
 * @description
 * This file provides a utility function for scraping web pages.
 * It retrieves the raw HTML content of a given URL and returns it as a string.
 * Optionally, an AbortController is used to implement a timeout, preventing the request
 * from hanging indefinitely if the server is slow or unresponsive.
 *
 * Key features:
 * - Fetches HTML from a given URL using the built-in fetch API (Node.js 18+ or Next.js runtime).
 * - Optionally times out the request if it exceeds a specified number of milliseconds.
 * - Returns the page content as a plain string, allowing further parsing or
 *   usage (e.g., passing to GPT-4o for structured data extraction).
 * - Handles response status checks and throws an error if the server returns a non-OK status code.
 *
 * @dependencies
 * - Built-in fetch: Used for making the HTTP request.
 * - AbortController: Used for creating a timeout mechanism.
 *
 * @notes
 * - This is a minimal approach returning raw HTML via response.text().
 * - If more complex parsing is required (e.g., DOM traversal), consider using
 *   a library like cheerio. That would involve something like:
 *     import * as cheerio from "cheerio";
 *     const $ = cheerio.load(htmlString);
 * - For large pages or advanced parsing, ensure you handle memory usage, partial fetch, etc.
 * - This utility will be used in Step 6 and Step 7 to eventually pass the scraped text to GPT-4o.
 */

export interface ScrapeOptions {
  /**
   * The maximum time, in milliseconds, to wait for the request to complete
   * before aborting. If set to 0 or undefined, no timeout is enforced.
   */
  timeoutMs?: number
}

/**
 * scrapePageContent
 * -----------------
 * Fetches the HTML from a given URL and returns it as a string.
 * Throws an error if the response is not OK (status >= 400) or if the request times out.
 *
 * @async
 * @function
 * @param {string} url - The URL of the page to scrape.
 * @param {ScrapeOptions} [options] - Optional configuration (e.g., request timeout).
 * @returns {Promise<string>} - A promise that resolves to the page's HTML content as a string.
 *
 * @example
 * ```ts
 * const html = await scrapePageContent("https://example.com");
 * console.log("HTML length:", html.length);
 * ```
 *
 * @throws Will throw an error if the response status is not OK or the request times out.
 *
 * @notes
 * - Uses AbortController to cancel the request if timeoutMs is specified and the time is exceeded.
 * - If no timeout is desired, pass options.timeoutMs = 0 or omit the options.
 * - This function does not parse the HTML or handle complex scraping logic beyond retrieval.
 */
export async function scrapePageContent(
  url: string,
  options?: ScrapeOptions
): Promise<string> {
  const controller = new AbortController()
  const { timeoutMs = 0 } = options || {}

  // If a timeout is specified, set up a timer to abort the request
  let timeoutId: NodeJS.Timeout | undefined = undefined
  if (timeoutMs > 0) {
    timeoutId = setTimeout(() => {
      controller.abort()
    }, timeoutMs)
  }

  try {
    // Perform the fetch with the optional controller for cancellation
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal
    })

    // Check the response status
    if (!response.ok) {
      throw new Error(
        `Failed to fetch ${url}. Server responded with ${response.status} ${response.statusText}`
      )
    }

    // Read and return the response as text
    const html = await response.text()
    return html
  } catch (error) {
    // If we abort or get a network error, throw
    if ((error as Error).name === "AbortError") {
      throw new Error(`Request to ${url} timed out after ${timeoutMs} ms`)
    }
    throw error
  } finally {
    // Clear the timeout if set
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
  }
}

/**
 * Evidence for a challenge, via Wikipedia's OpenSearch endpoint.
 *
 * Chosen because it needs no API key and sends `Access-Control-Allow-Origin: *`,
 * so a static page can call it directly. Its search ranking also absorbs
 * spelling variation, which is exactly the leeway a trivia answer deserves.
 */

const ENDPOINT = 'https://en.wikipedia.org/w/api.php'

export interface WikiResult {
  title: string
  description: string
  url: string
}

/** OpenSearch replies as [term, titles[], descriptions[], urls[]]. */
type OpenSearchResponse = [string, string[], string[], string[]]

export async function lookup(term: string, signal?: AbortSignal): Promise<WikiResult[]> {
  const params = new URLSearchParams({
    action: 'opensearch',
    search: term,
    limit: '5',
    namespace: '0',
    format: 'json',
    origin: '*',
  })

  const response = await fetch(`${ENDPOINT}?${params}`, { signal })
  if (!response.ok) throw new Error(`Wikipedia returned ${response.status}`)

  const [, titles, descriptions, urls] = (await response.json()) as OpenSearchResponse
  return titles.map((title, i) => ({
    title,
    description: descriptions[i] ?? '',
    url: urls[i] ?? '',
  }))
}

/** Fallback when Wikipedia has nothing — let the human go look. */
export function webSearchUrl(term: string): string {
  return `https://duckduckgo.com/?q=${encodeURIComponent(term)}`
}

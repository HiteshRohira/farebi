import {
  CELEBRITY_NAMES,
  WIKIPEDIA_TITLE_OVERRIDES,
} from '@/lib/celebrity-names'

export type Celebrity = {
  name: string
  wikipediaTitle: string
}

export const CELEBRITIES: Array<Celebrity> = CELEBRITY_NAMES.map((name) => ({
  name,
  wikipediaTitle: WIKIPEDIA_TITLE_OVERRIDES[name] ?? name,
}))

export function getGoogleSearchUrl(query: string) {
  return `https://www.google.com/search?q=${encodeURIComponent(query.trim())}`
}

export async function resolveCelebrityPhoto(wikipediaTitle: string) {
  const parameters = new URLSearchParams({
    action: 'query',
    origin: '*',
    format: 'json',
    formatversion: '2',
    prop: 'pageimages',
    piprop: 'thumbnail|original',
    pithumbsize: '900',
    redirects: '1',
    titles: wikipediaTitle,
  })
  const response = await fetch(
    `https://en.wikipedia.org/w/api.php?${parameters}`,
  )
  if (!response.ok) return undefined
  const result = (await response.json()) as {
    query?: {
      pages?: Array<{
        original?: { source?: string }
        thumbnail?: { source?: string }
      }>
    }
  }
  const page = result.query?.pages?.[0]
  return page?.thumbnail?.source ?? page?.original?.source
}

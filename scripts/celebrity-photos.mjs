import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'

const projectRoot = path.resolve(import.meta.dirname, '..')
const executeFile = promisify(execFile)
const args = process.argv.slice(2)
const outputArgument = args.find((argument) => argument.startsWith('--output='))
const limitArgument = args.find((argument) => argument.startsWith('--limit='))
const outputPath = outputArgument?.slice('--output='.length)
const limit = limitArgument
  ? Number.parseInt(limitArgument.slice('--limit='.length), 10)
  : undefined

if (args.includes('--help')) {
  console.log(`Usage: pnpm celebrities:photos -- [options]

Options:
  --limit=N       Audit only the first N names
  --output=PATH   Write the resolved photo manifest as JSON
  --help          Show this message`)
  process.exit(0)
}

if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
  throw new Error('--limit must be a positive integer.')
}

const temporaryDirectory = await mkdtemp(
  path.join(tmpdir(), 'farebi-celebrity-photos-'),
)

try {
  const bundledCatalogue = path.join(temporaryDirectory, 'catalogue.mjs')
  await executeFile(
    'pnpm',
    [
      'exec',
      'esbuild',
      path.join(projectRoot, 'src/lib/celebrity-names.ts'),
      '--bundle',
      '--platform=node',
      '--format=esm',
      `--outfile=${bundledCatalogue}`,
      '--log-level=silent',
    ],
    { cwd: projectRoot },
  )

  const { CELEBRITY_NAMES, WIKIPEDIA_TITLE_OVERRIDES } = await import(
    pathToFileURL(bundledCatalogue).href
  )
  const names = limit ? CELEBRITY_NAMES.slice(0, limit) : CELEBRITY_NAMES
  const entries = names.map((name) => ({
    name,
    wikipediaTitle: WIKIPEDIA_TITLE_OVERRIDES[name] ?? name,
  }))
  const manifest = []

  for (let index = 0; index < entries.length; index += 25) {
    const batch = entries.slice(index, index + 25)
    manifest.push(...(await fetchWikipediaBatch(batch)))
    console.log(
      `Checked ${Math.min(index + batch.length, entries.length)}/${entries.length}`,
    )
  }

  const missing = manifest.filter((entry) => !entry.imageUrl)
  console.log(
    `\n${manifest.length - missing.length}/${manifest.length} entries have a photo.`,
  )
  if (missing.length > 0) {
    console.log(`Name-only entries (${missing.length}):`)
    for (const entry of missing) console.log(`- ${entry.name}`)
  }

  if (outputPath) {
    const absoluteOutputPath = path.resolve(projectRoot, outputPath)
    await mkdir(path.dirname(absoluteOutputPath), { recursive: true })
    await writeFile(
      absoluteOutputPath,
      `${JSON.stringify(manifest, null, 2)}\n`,
      'utf8',
    )
    console.log(`\nWrote ${absoluteOutputPath}`)
  }
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true })
}

async function fetchWikipediaBatch(entries) {
  const parameters = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    inprop: 'url',
    piprop: 'thumbnail|original',
    pithumbsize: '900',
    prop: 'info|pageimages',
    redirects: '1',
    titles: entries.map((entry) => entry.wikipediaTitle).join('|'),
  })
  const response = await fetchWithRetry(
    `https://en.wikipedia.org/w/api.php?${parameters}`,
  )
  const result = await response.json()
  const aliases = new Map()
  for (const item of result.query?.normalized ?? []) {
    aliases.set(item.from, item.to)
  }
  for (const item of result.query?.redirects ?? []) {
    aliases.set(item.from, item.to)
  }
  const pages = new Map(
    (result.query?.pages ?? []).map((page) => [page.title, page]),
  )

  return entries.map((entry) => {
    let resolvedTitle = entry.wikipediaTitle
    for (let step = 0; step < 5 && aliases.has(resolvedTitle); step += 1) {
      resolvedTitle = aliases.get(resolvedTitle)
    }
    const page = pages.get(resolvedTitle)
    return {
      name: entry.name,
      wikipediaTitle: entry.wikipediaTitle,
      resolvedTitle: page?.title,
      pageUrl: page?.fullurl,
      imageUrl: page?.thumbnail?.source ?? page?.original?.source,
    }
  })
}

async function fetchWithRetry(url) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Farebi-party-game/1.0 photo-audit' },
    })
    if (response.ok) return response
    if (attempt === 3 || (response.status !== 429 && response.status < 500)) {
      throw new Error(`Wikipedia request failed with HTTP ${response.status}.`)
    }

    const retryAfterSeconds = Number.parseInt(
      response.headers.get('retry-after') ?? '',
      10,
    )
    const delay = Number.isFinite(retryAfterSeconds)
      ? Math.min(retryAfterSeconds * 1000, 30_000)
      : 1000 * 2 ** attempt
    await new Promise((resolve) => setTimeout(resolve, delay))
  }

  throw new Error('Wikipedia request failed.')
}

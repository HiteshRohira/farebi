import { describe, expect, it } from 'vitest'

import {
  CELEBRITY_NAMES,
  WIKIPEDIA_TITLE_OVERRIDES,
} from '../src/lib/celebrity-names'
import { getGoogleSearchUrl } from '../src/lib/celebrities'

describe('celebrity catalogue', () => {
  it('stays within the deliberately curated party-game size', () => {
    expect(CELEBRITY_NAMES.length).toBeGreaterThanOrEqual(200)
    expect(CELEBRITY_NAMES.length).toBeLessThan(500)
  })

  it('has no case-insensitive duplicate names', () => {
    const normalized = CELEBRITY_NAMES.map((name) => name.toLocaleLowerCase())
    expect(new Set(normalized).size).toBe(normalized.length)
  })

  it('mixes durable Indian recognition with globally familiar figures', () => {
    expect(CELEBRITY_NAMES).toEqual(
      expect.arrayContaining([
        'A. R. Rahman',
        'Mahatma Gandhi',
        'M. S. Dhoni',
        'Rajinikanth',
        'Shah Rukh Khan',
        'Virat Kohli',
        'Leonardo DiCaprio',
        'Michael Jackson',
        'Nelson Mandela',
        'Taylor Swift',
        'Harsh Gujral',
        'Javed Akhtar',
        'Kiku Sharda',
      ]),
    )
  })

  it('rejects niche or news-cycle-heavy candidates', () => {
    expect(CELEBRITY_NAMES).not.toEqual(
      expect.arrayContaining([
        'Ban Ki-moon',
        'Bernie Sanders',
        'Jenna Ortega',
        'Kai Cenat',
        'Ken Jeong',
        'Neeti Mohan',
      ]),
    )
  })

  it('only defines Wikipedia exceptions for catalogue entries', () => {
    const names = new Set<string>(CELEBRITY_NAMES)
    expect(
      Object.keys(WIKIPEDIA_TITLE_OVERRIDES).every((name) => names.has(name)),
    ).toBe(true)
  })

  it('builds a classic encoded Google search link', () => {
    expect(getGoogleSearchUrl('  Shah Rukh Khan & co  ')).toBe(
      'https://www.google.com/search?q=Shah%20Rukh%20Khan%20%26%20co',
    )
  })
})

import { describe, expect, it } from 'vitest'
import { findNearDuplicate, levenshtein, normalize } from './normalize'

describe('normalize', () => {
  it('lowercases and collapses whitespace', () => {
    expect(normalize('  Le   CHIFFRE ')).toBe('le chiffre')
  })

  it('strips diacritics', () => {
    expect(normalize('Café')).toBe('cafe')
    expect(normalize('Zoë')).toBe('zoe')
  })

  it('strips punctuation', () => {
    expect(normalize("Dr. No!")).toBe('dr no')
    expect(normalize('Wall-E')).toBe('wall e')
  })

  it('drops a leading article', () => {
    expect(normalize('The Beatles')).toBe('beatles')
    expect(normalize('A Bug’s Life')).toBe('bug s life')
  })

  it('does not drop an article that is not leading', () => {
    expect(normalize('Alice the Goon')).toBe('alice the goon')
  })

  it('collapses to empty for punctuation-only input', () => {
    expect(normalize('!!!')).toBe('')
  })
})

describe('levenshtein', () => {
  it('is zero for identical strings', () => {
    expect(levenshtein('abc', 'abc')).toBe(0)
  })

  it('handles empty strings', () => {
    expect(levenshtein('', 'abc')).toBe(3)
    expect(levenshtein('abc', '')).toBe(3)
  })

  it('counts single edits', () => {
    expect(levenshtein('cat', 'cot')).toBe(1)
    expect(levenshtein('cat', 'cats')).toBe(1)
    expect(levenshtein('cats', 'cat')).toBe(1)
  })

  it('is symmetric', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3)
    expect(levenshtein('sitting', 'kitten')).toBe(3)
  })
})

describe('findNearDuplicate', () => {
  it('catches an exact repeat', () => {
    expect(findNearDuplicate('Ohio', ['Iowa', 'Ohio'])).toBe('Ohio')
  })

  it('catches a repeat that differs only by case, article or punctuation', () => {
    expect(findNearDuplicate('the beatles', ['The Beatles'])).toBe('The Beatles')
  })

  it('catches a plausible typo in a long word', () => {
    expect(findNearDuplicate('Massachussets', ['Massachusetts'])).toBe('Massachusetts')
  })

  it('does not collide distinct short words', () => {
    // The whole reason the threshold scales with length.
    expect(findNearDuplicate('Mali', ['Bali'])).toBeNull()
    expect(findNearDuplicate('Chad', ['Chat'])).toBeNull()
  })

  it('does not collide distinct long words', () => {
    expect(findNearDuplicate('Argentina', ['Australia'])).toBeNull()
  })

  it('returns null against an empty list', () => {
    expect(findNearDuplicate('Ohio', [])).toBeNull()
  })

  it('ignores unusable input', () => {
    expect(findNearDuplicate('!!!', ['Ohio'])).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'
import { fmt, toCsv } from './format'

describe('fmt', () => {
  it('formats numbers without eating integer zeros', () => {
    expect(fmt(0, 0)).toBe('0')
    expect(fmt(10, 0)).toBe('10')
    expect(fmt(100, 0)).toBe('100')
    expect(fmt(7.5, 2)).toBe('7.5')
    expect(fmt(8, 2)).toBe('8')
    expect(fmt(0, 1)).toBe('0')
    expect(fmt(79.25, 1)).toBe('79.3')
    expect(fmt(null)).toBe('—')
  })
})

describe('toCsv', () => {
  it('quotes fields with separators', () => {
    const cols = [{ header: 'A', get: () => '' }, { header: 'B;x', get: () => '' }]
    expect(toCsv(cols, [['1', 'say "hi"; ok']])).toBe('A;"B;x"\r\n1;"say ""hi""; ok"')
  })
})

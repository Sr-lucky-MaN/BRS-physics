import { describe, expect, it } from 'vitest'
import { averageYearMark, numericMark } from './year-marks'

describe('year marks', () => {
  it('reads a numeric mark from a cell', () => {
    expect(numericMark('5')).toBe(5)
    expect(numericMark('4,5')).toBe(4.5)
    expect(numericMark('н 5')).toBe(5)
    expect(numericMark('н')).toBeNull()
    expect(numericMark('')).toBeNull()
  })

  it('averages period marks and rounds half up', () => {
    expect(averageYearMark(['5', '4', '3', '4'])).toBe('4')
    expect(averageYearMark(['5', '4'])).toBe('5')
    expect(averageYearMark(['3', '4', '5'])).toBe('4')
    expect(averageYearMark(['5', 'н', '—', null])).toBe('5')
    expect(averageYearMark(['н', '—', null])).toBe('')
  })
})

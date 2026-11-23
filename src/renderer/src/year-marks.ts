/** Parse a numeric mark out of a journal cell ('5', '4,5', 'н 5'). */
export function numericMark(raw: string | number | null | undefined): number | null {
  if (raw == null) return null
  const match = String(raw).replace(/н/gi, ' ').match(/\d+(?:[.,]\d+)?/)
  if (!match) return null
  const value = Number(match[0].replace(',', '.'))
  return Number.isFinite(value) ? value : null
}

/** Arithmetic mean of period marks, rounded half-up; '' when there are no numeric marks. */
export function averageYearMark(marks: (string | number | null | undefined)[]): string {
  const values = marks.map(numericMark).filter((value): value is number => value != null)
  if (!values.length) return ''
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  return String(Math.floor(mean + 0.5))
}

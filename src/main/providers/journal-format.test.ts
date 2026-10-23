import { describe, expect, it } from 'vitest'
import { journalDate, parseGradeCell, parseScoleConfig, periodsFromColumns, typeFromTopic } from './journal-format'

describe('journal date and periods', () => {
  it('decodes the school-year month index including year rollover', () => {
    expect(journalDate('d016', 2026)).toBe('2026-09-16')
    expect(journalDate('d425', 2026)).toBe('2027-01-25')
    expect(journalDate('d929', 2026)).toBe('2027-06-29')
    expect(journalDate('d931', 2026)).toBeNull()
  })

  it('selects quarter finals for grade 9 and semester finals for grade 10', () => {
    const keys = ['d120a', 'd331b', 'd331c', 'd331d', 'd630e', 'd630f', 'd630g']
    const quarters = periodsFromColumns(keys, 9, 2026)
    const semesters = periodsFromColumns(keys, 10, 2026)
    expect(quarters.map((period) => period.name)).toEqual(['Первая четверть', 'Вторая четверть', 'Третья четверть', 'Четвертая четверть'])
    expect(quarters[1].end).toBe(semesters[0].end)
    expect(quarters[3].end).toBe(semesters[1].end)
    expect(semesters.map((period) => period.finalColumn)).toEqual(['d331c', 'd630f'])
  })

  it('shows configured periods even before final-grade columns exist', () => {
    const periods = periodsFromColumns([], 9, 2026)
    expect(periods.map((period) => period.name)).toEqual([
      'Первая четверть', 'Вторая четверть', 'Третья четверть', 'Четвертая четверть'
    ])
    expect(periods[0].finalColumn).toBe('d205a')
  })

  it('reads scole period dates and default subjects as literals without executing code', () => {
    const config = parseScoleConfig(`
      const STPER = [
        ["1ч", "Первая четверть", "01.09", "07.11"],
        ["1п", "Первое полугодие", "01.09", "31.12"],
        ["2п", "Второе полугодие", "01.01", "30.05"],
      ];
      const subjDef = { s110: "Русский язык", s820: "ОБЗР" };
      globalThis.shouldNotRun = true;
    `)
    const periods = periodsFromColumns(['d307a', 'd331b', 'd530c'], 8, 2026, config.periods)
    expect(periods).toEqual([
      { id: 'a-2026', name: 'Первая четверть', start: '2026-09-01', end: '2026-11-07', finalColumn: 'd307a' }
    ])
    expect(config.defaultSubjects).toEqual({ s110: 'Русский язык', s820: 'ОБЗР' })
    expect((globalThis as { shouldNotRun?: boolean }).shouldNotRun).toBeUndefined()
  })
})

describe('grade cells and topic type suffix', () => {
  it('counts each Н even when the mark is in the same cell', () => {
    expect(parseGradeCell('5 н н')).toEqual({ value: 5, absenceCount: 2 })
    expect(parseGradeCell('нн')).toEqual({ value: null, absenceCount: 2 })
  })

  it('maps the configured journal suffix to a task type', () => {
    expect(typeFromTopic('Оптика | Экзамен устный', {})).toBe('exam_oral')
    expect(typeFromTopic('Оптика | Моя лабораторная', { lab: 'Моя лабораторная' })).toBe('lab')
  })
})
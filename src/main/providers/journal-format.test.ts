import { describe, expect, it } from 'vitest'
import {
  buildTopicText, dateToJournalKey, formatJournalWeight, journalDate, journalEndpoint, parseGradeCell,
  parseJournalResponse, parseScoleConfig, parseTopicRecord, periodsFromColumns, splitTopicText, typeFromTopic
} from './journal-format'

describe('journal endpoint URLs', () => {
  it('keeps the path prefix from baseUrl', () => {
    expect(journalEndpoint('https://suncles.online/scole', '/')).toBe('https://suncles.online/scole/')
    expect(journalEndpoint('https://suncles.online/scole', '/cpt.a')).toBe('https://suncles.online/scole/cpt.a')
    expect(journalEndpoint('https://suncles.online/scole', '/js/ini.js')).toBe('https://suncles.online/scole/js/ini.js')
    expect(journalEndpoint('https://suncles.online/scole/', 'cpt.a')).toBe('https://suncles.online/scole/cpt.a')
  })

  it('uses the root when baseUrl has no path', () => {
    expect(journalEndpoint('https://suncles.online', '/')).toBe('https://suncles.online/')
    expect(journalEndpoint('https://suncles.online/', '/js/ini.js')).toBe('https://suncles.online/js/ini.js')
  })
})

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
    expect(parseGradeCell('5 н н')).toEqual({ value: 5, absenceCount: 2, raw: '5 н н' })
    expect(parseGradeCell('нн')).toEqual({ value: null, absenceCount: 2, raw: 'нн' })
  })

  it('maps the configured journal suffix to a task type', () => {
    expect(typeFromTopic('Оптика | Экзамен устный', {})).toBe('exam_oral')
    expect(typeFromTopic('Оптика | Моя лабораторная', { lab: 'Моя лабораторная' })).toBe('lab')
  })

  it('converts an ISO date back to a dXXXX journal key', () => {
    expect(dateToJournalKey('2026-09-16', 2026)).toBe('d016')
    expect(dateToJournalKey('2027-01-25', 2026)).toBe('d425')
    expect(dateToJournalKey('2026-01-25', 2026)).toBeNull()
    expect(dateToJournalKey('2026-02-30', 2026)).toBeNull()
  })

  it('formats weight codes including the special П value', () => {
    expect([0, 1, 2, 3, 8, 9].map(formatJournalWeight)).toEqual(['0', '0.5', '1', '1.5', '4', 'П'])
  })

  it('splits and rebuilds topic text without losing the theme', () => {
    const labels = { lab: 'Моя лабораторная' }
    expect(splitTopicText('Оптика | Моя лабораторная', labels)).toEqual({ theme: 'Оптика', taskType: 'lab' })
    expect(splitTopicText('Оптика', labels)).toEqual({ theme: 'Оптика', taskType: null })
    expect(buildTopicText('Оптика', 'lab', labels)).toBe('Оптика | Моя лабораторная')
    expect(buildTopicText('Оптика', 'ignored', labels)).toBe('Оптика')
  })

  it('accepts plain-text success answers from write requests', () => {
    expect(parseJournalResponse('success', 'gradeAdd', true)).toEqual({})
    expect(parseJournalResponse('"success"', 'topicEdit', true)).toEqual({})
    expect(parseJournalResponse('', 'topicEdit', true)).toEqual({})
    expect(parseJournalResponse('{"d001":{"t":"Оптика","w":3}}', 'topicsGet', true)).toEqual({ d001: { t: 'Оптика', w: 3 } })
    expect(() => parseJournalResponse('success', 'gradesGet')).toThrow('некорректный ответ')
    expect(() => parseJournalResponse('error: access denied', 'gradeAdd', true)).toThrow('access denied')
  })

  it('reads topic fields from a topicsGet column', () => {
    expect(parseTopicRecord('d016', '2026-09-16', {
      t: 'Оптика | Текущая работа', h: 'задачи 5', w: 3, v: 2
    }, {})).toEqual({
      id: 'd016', date: '2026-09-16', theme: 'Оптика', taskType: 'current_work',
      homework: 'задачи 5', weight: 3, hours: 2
    })
    expect(parseTopicRecord('d017', '2026-09-17', { w: 9 }, {}).weight).toBe(9)
  })
})
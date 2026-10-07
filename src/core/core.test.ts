import { describe, expect, it } from 'vitest'
import { Classifier } from './classifier'
import type { Entry, Lesson, TaskType } from './models'
import {
  DEFAULT_SETTINGS, attendancePenalty, computeClass, homeworkPoints, mark1011, mark89, roundHalfUp
} from './scoring'

const S = (id: string) => ({ id, fullName: id })
const make = (descs: string[]): Lesson[] =>
  descs.map((d, i) => ({ id: `l${i}`, date: `2026-09-${String(i + 1).padStart(2, '0')}`, description: d }))
const typesOf = (lessons: Lesson[]) => {
  const c = new Classifier()
  return Object.fromEntries(lessons.map((l) => [l.id, c.classify(l.description)])) as Record<string, TaskType | null>
}
const E = (studentId: string, lessonId: string, value: number | null = null, absent = false, excused = false): Entry =>
  ({ studentId, lessonId, value, absent, excused })

describe('classifier', () => {
  const c = new Classifier()
  it('detects types (incl. Cyrillic word boundaries)', () => {
    expect(c.classify('Самостоятельная работа №3')).toBe('current_work')
    expect(c.classify('Контрольная работа по оптике')).toBe('current_work')
    expect(c.classify('Итоговая контрольная семестровая работа')).toBe('exam_written')
    expect(c.classify('Устный экзамен')).toBe('exam_oral')
    expect(c.classify('Лабораторная работа №2')).toBe('lab')
    expect(c.classify('Домашнее задание')).toBe('homework')
    expect(c.classify('ДЗ: задачи 5-10')).toBe('homework')
    expect(c.classify('Коллоквиум')).toBe('current_work')
    expect(c.classify('Тема: Законы Ньютона')).toBeNull()
    expect(c.classify('Подзадача по теме')).toBeNull() // "дз" inside a word must not match
  })
  it('accepts overrides from config', () => {
    expect(new Classifier({ homework: ['на дом'] }).classify('Задачи на дом')).toBe('homework')
  })
})

describe('tables', () => {
  it('homework / penalty / marks', () => {
    expect([95, 90, 89.9, 80, 70, 60, 59, 51, 50, 0].map(homeworkPoints)).toEqual([15, 15, 13, 13, 10, 7, 5, 5, 0, 0])
    expect([0, 20, 20.1, 30, 30.1].map(attendancePenalty)).toEqual([0, 0, -5, -5, -10])
    expect([45, 42, 41, 33, 32, 24, 23].map(mark89)).toEqual([5, 5, 4, 4, 3, 3, 2])
    expect([100, 90, 89, 75, 74, 53, 52].map(mark1011)).toEqual([5, 5, 4, 4, 3, 3, 2])
    expect([roundHalfUp(7.5), roundHalfUp(8.5), roundHalfUp(7.4)]).toEqual([8, 9, 7])
  })
})

describe('scoring', () => {
  it('grade 9 example', () => {
    const lessons = make(['Самостоятельная №1', 'Контрольная №1', 'Домашнее задание 1', 'Домашнее задание 2', 'Тема'])
    const entries = [E('s', 'l0', 8), E('s', 'l1', 9), E('s', 'l2', 100), E('s', 'l3', 85)]
    const r = computeClass([S('s')], lessons, entries, typesOf(lessons), 9, { s: 2 }, DEFAULT_SETTINGS).s
    expect(r.worksPts).toBe(26) // 8.5*3 = 25.5 -> 26
    expect(r.hwPts).toBe(15)
    expect(r.total).toBe(43)
    expect(r.mark).toBe(5)
  })
  it('missing homework = 0%, but an empty column is skipped', () => {
    const lessons = make(['ДЗ 1', 'ДЗ 2', 'ДЗ 3 (не проверено)'])
    const entries = [E('a', 'l0', 100), E('a', 'l1', 100), E('b', 'l0', 100)]
    const r = computeClass([S('a'), S('b')], lessons, entries, typesOf(lessons), 9, {}, DEFAULT_SETTINGS)
    expect(r.a.hwCount).toBe(2)
    expect(r.a.hwPercent).toBe(100)
    expect(r.b.hwPercent).toBe(50)
  })
  it('homework modes', () => {
    const lessons = make(['ДЗ 1'])
    const entries = [E('s', 'l0', 9)]
    const run = (homeworkMode: 'percent' | 'ten_point' | 'binary') =>
      computeClass([S('s')], lessons, entries, typesOf(lessons), 9, {}, { ...DEFAULT_SETTINGS, homeworkMode }).s.hwPercent
    expect([run('percent'), run('ten_point'), run('binary')]).toEqual([9, 90, 100])
  })
  it('absence penalty ignores excused', () => {
    const lessons = make(Array(10).fill('Тема'))
    const entries = [0, 1, 2].map((i) => E('s', `l${i}`, null, true, false)).concat(E('s', 'l5', null, true, true))
    const r = computeClass([S('s')], lessons, entries, typesOf(lessons), 9, {}, DEFAULT_SETTINGS).s
    expect([r.unexcusedAbsences, r.absencePct, r.attendancePen]).toEqual([3, 30, -5])
  })
  it('grade 11 full example + labs rule', () => {
    const lessons = make(['Самостоятельная', 'Лабораторная 1', 'Лабораторная 2', 'Лабораторная 3', 'Лабораторная 4',
      'Лабораторная 5', 'Домашнее', 'Итоговая контрольная семестровая работа', 'Устный экзамен'])
    const entries = [E('s', 'l0', 10), E('s', 'l1', 8), E('s', 'l2', 8), E('s', 'l3', 8), E('s', 'l4', 8), E('s', 'l6', 95),
      E('s', 'l7', 20), E('s', 'l8', 12), E('x', 'l5', 9)] // x did lab 5 -> it was held
    const r = computeClass([S('s')], lessons, entries, typesOf(lessons), 11, {}, DEFAULT_SETTINGS).s
    expect([r.worksPts, r.hwPts, r.labsDone, r.labsTotal, r.labsPts]).toEqual([30, 15, 4, 5, 12])
    expect([r.currentPts, r.finalPts, r.total, r.mark]).toEqual([57, 32, 89, 4])
    const e2 = entries.filter((e) => !['l3', 'l4'].includes(e.lessonId)) // now 2 of 5
    expect(computeClass([S('s')], lessons, e2, typesOf(lessons), 11, {}, DEFAULT_SETTINGS).s.labsPts).toBe(0)
  })
  it('grade 10 retake when a part is below its threshold', () => {
    const lessons = make(['Самостоятельная', 'Домашнее', 'Итоговая контрольная семестровая работа', 'Устный экзамен'])
    const entries = [E('s', 'l0', 10), E('s', 'l1', 100), E('s', 'l2', 3), E('s', 'l3', 2)]
    const a = computeClass([S('s')], lessons, entries, typesOf(lessons), 10, {}, DEFAULT_SETTINGS).s
    expect([a.total, a.mark]).toEqual([50, 2])
    const b = computeClass([S('s')], lessons, entries, typesOf(lessons), 10, { s: 8 }, DEFAULT_SETTINGS).s
    expect([b.total, b.mark]).toEqual([58, null])
    expect(b.status).toContain('итоговая аттестация')
  })
})

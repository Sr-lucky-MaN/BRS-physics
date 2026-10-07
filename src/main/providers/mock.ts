/** Demo provider with generated data so the app runs before the real journal is wired in. Login: teacher / teacher */
import type { ClassInfo, Entry, Lesson, Period, Student } from '@core/models'
import { AuthError, type JournalProvider } from './types'

const NAMES = ['Иванов Пётр', 'Петрова Анна', 'Сидоров Алексей', 'Кузнецова Мария', 'Смирнов Дмитрий', 'Попова Елена',
  'Васильев Никита', 'Соколова Дарья', 'Михайлов Артём', 'Новикова Ольга', 'Фёдоров Кирилл', 'Морозова Алиса']

const CLASSES: ClassInfo[] = [{ id: '9a', name: '9А', grade: 9 }, { id: '11b', name: '11Б', grade: 11 }]
const PERIODS: Record<string, Period[]> = {
  '9a': [
    { id: 'q4-25', name: '4 четверть 2025/26', start: '2026-03-30', end: '2026-05-25' },
    { id: 'q1-26', name: '1 четверть 2026/27', start: '2026-09-01', end: '2026-10-31' }
  ],
  '11b': [
    { id: 's2-25', name: '2 семестр 2025/26', start: '2026-01-12', end: '2026-05-25' },
    { id: 's1-26', name: '1 семестр 2026/27', start: '2026-09-01', end: '2026-12-31' }
  ]
}

function rng(seed: string) {
  let h = 1779033703 ^ seed.length
  for (let i = 0; i < seed.length; i++) { h = Math.imul(h ^ seed.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19) }
  let a = h >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const addDays = (iso: string, n: number) => new Date(Date.parse(iso + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10)
const isWeekday = (iso: string) => { const d = new Date(iso + 'T00:00:00Z').getUTCDay(); return d >= 1 && d <= 5 }

export class MockProvider implements JournalProvider {
  async login(username: string, password: string) {
    if (username !== 'teacher' || password !== 'teacher') throw new AuthError('Неверный логин или пароль (демо: teacher / teacher)')
    return { displayName: 'Учитель физики' }
  }
  async logout() {}
  async getClasses() { return CLASSES }
  async getPeriods(classId: string) { return PERIODS[classId] ?? [] }
  async getStudents(classId: string): Promise<Student[]> { return NAMES.map((n, i) => ({ id: `${classId}-${i}`, fullName: n })) }

  private lessons(classId: string, period: Period): Lesson[] {
    const senior = classId === '11b'
    const today = new Date().toISOString().slice(0, 10)
    const end = period.end < today ? period.end : today
    const plan = ['Тема: Кинематика', 'Самостоятельная работа №{n}', 'Домашнее задание: задачи {n}', 'Тема: Динамика',
      senior ? 'Лабораторная работа №{n}' : 'Практическая работа', 'Контрольная работа №{n}',
      'Домашнее задание: повторение {n}', 'Коллоквиум по теории']
    const out: Lesson[] = []
    let i = 0
    for (let d = period.start; d <= end; d = addDays(d, 2)) {
      if (!isWeekday(d)) continue
      out.push({ id: `${classId}-${period.id}-${i}`, date: d, description: plan[i % plan.length].replace('{n}', String(Math.floor(i / plan.length) + 1)) })
      i++
    }
    if (senior && period.end < today) {
      out.push({ id: `${classId}-${period.id}-wr`, date: addDays(period.end, -7), description: 'Итоговая контрольная семестровая работа' })
      out.push({ id: `${classId}-${period.id}-or`, date: addDays(period.end, -3), description: 'Устный экзамен' })
    }
    return out
  }

  async getLessons(classId: string, period: Period) { return this.lessons(classId, period) }

  async getEntries(classId: string, period: Period): Promise<Entry[]> {
    const rnd = rng(classId + period.id)
    const lessons = this.lessons(classId, period)
    const out: Entry[] = []
    for (const s of await this.getStudents(classId)) {
      const skill = 0.4 + rnd() * 0.6
      for (const l of lessons) {
        const desc = l.description.toLowerCase()
        if (rnd() < (1 - skill) * 0.35) { out.push({ studentId: s.id, lessonId: l.id, absent: true, excused: rnd() < 0.5 }); continue }
        const mk = (value: number) => out.push({ studentId: s.id, lessonId: l.id, value })
        if (desc.includes('итоговая')) mk(Math.round(25 * skill * (0.7 + rnd() * 0.3)))
        else if (desc.includes('устный')) mk(Math.round(15 * skill * (0.7 + rnd() * 0.3)))
        else if (desc.includes('домашн')) { if (rnd() < skill + 0.1) mk(Math.min(100, Math.round(100 * skill * (0.8 + rnd() * 0.25)))) }
        else if (['самост', 'контрол', 'коллок', 'лаборат'].some((k) => desc.includes(k))) {
          if (rnd() < 0.9) mk(Math.max(1, Math.min(10, Math.round(10 * skill * (0.7 + rnd() * 0.4)))))
        }
      }
    }
    return out
  }
}

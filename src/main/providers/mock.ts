/** Demo provider with generated data so the app runs before the real journal is wired in. Login: teacher / teacher */
import type { ClassInfo, Entry, JournalTopic, Lesson, Period, Student, SubjectInfo, TaskType } from '@core/models'
import { AuthError, type JournalProvider } from './types'
import { currentAcademicStartYear, dateToJournalKey, parseGradeCell } from './journal-format'

const NAMES = ['Иванов Пётр', 'Петрова Анна', 'Сидоров Алексей', 'Кузнецова Мария', 'Смирнов Дмитрий', 'Попова Елена',
  'Васильев Никита', 'Соколова Дарья', 'Михайлов Артём', 'Новикова Ольга', 'Фёдоров Кирилл', 'Морозова Алиса']

const CLASSES: ClassInfo[] = [{ id: '9a', name: '9А', grade: 9 }, { id: '11b', name: '11Б', grade: 11 }]
const PERIODS: Record<string, Period[]> = {
  '9a': [
    { id: 'q4-25', name: '4 четверть 2025/26', start: '2026-03-30', end: '2026-05-25', finalColumn: 'mock-q4' },
    { id: 'q1-26', name: '1 четверть 2026/27', start: '2026-09-01', end: '2026-10-31', finalColumn: 'mock-q1' }
  ],
  '11b': [
    { id: 's2-25', name: '2 семестр 2025/26', start: '2026-01-12', end: '2026-05-25', finalColumn: 'mock-s2' },
    { id: 's1-26', name: '1 семестр 2026/27', start: '2026-09-01', end: '2026-12-31', finalColumn: 'mock-s1' }
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
  private topicEdits = new Map<string, JournalTopic>()
  private deletedTopics = new Set<string>()
  private gradeEdits = new Map<string, string>()

  private topicKey(classId: string, subjectId: string, day: string) { return `${classId}|${subjectId}|${day}` }

  async login(username: string, password: string) {
    if (username !== 'teacher' || password !== 'teacher') throw new AuthError('Неверный логин или пароль (демо: teacher / teacher)')
    return { displayName: 'Учитель физики' }
  }
  async logout() {}
  async getClasses() { return CLASSES }
  async getSubjects(_classId: string): Promise<SubjectInfo[]> { return [{ id: 's610', name: 'Физика' }] }
  async getPeriods(classId: string, _subjectId: string) { return PERIODS[classId] ?? [] }
  private students(classId: string): Student[] { return NAMES.map((n, i) => ({ id: `${classId}-${i}`, fullName: n })) }

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

  private detectType(description: string): TaskType | null {
    const desc = description.toLowerCase()
    if (desc.includes('устн')) return 'exam_oral'
    if (desc.includes('итоговая')) return 'exam_written'
    if (desc.includes('лаборат')) return 'lab'
    if (desc.includes('домашн')) return 'homework'
    if (['самост', 'контрол', 'коллок'].some((k) => desc.includes(k))) return 'current_work'
    return null
  }

  async loadJournal(classId: string, subjectId: string, period: Period) {
    const rnd = rng(classId + period.id)
    const sourceLessons = this.lessons(classId, period)
    const topics: JournalTopic[] = []
    const dayByLessonId = new Map<string, string>()
    for (const l of sourceLessons) {
      const day = dateToJournalKey(l.date, currentAcademicStartYear(new Date(`${l.date}T00:00:00Z`))) ?? 'd000'
      dayByLessonId.set(l.id, day)
      const key = this.topicKey(classId, subjectId, day)
      if (this.deletedTopics.has(key)) continue
      topics.push({
        id: day, date: l.date, theme: l.description, taskType: this.detectType(l.description),
        homework: '', weight: 0, hours: 1, ...(this.topicEdits.get(key) ?? {})
      })
    }
    const lessons: Lesson[] = sourceLessons.flatMap((l) => {
      const day = dayByLessonId.get(l.id)!
      const topic = topics.find((t) => t.id === day)
      if (!topic) return []
      return [{ id: day, date: l.date, description: topic.theme || l.description, taskType: topic.taskType ?? l.taskType }]
    }).sort((a, b) => a.date.localeCompare(b.date))

    const out: Entry[] = []
    for (const s of this.students(classId)) {
      const skill = 0.4 + rnd() * 0.6
      for (const l of lessons) {
        const desc = l.description.toLowerCase()
        if (rnd() < (1 - skill) * 0.35) { out.push({ studentId: s.id, lessonId: l.id, absent: true, excused: rnd() < 0.5, raw: 'н' }); continue }
        const mk = (value: number) => out.push({ studentId: s.id, lessonId: l.id, value, raw: String(value) })
        if (desc.includes('итоговая')) mk(Math.round(25 * skill * (0.7 + rnd() * 0.3)))
        else if (desc.includes('устный')) mk(Math.round(15 * skill * (0.7 + rnd() * 0.3)))
        else if (desc.includes('домашн')) { if (rnd() < skill + 0.1) mk(Math.min(100, Math.round(100 * skill * (0.8 + rnd() * 0.25)))) }
        else if (['самост', 'контрол', 'коллок', 'лаборат'].some((k) => desc.includes(k))) {
          if (rnd() < 0.9) mk(Math.max(1, Math.min(10, Math.round(10 * skill * (0.7 + rnd() * 0.4)))))
        }
      }
    }
    for (const [key, raw] of this.gradeEdits) {
      const [c, s, day, studentId] = key.split('|')
      if (c !== classId || s !== subjectId) continue
      const parsed = parseGradeCell(raw)
      const entry: Entry = {
        studentId, lessonId: day, value: parsed.value, absent: parsed.absenceCount > 0,
        excused: false, absenceCount: parsed.absenceCount, raw
      }
      const index = out.findIndex((e) => e.studentId === studentId && e.lessonId === day)
      if (index >= 0) out[index] = entry
      else out.push(entry)
    }
    const yearColumn = 'd925g'
    const yearMarks: Record<string, string> = {}
    for (const [key, raw] of this.gradeEdits) {
      const [c, s, day, studentId] = key.split('|')
      if (c === classId && s === subjectId && day === yearColumn) yearMarks[studentId] = raw
    }
    return { students: this.students(classId), lessons, topics, entries: out, periodMarks: {}, yearColumn, yearMarks }
  }

  async saveTopic(classId: string, subjectId: string, topic: JournalTopic): Promise<void> {
    this.topicEdits.set(this.topicKey(classId, subjectId, topic.id), { ...topic })
    this.deletedTopics.delete(this.topicKey(classId, subjectId, topic.id))
  }

  async deleteTopic(classId: string, subjectId: string, topic: JournalTopic): Promise<void> {
    const key = this.topicKey(classId, subjectId, topic.id)
    this.deletedTopics.add(key)
    this.topicEdits.delete(key)
  }

  async setGrade(classId: string, subjectId: string, day: string, studentId: string, value: string): Promise<void> {
    this.gradeEdits.set(`${classId}|${subjectId}|${day}|${studentId}`, value)
  }
}

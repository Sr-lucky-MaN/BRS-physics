/**
 * BRS rules from the physics department spec.
 *
 * Grades 8-9 (per quarter):   works*3 (max 30) + homework (max 15) - absence penalty + bonuses
 *                             42+ ->5, 33-41 ->4, 24-32 ->3, <=23 ->2
 * Grades 10-11 (per semester): works*3 (30) + homework (15) + labs (15) + written exam (25)
 *                             + oral exam (15) - absence penalty + bonuses
 *                             attested if total>=53, current>=32, final>=21
 *                             90+ ->5, 75-89 ->4, 53-74 ->3, <=52 ->2
 */
import type { AppSettings, Entry, Lesson, Student, TaskType } from './models'

export const PASS_TOTAL = 53
export const PASS_CURRENT = 32
export const PASS_FINAL = 21

export const roundHalfUp = (x: number): number => Math.floor(x + 0.5)

// ------------------------------------------------------------------ bonuses
export interface BonusItem {
  key: string
  label: string
  pts1011: number
  pts89: number
}
export const BONUS_CATALOG: BonusItem[] = [
  { key: 'attendance80', label: '1.1 Посещаемость не менее 80%', pts1011: 5, pts89: 3 },
  { key: 'special_course', label: '1.2 Успеваемость на спецкурсах', pts1011: 5, pts89: 3 },
  { key: 'municipal', label: '2.1 Победитель (призёр) муниципального этапа', pts1011: 3, pts89: 2 },
  { key: 'regional', label: '2.2 Победитель (призёр) регионального этапа', pts1011: 8, pts89: 5 },
  { key: 'final_winner', label: '2.3 Победитель заключительного этапа', pts1011: 15, pts89: 15 },
  { key: 'final_prizer', label: '2.3 Призёр заключительного этапа', pts1011: 10, pts89: 10 },
  { key: 'final_participant', label: '2.3 Участник заключительного этапа', pts1011: 8, pts89: 8 }
]
export const bonusPoints = (item: BonusItem, grade: number): number => (grade <= 9 ? item.pts89 : item.pts1011)

// ------------------------------------------------------------------ tables
export function homeworkPoints(pct: number): number {
  if (pct >= 90) return 15
  if (pct >= 80) return 13
  if (pct >= 70) return 10
  if (pct >= 60) return 7
  if (pct > 50) return 5 // spec: 51-59 -> 5, <=50 -> 0
  return 0
}

export function attendancePenalty(unexcusedPct: number): number {
  if (unexcusedPct > 30) return -10
  if (unexcusedPct > 20) return -5
  return 0
}

export function mark89(total: number): number {
  if (total >= 42) return 5
  if (total >= 33) return 4
  if (total >= 24) return 3
  return 2
}

export function mark1011(total: number): number {
  if (total >= 90) return 5
  if (total >= 75) return 4
  if (total >= PASS_TOTAL) return 3
  return 2
}

export function homeworkToPercent(value: number, mode: AppSettings['homeworkMode']): number {
  if (mode === 'ten_point') return Math.max(0, Math.min(100, value * 10))
  if (mode === 'binary') return value > 0 ? 100 : 0
  return Math.max(0, Math.min(100, value))
}

// ------------------------------------------------------------------ result
export type Settings = Pick<AppSettings, 'homeworkMode' | 'labsMinFraction'>
export const DEFAULT_SETTINGS: Settings = { homeworkMode: 'percent', labsMinFraction: 0.8 }

export interface StudentResult {
  studentId: string
  grade: number
  worksCount: number
  worksAvg: number
  worksPts: number
  hwCount: number
  hwPercent: number | null
  hwPts: number
  labsTotal: number
  labsDone: number
  labsAvg: number
  labsPts: number
  examWritten: number | null
  examOral: number | null
  lessonsTotal: number
  unexcusedAbsences: number
  absencePct: number
  attendancePen: number
  bonusPts: number
  currentPts: number // works + hw + labs + penalty
  finalPts: number // exams (10-11)
  total: number
  mark: number | null // null = not attested yet (retake needed)
  status: string
  notes: string[]
}

type Typed = Partial<Record<TaskType, Lesson[]>>

const hasMark = (e: Entry | undefined): e is Entry & { value: number } => e?.value != null

export function computeStudent(
  studentId: string,
  grade: number,
  typed: Typed,
  lessonsTotal: number,
  emap: Map<string, Entry>,
  bonusPts: number,
  settings: Settings
): StudentResult {
  const r: StudentResult = {
    studentId, grade, worksCount: 0, worksAvg: 0, worksPts: 0, hwCount: 0, hwPercent: null, hwPts: 0,
    labsTotal: 0, labsDone: 0, labsAvg: 0, labsPts: 0, examWritten: null, examOral: null, lessonsTotal,
    unexcusedAbsences: 0, absencePct: 0, attendancePen: 0, bonusPts, currentPts: 0, finalPts: 0, total: 0,
    mark: null, status: '', notes: []
  }
  const senior = grade >= 10
  const sum = (a: number[]) => a.reduce((x, y) => x + y, 0)

  // current works: average of all marks * 3
  const marks = (typed.current_work ?? []).map((l) => emap.get(l.id)).filter(hasMark).map((e) => e.value)
  r.worksCount = marks.length
  if (marks.length) {
    r.worksAvg = sum(marks) / marks.length
    r.worksPts = roundHalfUp(r.worksAvg * 3)
  } else r.notes.push('Нет оценок за текущие работы')

  // homework: mean % over assigned homeworks; missing = 0%, absent without a mark = skipped
  const pcts: number[] = []
  for (const l of typed.homework ?? []) {
    const e = emap.get(l.id)
    if (hasMark(e)) pcts.push(homeworkToPercent(e.value, settings.homeworkMode))
    else if (e?.absent) continue
    else pcts.push(0)
  }
  r.hwCount = pcts.length
  if (pcts.length) {
    r.hwPercent = sum(pcts) / pcts.length
    r.hwPts = homeworkPoints(r.hwPercent)
  } else r.notes.push('Нет домашних заданий за период — 0 баллов')

  // attendance (unexcused absences only)
  for (const e of emap.values()) if (e.absent && !e.excused) r.unexcusedAbsences += e.absenceCount ?? 1
  if (lessonsTotal) r.absencePct = (r.unexcusedAbsences / lessonsTotal) * 100
  r.attendancePen = attendancePenalty(r.absencePct)

  if (senior) {
    // labs: need >= labsMinFraction (4/5) done; points = avg * 3/2
    const labs = typed.lab ?? []
    const labMarks = labs.map((l) => emap.get(l.id)).filter(hasMark).map((e) => e.value)
    r.labsTotal = labs.length
    r.labsDone = labMarks.length
    if (labMarks.length) r.labsAvg = sum(labMarks) / labMarks.length
    if (r.labsTotal && r.labsDone / r.labsTotal >= settings.labsMinFraction) r.labsPts = roundHalfUp(r.labsAvg * 1.5)
    else r.notes.push(`Лабораторные: выполнено ${r.labsDone} из ${r.labsTotal} — 0 баллов`)

    // exams are entered in the journal directly as points; take the latest by date
    const exam = (type: 'exam_written' | 'exam_oral', cap: number, title: string): number | null => {
      const found = (typed[type] ?? [])
        .map((l) => ({ date: l.date, e: emap.get(l.id) }))
        .filter((x) => hasMark(x.e))
        .sort((a, b) => a.date.localeCompare(b.date))
      if (!found.length) {
        r.notes.push(`Нет баллов за ${title}`)
        return null
      }
      const v = found[found.length - 1].e!.value as number
      if (v > cap) r.notes.push(`Балл за экзамен ${v} больше максимума ${cap}`)
      return v
    }
    r.examWritten = exam('exam_written', 25, 'итоговую контрольную')
    r.examOral = exam('exam_oral', 15, 'устный экзамен')
    r.finalPts = (r.examWritten ?? 0) + (r.examOral ?? 0)
  }

  r.currentPts = r.worksPts + r.hwPts + r.labsPts + r.attendancePen
  r.total = r.currentPts + r.finalPts + bonusPts

  if (!senior) {
    r.mark = mark89(r.total)
    r.status = `Оценка за четверть: ${r.mark}`
  } else if (r.total >= PASS_TOTAL && (r.currentPts < PASS_CURRENT || r.finalPts < PASS_FINAL)) {
    const parts: string[] = []
    if (r.currentPts < PASS_CURRENT) parts.push('текущая успеваемость')
    if (r.finalPts < PASS_FINAL) parts.push('итоговая аттестация')
    r.mark = null
    r.status = 'Пересдача: ' + parts.join(', ')
  } else {
    r.mark = mark1011(r.total)
    r.status = r.mark >= 3 ? 'Аттестован' : 'Не аттестован'
  }
  return r
}

/**
 * Compute every student of a class.
 * types: lessonId -> TaskType | null. Typed lessons nobody has a mark for are treated as "not held yet"
 * and skipped, so a pre-created empty journal column doesn't give everyone 0%.
 */
export function computeClass(
  students: Student[],
  lessons: Lesson[],
  entries: Entry[],
  types: Record<string, TaskType | null | undefined>,
  grade: number,
  bonusByStudent: Record<string, number>,
  settings: Settings
): Record<string, StudentResult> {
  const byStudent = new Map<string, Map<string, Entry>>()
  const marked = new Set<string>()
  for (const e of entries) {
    if (!byStudent.has(e.studentId)) byStudent.set(e.studentId, new Map())
    byStudent.get(e.studentId)!.set(e.lessonId, e)
    if (e.value != null) marked.add(e.lessonId)
  }
  const typed: Typed = {}
  for (const l of [...lessons].sort((a, b) => a.date.localeCompare(b.date))) {
    const t = types[l.id]
    if (t && t !== 'ignored' && marked.has(l.id)) (typed[t] ??= []).push(l)
  }
  const out: Record<string, StudentResult> = {}
  for (const s of students) {
    out[s.id] = computeStudent(s.id, grade, typed, lessons.length, byStudent.get(s.id) ?? new Map(), bonusByStudent[s.id] ?? 0, settings)
  }
  return out
}

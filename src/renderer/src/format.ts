import type { StudentResult } from '@core/scoring'
import type { Student } from '@core/models'

/** Number -> short string; null -> em dash. */
export function fmt(x: number | null | undefined, digits = 1): string {
  if (x == null) return '—'
  const s = x.toFixed(digits)
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s // only trim zeros after a decimal point
}

export interface Column {
  header: string
  get: (s: Student, r: StudentResult) => string
  kind?: 'mark' | 'status'
}

export function columnsFor(grade: number): Column[] {
  const name: Column = { header: 'Ученик', get: (s) => s.fullName }
  const works: Column[] = [
    { header: 'Работ', get: (_, r) => String(r.worksCount) },
    { header: 'Ср. балл', get: (_, r) => (r.worksCount ? fmt(r.worksAvg, 2) : '—') },
    { header: 'Работы (×3)', get: (_, r) => String(r.worksPts) }
  ]
  const hw: Column[] = [
    { header: 'ДЗ, %', get: (_, r) => fmt(r.hwPercent, 0) },
    { header: 'ДЗ, балл', get: (_, r) => String(r.hwPts) }
  ]
  const absence: Column[] = [
    { header: 'Пропуски н/у, %', get: (_, r) => fmt(r.absencePct, 0) },
    { header: 'Штраф', get: (_, r) => String(r.attendancePen) }
  ]
  const tail: Column[] = [
    { header: 'Премия', get: (_, r) => fmt(r.bonusPts) },
    { header: 'Итого', get: (_, r) => fmt(r.total) },
    { header: 'Отметка', get: (_, r) => (r.mark == null ? '—' : String(r.mark)), kind: 'mark' }
  ]
  if (grade <= 9) return [name, ...works, ...hw, ...absence, ...tail]

  const labs: Column[] = [
    { header: 'Лаб.', get: (_, r) => `${r.labsDone}/${r.labsTotal}` },
    { header: 'Лаб., балл', get: (_, r) => String(r.labsPts) }
  ]
  const exams: Column[] = [
    { header: 'Письм. (25)', get: (_, r) => fmt(r.examWritten) },
    { header: 'Устн. (15)', get: (_, r) => fmt(r.examOral) }
  ]
  const summary: Column[] = [
    { header: 'Текущая', get: (_, r) => fmt(r.currentPts) },
    { header: 'Итоговая', get: (_, r) => fmt(r.finalPts) }
  ]
  const status: Column = { header: 'Статус', get: (_, r) => r.status, kind: 'status' }
  return [name, ...works, ...hw, ...labs, ...exams, ...absence, ...summary, ...tail, status]
}

/** CSV with ';' so Russian-locale Excel opens it correctly. */
export function toCsv(columns: Column[], rows: string[][]): string {
  const esc = (v: string) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
  return [columns.map((c) => c.header), ...rows].map((r) => r.map(esc).join(';')).join('\r\n')
}

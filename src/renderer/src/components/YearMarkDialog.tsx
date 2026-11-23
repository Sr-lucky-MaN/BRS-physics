import { useState } from 'react'
import { fmt } from '../format'
import { averageYearMark } from '../year-marks'

export interface YearPeriod {
  periodId: string
  points: number
  mark: string
}

export interface YearStudentRow {
  studentId: string
  fullName: string
  periods: YearPeriod[]
  year: string
}

interface Props {
  rows: YearStudentRow[]
  periodNames: string[]
  busy: boolean
  onCancel: () => void
  onSave: (studentId: string, value: string) => Promise<void>
}

export default function YearMarkDialog({ rows, periodNames, busy, onCancel, onSave }: Props) {
  const initial = Object.fromEntries(rows.map((row) => [row.studentId, row.year]))
  const [values, setValues] = useState<Record<string, string>>(initial)
  const [baseline, setBaseline] = useState<Record<string, string>>(initial)
  const [status, setStatus] = useState('')
  const [saving, setSaving] = useState(false)

  function fillAverage() {
    setValues((current) => ({
      ...current,
      ...Object.fromEntries(rows.map((row) => [row.studentId, averageYearMark(row.periods.map((p) => p.mark))]))
    }))
    setStatus('Заполнено средним арифметическим оценок за периоды')
  }

  async function saveOne(studentId: string) {
    if (saving || busy) return
    setSaving(true)
    setStatus('')
    try {
      await onSave(studentId, values[studentId] ?? '')
      setBaseline((current) => ({ ...current, [studentId]: values[studentId] ?? '' }))
      setStatus('Годовая оценка сохранена')
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  async function saveAll() {
    if (saving || busy) return
    const changed = rows.filter((row) => (values[row.studentId] ?? '') !== (baseline[row.studentId] ?? ''))
    if (!changed.length) { setStatus('Нет изменённых оценок'); return }
    setSaving(true)
    setStatus('')
    let done = 0
    let failed = 0
    for (const row of changed) {
      try {
        await onSave(row.studentId, values[row.studentId] ?? '')
        done++
        setBaseline((current) => ({ ...current, [row.studentId]: values[row.studentId] ?? '' }))
      } catch {
        failed++
      }
    }
    setSaving(false)
    setStatus(`Сохранено: ${done}, ошибок: ${failed}`)
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !saving && !busy) onCancel() }}>
      <div className="modal year-dialog" role="dialog" aria-label="Оценки за год">
        <header>
          <strong>Оценки за учебный год</strong>
          <button type="button" onClick={onCancel} disabled={saving} aria-label="Закрыть">×</button>
        </header>
        <p className="muted dialog-intro">
          Баллы и оценки за каждый период. Годовая оценка заполняется средним арифметическим
          (округление до целого) или вводится вручную.
        </p>
        <div className="preview-list">
          <table className="year-table">
            <thead>
              <tr>
                <th rowSpan={2} className="student-col">Ученик</th>
                {periodNames.map((name) => <th key={name} colSpan={2}>{name}</th>)}
                <th rowSpan={2}>Год</th>
                <th rowSpan={2} />
              </tr>
              <tr>
                {periodNames.flatMap((name) => [
                  <th key={`${name}-pts`}>Баллы</th>,
                  <th key={`${name}-mark`}>Оценка</th>
                ])}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.studentId}>
                  <td className="student-col">{row.fullName}</td>
                  {row.periods.flatMap((p) => [
                    <td key={`${p.periodId}-pts`}>{fmt(p.points, 1)}</td>,
                    <td key={`${p.periodId}-mark`}>{p.mark || '—'}</td>
                  ])}
                  <td>
                    <input
                      className="year-input"
                      value={values[row.studentId] ?? ''}
                      disabled={saving || busy}
                      onChange={(e) => setValues((current) => ({ ...current, [row.studentId]: e.target.value }))}
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="icon-button tiny"
                      title="Сохранить эту оценку"
                      disabled={saving || busy || (values[row.studentId] ?? '') === (baseline[row.studentId] ?? '')}
                      onClick={() => void saveOne(row.studentId)}
                    >✓</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {status && <p className="muted dialog-summary" role="status">{status}</p>}
        <div className="modal-actions">
          <button type="button" onClick={fillAverage} disabled={saving || busy}>Заполнить средним</button>
          <span className="grow" />
          <button type="button" onClick={onCancel} disabled={saving}>Закрыть</button>
          <button type="button" className="primary" onClick={() => void saveAll()} disabled={saving || busy}>Сохранить изменения</button>
        </div>
      </div>
    </div>
  )
}

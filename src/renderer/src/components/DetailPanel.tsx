import { useEffect, useState } from 'react'
import { TYPE_LABELS, type BonusRow, type Entry, type Lesson, type Student, type TaskType } from '@core/models'
import { BONUS_CATALOG, bonusPoints, type StudentResult } from '@core/scoring'
import { fmt } from '../format'

const OVERRIDE_OPTIONS: TaskType[] = ['current_work', 'homework', 'lab', 'exam_written', 'exam_oral', 'ignored']

interface Props {
  student: Student | null
  result: StudentResult | null
  grade: number
  lessons: Lesson[]
  entries: Entry[]
  autoTypes: Record<string, TaskType | null>
  types: Record<string, TaskType | null>
  overrides: Record<string, TaskType>
  bonusRows: BonusRow[]
  onOverride: (lessonId: string, type: TaskType | null) => void
  onSaveBonus: (studentId: string, rows: BonusRow[]) => void
}

type Tab = 'summary' | 'lessons' | 'bonus'

export default function DetailPanel(p: Props) {
  const [tab, setTab] = useState<Tab>('summary')
  return (
    <div className="detail">
      <div className="tabs">
        {([['summary', 'Расчёт'], ['lessons', 'Записи журнала'], ['bonus', 'Премиальные баллы']] as [Tab, string][]).map(([id, label]) => (
          <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      <div className="tab-body">
        {tab === 'lessons' ? <LessonsTab {...p} /> : !p.student || !p.result ? (
          <p className="muted">Выберите ученика в таблице</p>
        ) : tab === 'summary' ? (
          <Summary student={p.student} r={p.result} />
        ) : (
          <BonusTab key={p.student.id} {...p} student={p.student} />
        )}
      </div>
    </div>
  )
}

function Summary({ student, r }: { student: Student; r: StudentResult }) {
  const senior = r.grade >= 10
  return (
    <div className="summary">
      <h3>{student.fullName}</h3>
      <p><b>Текущие работы:</b> {r.worksCount} шт., средний балл {fmt(r.worksAvg, 2)} × 3 = <b>{r.worksPts}</b></p>
      <p><b>Домашние задания:</b> {r.hwCount} шт., выполнение {fmt(r.hwPercent, 1)}% → <b>{r.hwPts}</b></p>
      {senior && (
        <>
          <p><b>Лабораторные:</b> {r.labsDone} из {r.labsTotal}, средний {fmt(r.labsAvg, 2)} × 3/2 → <b>{r.labsPts}</b></p>
          <p>
            <b>Итоговая контрольная:</b> {fmt(r.examWritten)} из 25 &nbsp; <b>Устный экзамен:</b> {fmt(r.examOral)} из 15
          </p>
        </>
      )}
      <p>
        <b>Пропуски без уваж. причины:</b> {r.unexcusedAbsences} из {r.lessonsTotal} ({fmt(r.absencePct, 1)}%) → штраф <b>{r.attendancePen}</b>
      </p>
      <p><b>Премиальные:</b> {fmt(r.bonusPts)}</p>
      <hr />
      {senior && (
        <p>
          Текущая успеваемость: <b>{fmt(r.currentPts)}</b> (нужно ≥ 32)<br />
          Итоговая аттестация: <b>{fmt(r.finalPts)}</b> (нужно ≥ 21)
        </p>
      )}
      <p className="total">Итого: <b>{fmt(r.total)}</b> — {r.status}</p>
      {r.notes.length > 0 && <p className="notes">{r.notes.map((n) => <span key={n}>⚠ {n}<br /></span>)}</p>}
    </div>
  )
}

function LessonsTab({ student, lessons, entries, autoTypes, types, overrides, onOverride }: Props) {
  const mine = new Map(entries.filter((e) => e.studentId === student?.id).map((e) => [e.lessonId, e]))
  const sorted = [...lessons].sort((a, b) => a.date.localeCompare(b.date))
  const fmtDate = (iso: string) => iso.split('-').reverse().join('.')
  return (
    <table className="lessons">
      <thead>
        <tr><th>Дата</th><th>Описание</th><th>Тип (можно исправить)</th><th>Запись</th></tr>
      </thead>
      <tbody>
        {sorted.map((l) => {
          const e = mine.get(l.id)
          const cell = e ? [e.absent ? `Н${(e.absenceCount ?? 1) > 1 ? ` × ${e.absenceCount}` : ''}${e.excused ? ' (уваж.)' : ''}` : null, e.value != null ? String(e.value) : null].filter(Boolean).join('; ') : ''
          const auto = autoTypes[l.id]
          return (
            <tr key={l.id} className={types[l.id] == null ? 'unknown' : ''}>
              <td>{fmtDate(l.date)}</td>
              <td>{l.description}</td>
              <td>
                <select value={overrides[l.id] ?? ''} onChange={(ev) => onOverride(l.id, (ev.target.value || null) as TaskType | null)}>
                  <option value="">Авто: {auto ? TYPE_LABELS[auto] : 'не распознано'}</option>
                  {OVERRIDE_OPTIONS.map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
                </select>
              </td>
              <td className={`center${e?.absent && e.excused ? ' excused' : ''}`}>{cell}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function BonusTab({ student, grade, bonusRows, onSaveBonus }: Props & { student: Student }) {
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [custom, setCustom] = useState<{ points: number; comment: string }[]>([])

  useEffect(() => {
    setChecked(new Set(bonusRows.filter((r) => r.key !== 'custom').map((r) => r.key)))
    setCustom(bonusRows.filter((r) => r.key === 'custom').map(({ points, comment }) => ({ points, comment })))
  }, [bonusRows])

  const toggle = (key: string) => setChecked((s) => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n })

  function save() {
    const rows: BonusRow[] = BONUS_CATALOG.filter((b) => checked.has(b.key)).map((b) => ({ key: b.key, points: bonusPoints(b, grade), comment: '' }))
    for (const c of custom) if (c.points) rows.push({ key: 'custom', points: c.points, comment: c.comment })
    onSaveBonus(student.id, rows)
  }

  return (
    <div className="bonus">
      <p className="muted">Премиальные баллы вносит учитель (в журнале их нет).</p>
      {BONUS_CATALOG.map((b) => (
        <label key={b.key} className="check">
          <input type="checkbox" checked={checked.has(b.key)} onChange={() => toggle(b.key)} />
          {b.label} <span className="muted">(+{bonusPoints(b, grade)})</span>
        </label>
      ))}
      <h4>Другие баллы («и т.д.»)</h4>
      {custom.map((c, i) => (
        <div key={i} className="custom-row">
          <input type="number" step="0.5" value={c.points} onChange={(e) => setCustom(custom.map((x, j) => (j === i ? { ...x, points: Number(e.target.value) } : x)))} />
          <input type="text" placeholder="Комментарий" value={c.comment} onChange={(e) => setCustom(custom.map((x, j) => (j === i ? { ...x, comment: e.target.value } : x)))} />
          <button onClick={() => setCustom(custom.filter((_, j) => j !== i))}>×</button>
        </div>
      ))}
      <div className="row">
        <button onClick={() => setCustom([...custom, { points: 0, comment: '' }])}>+ строка</button>
        <span className="grow" />
        <button className="primary" onClick={save}>Сохранить</button>
      </div>
    </div>
  )
}

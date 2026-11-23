import { useEffect, useRef, useState } from 'react'
import { TYPE_LABELS, type BonusRow, type Entry, type JournalTopic, type Lesson, type Student, type TaskType } from '@core/models'
import { BONUS_CATALOG, bonusPoints, type StudentResult } from '@core/scoring'
import { fmt } from '../format'

type GroupKey = TaskType | 'unknown'
const GROUP_ORDER: GroupKey[] = ['current_work', 'homework', 'lab', 'exam_written', 'exam_oral', 'ignored', 'unknown']

interface Props {
  student: Student | null
  result: StudentResult | null
  grade: number
  lessons: Lesson[]
  topics: JournalTopic[]
  entries: Entry[]
  autoTypes: Record<string, TaskType | null>
  types: Record<string, TaskType | null>
  bonusRows: BonusRow[]
  onSetGrade: (day: string, studentId: string, value: string) => Promise<void>
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
        {tab === 'lessons' ? p.student ? (
          <LessonsTab key={p.student.id} {...p} student={p.student} />
        ) : (
          <p className="muted">Выберите ученика в таблице</p>
        ) : !p.student || !p.result ? (
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

function LessonsTab({ student, lessons, topics, entries, types, onSetGrade }: Props & { student: Student }) {
  const mine = new Map(entries.filter((e) => e.studentId === student.id).map((e) => [e.lessonId, e]))
  const themes = new Map(topics.map((t) => [t.id, t.theme]))
  const [editingId, setEditingId] = useState<string | null>(null)
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const cancelledRef = useRef(false)
  const originalValueRef = useRef('')

  const groups = new Map<GroupKey, Lesson[]>()
  for (const l of [...lessons].sort((a, b) => a.date.localeCompare(b.date))) {
    const key = types[l.id] ?? 'unknown'
    const list = groups.get(key) ?? []
    list.push(l)
    groups.set(key, list)
  }
  const orderedGroups = GROUP_ORDER.filter((key) => groups.has(key)).map((key) => [key, groups.get(key)!] as const)

  const fmtDate = (iso: string) => iso.split('-').reverse().join('.')
  const groupLabel = (key: GroupKey) => key === 'unknown' ? 'Не распознано' : TYPE_LABELS[key]

  function startEdit(lesson: Lesson) {
    if (savingRef.current) return
    const original = mine.get(lesson.id)?.raw ?? ''
    originalValueRef.current = original
    setEditingId(lesson.id)
    setValue(original)
    setError('')
    cancelledRef.current = false
  }

  function cancelEdit() {
    cancelledRef.current = true
    setEditingId(null)
  }

  async function saveEdit() {
    if (!editingId || savingRef.current) return
    if (value === originalValueRef.current) {
      setEditingId(null) // nothing changed — no request, no reload, selection stays put
      return
    }
    savingRef.current = true
    cancelledRef.current = true // explicit save: don't save again when the input loses focus
    setSaving(true)
    setError('')
    try {
      await onSetGrade(editingId, student.id, value)
      setEditingId(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      cancelledRef.current = false
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  return (
    <div className="lessons-view">
      {error && <div className="banner error" onClick={() => setError('')}>{error}</div>}
      <p className="muted lessons-hint">Клик по оценке — изменение, Enter — сохранить, Esc — отменить.</p>
      <table className="lessons">
        <thead>
          <tr><th>Дата</th><th>Тема</th><th>Тип</th><th>Оценка</th></tr>
        </thead>
        <tbody>
          {orderedGroups.map(([key, items]) => (
            <GroupRows
              key={key}
              label={groupLabel(key)}
              count={items.length}
              unknown={key === 'unknown'}
              lessons={items}
              themes={themes}
              entries={mine}
              editingId={editingId}
              value={value}
              saving={saving}
              fmtDate={fmtDate}
              onStart={startEdit}
              onCancel={cancelEdit}
              onChange={setValue}
              onSave={() => void saveEdit()}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function GroupRows({ label, count, unknown, lessons, themes, entries, editingId, value, saving, fmtDate, onStart, onCancel, onChange, onSave }: {
  label: string
  count: number
  unknown: boolean
  lessons: Lesson[]
  themes: Map<string, string>
  entries: Map<string, Entry>
  editingId: string | null
  value: string
  saving: boolean
  fmtDate: (iso: string) => string
  onStart: (lesson: Lesson) => void
  onCancel: () => void
  onChange: (value: string) => void
  onSave: () => void
}) {
  return (
    <>
      <tr className={`group-row${unknown ? ' unknown' : ''}`}><td colSpan={4}>{label} <span className="muted">· {count}</span></td></tr>
      {lessons.map((l) => {
        const e = entries.get(l.id)
        const isEditing = editingId === l.id
        const classes = ['grade-cell', e?.absent && e.excused ? 'excused' : ''].filter(Boolean).join(' ')
        return (
          <tr key={l.id} className={unknown ? 'unknown' : ''}>
            <td className="date">{fmtDate(l.date)}</td>
            <td>{themes.get(l.id) || l.description.split(' | ')[0] || <span className="muted">—</span>}</td>
            <td className="type">{label}</td>
            <td
              className={classes}
              tabIndex={isEditing ? -1 : 0}
              onClick={() => { if (!isEditing) onStart(l) }}
              onKeyDown={(ev) => {
                if (isEditing) return
                if (ev.key === 'Enter' || ev.key === 'F2') { ev.preventDefault(); onStart(l) }
              }}
            >
              {isEditing ? (
                <input
                  autoFocus
                  className="lesson-grade-input"
                  value={value}
                  disabled={saving}
                  onClick={(ev) => ev.stopPropagation()}
                  onChange={(ev) => onChange(ev.target.value)}
                  onBlur={() => onSave()}
                  onKeyDown={(ev) => {
                    if (ev.key === 'Enter') { ev.preventDefault(); onSave() }
                    if (ev.key === 'Escape') { ev.preventDefault(); onCancel() }
                  }}
                />
              ) : (e?.raw || <span className="muted">—</span>)}
            </td>
          </tr>
        )
      })}
    </>
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

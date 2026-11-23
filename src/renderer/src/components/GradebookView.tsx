import { useMemo, useRef, useState } from 'react'
import { TYPE_LABELS, type Entry, type JournalTopic, type Lesson, type Student } from '@core/models'
import { formatJournalWeight } from '../../../main/providers/journal-format'

interface Props {
  students: Student[]
  lessons: Lesson[]
  entries: Entry[]
  topics: JournalTopic[]
  busy: boolean
  onSetGrade: (day: string, studentId: string, value: string) => Promise<void>
}

interface Cell {
  studentId: string
  lessonId: string
}

const keyOf = (studentId: string, lessonId: string) => `${studentId}|${lessonId}`
const sameCell = (a: Cell | null, b: Cell) => !!a && a.studentId === b.studentId && a.lessonId === b.lessonId

export default function GradebookView({ students, lessons, entries, topics, busy, onSetGrade }: Props) {
  const [selected, setSelected] = useState<Cell | null>(null)
  const [editing, setEditing] = useState<Cell | null>(null)
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const cancelledRef = useRef(false)

  const entryMap = useMemo(() => new Map(entries.map((e) => [keyOf(e.studentId, e.lessonId), e])), [entries])
  const topicMap = useMemo(() => new Map(topics.map((t) => [t.id, t])), [topics])

  function startEdit(cell: Cell) {
    if (saving || busy) return
    setSelected(cell)
    setEditing(cell)
    setValue(entryMap.get(keyOf(cell.studentId, cell.lessonId))?.raw ?? '')
    setError('')
    cancelledRef.current = false
  }

  function cancelEdit() {
    cancelledRef.current = true
    setEditing(null)
  }

  async function saveEdit() {
    if (!editing || savingRef.current) return
    savingRef.current = true
    cancelledRef.current = true // explicit save: don't save again when the input loses focus
    setSaving(true)
    setError('')
    try {
      await onSetGrade(editing.lessonId, editing.studentId, value)
      setEditing(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      cancelledRef.current = false
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  const selection = selected ? {
    student: students.find((s) => s.id === selected.studentId) ?? null,
    lesson: lessons.find((l) => l.id === selected.lessonId) ?? null,
    topic: topicMap.get(selected.lessonId) ?? null,
    entry: entryMap.get(keyOf(selected.studentId, selected.lessonId)) ?? null
  } : null

  return (
    <div className="gradebook-view">
      {error && <div className="banner error" onClick={() => setError('')}>{error}</div>}
      <div className="gradebook-layout">
        <div className="table-wrap gradebook-grid">
          <table className="gradebook">
            <thead>
              <tr>
                <th className="student-col">Ученик</th>
                {lessons.map((l) => (
                  <th key={l.id} title={l.date}>{l.date.split('-').reverse().slice(0, 2).join('.')}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {students.map((student) => (
                <tr key={student.id}>
                  <th className="student-col">{student.fullName}</th>
                  {lessons.map((lesson) => {
                    const cell = { studentId: student.id, lessonId: lesson.id }
                    const entry = entryMap.get(keyOf(cell.studentId, cell.lessonId))
                    const isEditing = sameCell(editing, cell)
                    const classes = [
                      'grade-cell',
                      selected && sameCell(selected, cell) ? 'selected' : '',
                      entry?.absent ? 'absent' : '',
                      entry?.excused ? 'excused' : ''
                    ].filter(Boolean).join(' ')
                    return (
                      <td
                        key={lesson.id}
                        className={classes}
                        tabIndex={isEditing ? -1 : 0}
                        onClick={() => setSelected(cell)}
                        onDoubleClick={() => startEdit(cell)}
                        onKeyDown={(e) => {
                          if (isEditing) return
                          if (e.key === 'Enter' || e.key === 'F2') { e.preventDefault(); startEdit(cell) }
                        }}
                      >
                        {isEditing ? (
                          <input
                            autoFocus
                            className="grade-input"
                            value={value}
                            disabled={saving}
                            onChange={(e) => setValue(e.target.value)}
                            onBlur={() => { if (cancelledRef.current) { cancelledRef.current = false; return } void saveEdit() }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') { e.preventDefault(); void saveEdit() }
                              if (e.key === 'Escape') { e.preventDefault(); cancelEdit() }
                            }}
                          />
                        ) : (entry?.raw ?? '')}
                      </td>
                    )
                  })}
                </tr>
              ))}
              {!students.length && <tr><td className="muted pad">Нет учеников</td></tr>}
            </tbody>
          </table>
        </div>
        <aside className="grade-info">
          <h3>Сводка по записи</h3>
          <p className="muted grade-hint">Двойной клик по клетке — изменение оценки</p>
          {!selection || !selection.student || !selection.lesson ? (
            <p className="muted">Выберите клетку в журнале</p>
          ) : (
            <dl className="info-list">
              <dt>Ученик</dt><dd>{selection.student.fullName}</dd>
              <dt>Дата</dt><dd>{selection.lesson.date.split('-').reverse().join('.')}</dd>
              <dt>Тема</dt><dd>{selection.topic?.theme || selection.lesson.description || '—'}</dd>
              <dt>Тип</dt><dd>{selection.topic?.taskType ? TYPE_LABELS[selection.topic.taskType] : '—'}</dd>
              <dt>Домашнее задание</dt><dd>{selection.topic?.homework || '—'}</dd>
              <dt>Вес</dt><dd>{selection.topic ? formatJournalWeight(selection.topic.weight) : '—'}</dd>
              <dt>Часы</dt><dd>{selection.topic?.hours ?? '—'}</dd>
              <dt>Оценка</dt><dd>{selection.entry?.raw || '—'}</dd>
              <dt>Пропуск</dt><dd>{selection.entry?.absent
                ? `Н${(selection.entry.absenceCount ?? 1) > 1 ? ` × ${selection.entry.absenceCount}` : ''}${selection.entry.excused ? ' (уваж.)' : ''}`
                : '—'}</dd>
            </dl>
          )}
        </aside>
      </div>
    </div>
  )
}

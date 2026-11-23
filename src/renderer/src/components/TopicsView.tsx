import { useMemo, useState } from 'react'
import { TYPE_LABELS, type JournalTopic, type TaskType } from '@core/models'
import { dateToJournalKey, formatJournalWeight } from '../../../main/providers/journal-format'

type SortKey = 'date' | 'theme' | 'homework' | 'weight' | 'hours' | 'taskType'
const SORT_COLUMNS: [SortKey, string][] = [
  ['date', 'Дата'], ['theme', 'Тема'], ['homework', 'ДЗ'], ['weight', 'Вес'],
  ['hours', 'Часы'], ['taskType', 'Тип']
]
const TYPE_OPTIONS: TaskType[] = ['current_work', 'homework', 'lab', 'exam_written', 'exam_oral', 'ignored']

interface Props {
  topics: JournalTopic[]
  academicYear: number
  busy: boolean
  onSave: (topic: JournalTopic, previousId?: string) => Promise<void>
  onDelete: (topic: JournalTopic) => Promise<void>
}

const newTopic = (): JournalTopic => ({
  id: '', date: new Date().toISOString().slice(0, 10), theme: '', taskType: null,
  homework: '', weight: 2, hours: 1
})

export default function TopicsView({ topics, academicYear, busy, onSave, onDelete }: Props) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'date', dir: 1 })
  const [draft, setDraft] = useState<JournalTopic | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [originalId, setOriginalId] = useState('')
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  const sorted = useMemo(() => [...topics].sort((a, b) => {
    const value = (t: JournalTopic): string | number => {
      switch (sort.key) {
        case 'date': return t.date
        case 'theme': return t.theme
        case 'homework': return t.homework
        case 'weight': return t.weight
        case 'hours': return t.hours
        case 'taskType': return t.taskType ? TYPE_LABELS[t.taskType] : ''
      }
    }
    const left = value(a)
    const right = value(b)
    const result = typeof left === 'number' && typeof right === 'number'
      ? left - right
      : String(left).localeCompare(String(right), 'ru', { numeric: true })
    return result * sort.dir || a.date.localeCompare(b.date)
  }), [topics, sort])

  function toggleSort(key: SortKey) {
    setSort((current) => current.key === key
      ? { key, dir: current.dir === 1 ? -1 : 1 }
      : { key, dir: 1 })
  }

  function edit(topic: JournalTopic) {
    setDraft({ ...topic })
    setEditingId(topic.id)
    setOriginalId(topic.id)
    setIsNew(false)
    setFormError('')
  }

  function add() {
    const blank = newTopic()
    const key = dateToJournalKey(blank.date, academicYear)
    setDraft({ ...blank, id: key ?? '' })
    setEditingId('')
    setOriginalId('')
    setIsNew(true)
    setFormError('')
  }

  function changeDate(value: string) {
    if (!draft) return
    const key = dateToJournalKey(value, academicYear)
    if (!key) { setFormError('Дата должна относиться к текущему учебному году'); return }
    setFormError('')
    setDraft({ ...draft, date: value, id: key })
  }

  async function save() {
    if (!draft) return
    const theme = draft.theme.trim()
    if (!theme) { setFormError('Укажите тему записи'); return }
    if (!draft.id) { setFormError('Некорректная дата'); return }
    if (topics.some((t) => t.id === draft.id && t.id !== originalId)) {
      setFormError('На эту дату уже есть запись'); return
    }
    setSaving(true)
    setFormError('')
    try {
      await onSave({ ...draft, theme }, originalId)
      setDraft(null)
      setEditingId(null)
    } catch (e) {
      setFormError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  async function remove(topic: JournalTopic) {
    if (!window.confirm(`Удалить запись от ${topic.date.split('-').reverse().join('.')}?`)) return
    setSaving(true)
    try { await onDelete(topic) } catch (e) { setFormError(e instanceof Error ? e.message : String(e)) }
    finally { setSaving(false) }
  }

  return (
    <div className="topics-view">
      {formError && !draft && <div className="banner error">{formError}</div>}
      <div className="table-wrap">
        <table className="topics">
          <thead>
            <tr>
              {SORT_COLUMNS.map(([key, label]) => (
                <th key={key}>
                  <button className="sort-button" onClick={() => toggleSort(key)}>
                    {label} {sort.key === key ? (sort.dir === 1 ? '↑' : '↓') : '↕'}
                  </button>
                </th>
              ))}
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((topic) => editingId === topic.id && !isNew ? (
              <tr key={topic.id} className="edit-row"><td colSpan={7}>{editor()}</td></tr>
            ) : (
              <tr key={topic.id}>
                <td>{topic.date.split('-').reverse().join('.')}</td>
                <td className="left">{topic.theme || <span className="muted">—</span>}</td>
                <td className="left">{topic.homework || <span className="muted">—</span>}</td>
                <td>{formatJournalWeight(topic.weight)}</td>
                <td>{topic.hours}</td>
                <td>{topic.taskType ? TYPE_LABELS[topic.taskType] : <span className="muted">—</span>}</td>
                <td>
                  <div className="row-actions">
                    <button onClick={() => edit(topic)} disabled={saving || busy}>Изменить</button>
                    <button className="danger" onClick={() => void remove(topic)} disabled={saving || busy}>Удалить</button>
                  </div>
                </td>
              </tr>
            ))}
            {isNew && draft && <tr className="edit-row"><td colSpan={7}>{editor()}</td></tr>}
            {!topics.length && !draft && <tr><td colSpan={7} className="muted pad">Нет записей</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="topics-toolbar bottom">
        <button onClick={add} disabled={saving || busy}>+ Добавить дату</button>
      </div>
    </div>
  )

  function editor() {
    if (!draft) return null
    return (
      <div className="topic-editor">
        {formError && <div className="banner error">{formError}</div>}
        <div className="topic-editor-grid">
          <label>Дата<input type="date" value={draft.date} onChange={(e) => changeDate(e.target.value)} /></label>
          <label>Тема<input type="text" value={draft.theme} onChange={(e) => setDraft({ ...draft, theme: e.target.value })} /></label>
          <label>Домашнее задание<input type="text" value={draft.homework} onChange={(e) => setDraft({ ...draft, homework: e.target.value })} /></label>
          <label>Вес отметки
            <select value={draft.weight} onChange={(e) => setDraft({ ...draft, weight: Number(e.target.value) })}>
              {Array.from({ length: 10 }, (_, w) => <option key={w} value={w}>{formatJournalWeight(w)}</option>)}
            </select>
          </label>
          <label>Часы<input type="number" min={1} step={1} value={draft.hours} onChange={(e) => setDraft({ ...draft, hours: Number(e.target.value) || 1 })} /></label>
          <label>Тип
            <select value={draft.taskType ?? 'ignored'} onChange={(e) => setDraft({ ...draft, taskType: e.target.value === 'ignored' ? null : e.target.value as TaskType })}>
              {TYPE_OPTIONS.map((type) => <option key={type} value={type}>{TYPE_LABELS[type]}</option>)}
            </select>
          </label>
        </div>
        <div className="row">
          <button onClick={() => { setDraft(null); setEditingId(null); setFormError('') }} disabled={saving}>Отмена</button>
          <span className="grow" />
          <button className="primary" onClick={() => void save()} disabled={saving || busy}>{saving ? 'Сохранение…' : 'Сохранить'}</button>
        </div>
      </div>
    )
  }
}

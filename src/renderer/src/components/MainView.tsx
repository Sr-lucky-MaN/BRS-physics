import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  type AppSettings, type BonusRow, type ClassInfo, type JournalData, type Period, type StoreSnapshot, type TaskType,
  type UserSession
} from '@core/models'
import { Classifier } from '@core/classifier'
import { computeClass } from '@core/scoring'
import { columnsFor, toCsv } from '../format'
import DetailPanel from './DetailPanel'
import ResultsTable from './ResultsTable'

const EMPTY_STORE: StoreSnapshot = { overrides: {}, bonus: {} }

function pickPeriod(periods: Period[]): Period | undefined {
  const today = new Date().toISOString().slice(0, 10)
  return periods.find((p) => p.start <= today && today <= p.end) ?? periods[periods.length - 1]
}

export default function MainView({ session, onLogout }: { session: UserSession; onLogout: () => void }) {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [classes, setClasses] = useState<ClassInfo[]>([])
  const [classId, setClassId] = useState('')
  const [periodsState, setPeriodsState] = useState<{ classId: string; periods: Period[] }>({ classId: '', periods: [] })
  const [periodId, setPeriodId] = useState('')
  const [data, setData] = useState<JournalData | null>(null)
  const [store, setStore] = useState<StoreSnapshot>(EMPTY_STORE)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState('')
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const periodsReq = useRef(0) // each loader has its own counter to ignore out-of-order responses
  const dataReq = useRef(0)
  // periods always belong to the class they were fetched for, so switching class never mixes them up
  const periods = periodsState.classId === classId ? periodsState.periods : []

  const fail = (e: unknown) => setError(e instanceof Error ? e.message : String(e))

  // 1. settings + classes
  useEffect(() => {
    setLoading('Загрузка классов…')
    Promise.all([window.api.getSettings(), window.api.getClasses()])
      .then(([s, cl]) => { setSettings(s); setClasses(cl); if (cl[0]) setClassId(cl[0].id) })
      .catch(fail)
      .finally(() => setLoading(''))
  }, [])

  // 2. periods of the selected class
  useEffect(() => {
    if (!classId) return
    const my = ++periodsReq.current
    setLoading('Загрузка периодов…')
    setData(null)
    window.api.getPeriods(classId)
      .then((ps) => {
        if (my !== periodsReq.current) return
        setPeriodsState({ classId, periods: ps })
        setPeriodId(pickPeriod(ps)?.id ?? '')
      })
      .catch(fail)
      .finally(() => { if (my === periodsReq.current) setLoading('') })
  }, [classId])

  // 3. journal data + local store for class+period
  useEffect(() => {
    const period = periods.find((p) => p.id === periodId)
    if (!classId || !period) return
    const my = ++dataReq.current
    setError('')
    setLoading('Загрузка данных журнала…')
    Promise.all([window.api.loadJournal(classId, period), window.api.getStore(classId, periodId)])
      .then(([d, s]) => { if (my !== dataReq.current) return; setData(d); setStore(s); setSelectedId(null) })
      .catch(fail)
      .finally(() => { if (my === dataReq.current) setLoading('') })
  }, [classId, periodId, periods, reload])

  const classInfo = classes.find((c) => c.id === classId)
  const grade = classInfo?.grade ?? 9

  // classification + scoring: pure functions, recomputed instantly when overrides/bonuses change
  const computed = useMemo(() => {
    if (!data || !settings) return null
    const classifier = new Classifier(settings.classifierRules)
    const autoTypes: Record<string, TaskType | null> = {}
    const types: Record<string, TaskType | null> = {}
    for (const l of data.lessons) {
      autoTypes[l.id] = classifier.classify(l.description)
      types[l.id] = store.overrides[l.id] ?? autoTypes[l.id]
    }
    const bonusTotals = Object.fromEntries(Object.entries(store.bonus).map(([sid, rows]) => [sid, rows.reduce((a, r) => a + r.points, 0)]))
    const results = computeClass(data.students, data.lessons, data.entries, types, grade, bonusTotals, settings)
    const marked = new Set(data.entries.filter((e) => e.value != null).map((e) => e.lessonId))
    const unknown = data.lessons.filter((l) => types[l.id] == null && marked.has(l.id)).length
    return { autoTypes, types, results, unknown }
  }, [data, settings, store, grade])

  const students = useMemo(() => [...(data?.students ?? [])].sort((a, b) => a.fullName.localeCompare(b.fullName, 'ru')), [data])
  const columns = useMemo(() => columnsFor(grade), [grade])
  const selected = students.find((s) => s.id === selectedId) ?? null

  const onOverride = useCallback((lessonId: string, type: TaskType | null) => {
    window.api.setOverride(classId, periodId, lessonId, type).then(setStore).catch(fail)
  }, [classId, periodId])

  const onSaveBonus = useCallback((studentId: string, rows: BonusRow[]) => {
    window.api.setBonus(classId, periodId, studentId, rows).then(setStore).catch(fail)
  }, [classId, periodId])

  async function exportCsv() {
    if (!computed) return
    const rows = students.map((s) => columns.map((c) => c.get(s, computed.results[s.id])))
    const period = periods.find((p) => p.id === periodId)
    const name = `brs_${classInfo?.name ?? ''}_${period?.name ?? ''}.csv`.replace(/[\s/\\]+/g, '_')
    try { await window.api.saveCsv(name, toCsv(columns, rows)) } catch (e) { fail(e) }
  }

  return (
    <div className="app">
      <header className="toolbar">
        <label>Класс
          <select value={classId} onChange={(e) => setClassId(e.target.value)}>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label>Период
          <select value={periodId} onChange={(e) => setPeriodId(e.target.value)}>
            {periods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <button onClick={() => setReload((n) => n + 1)} disabled={!!loading}>Обновить из журнала</button>
        <button onClick={exportCsv} disabled={!computed}>Экспорт CSV</button>
        <span className="grow" />
        <span className="muted">{session.displayName}</span>
        <button onClick={onLogout}>Выйти</button>
      </header>

      {error && <div className="banner error" onClick={() => setError('')}>{error} <span className="muted">(нажмите, чтобы скрыть)</span></div>}

      <main className="content">
        {computed ? (
          <>
            <ResultsTable students={students} results={computed.results} columns={columns} selectedId={selectedId} onSelect={setSelectedId} />
            <DetailPanel
              student={selected}
              result={selected ? computed.results[selected.id] : null}
              grade={grade}
              lessons={data!.lessons}
              entries={data!.entries}
              autoTypes={computed.autoTypes}
              types={computed.types}
              overrides={store.overrides}
              bonusRows={selected ? store.bonus[selected.id] ?? [] : []}
              onOverride={onOverride}
              onSaveBonus={onSaveBonus}
            />
          </>
        ) : (
          <p className="muted pad">{loading || 'Нет данных'}</p>
        )}
      </main>

      <footer className="status">
        {loading ? loading : data && computed
          ? <>Учеников: {data.students.length}, занятий: {data.lessons.length}.
              {computed.unknown > 0 && <span className="warn-text"> ⚠ Не распознано занятий с оценками: {computed.unknown} (вкладка «Записи журнала»)</span>}</>
          : ''}
      </footer>
    </div>
  )
}

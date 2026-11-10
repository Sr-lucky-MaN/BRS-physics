import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  type AppSettings, type BonusRow, type ClassInfo, type JournalData, type Period, type StoreSnapshot, type SubjectInfo,
  type TaskType, type Profile, type UserSession
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

export default function MainView({ session, profile, onLogout }: { session: UserSession; profile: Profile | null; onLogout: () => void }) {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [classes, setClasses] = useState<ClassInfo[]>([])
  const [classId, setClassId] = useState('')
  const [subjectsState, setSubjectsState] = useState<{ classId: string; subjects: SubjectInfo[] }>({ classId: '', subjects: [] })
  const [subjectId, setSubjectId] = useState('')
  const [periodsState, setPeriodsState] = useState<{ classId: string; subjectId: string; periods: Period[] }>({ classId: '', subjectId: '', periods: [] })
  const [periodId, setPeriodId] = useState('')
  const [data, setData] = useState<JournalData | null>(null)
  const [store, setStore] = useState<StoreSnapshot>(EMPTY_STORE)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState('')
  const [error, setError] = useState('')
  const [updateStatus, setUpdateStatus] = useState('')
  const [checkingUpdate, setCheckingUpdate] = useState(false)
  const [reload, setReload] = useState(0)
  const periodsReq = useRef(0) // each loader has its own counter to ignore out-of-order responses
  const subjectsReq = useRef(0)
  const dataReq = useRef(0)
  // periods always belong to the class they were fetched for, so switching class never mixes them up
  const periods = periodsState.classId === classId && periodsState.subjectId === subjectId ? periodsState.periods : []
  const subjects = subjectsState.classId === classId ? subjectsState.subjects : []

  const fail = (e: unknown) => setError(e instanceof Error ? e.message : String(e))

  // 1. settings + classes
  useEffect(() => {
    setLoading('Загрузка классов…')
    Promise.all([window.api.getSettings(), window.api.getClasses()])
      .then(([s, cl]) => { setSettings(s); setClasses(cl); if (cl[0]) setClassId(cl[0].id) })
      .catch(fail)
      .finally(() => setLoading(''))
  }, [])

  useEffect(() => {
    if (profile) setSettings({ homeworkMode: profile.homeworkMode, labsMinFraction: profile.labsMinFraction, classifierRules: profile.classifierRules })
  }, [profile])

  useEffect(() => {
    const my = ++subjectsReq.current
    setSubjectId('')
    if (!classId) {
      setSubjectsState({ classId: '', subjects: [] })
      return
    }
    setSubjectsState({ classId, subjects: [] })
    window.api.getSubjects(classId)
      .then((items) => {
        if (my !== subjectsReq.current) return
        setSubjectsState({ classId, subjects: items })
        setSubjectId(items[0]?.id ?? '')
      })
      .catch((e) => { if (my === subjectsReq.current) fail(e) })
  }, [classId])

  // 2. periods of the selected class
  useEffect(() => {
    if (!classId || !subjectId) {
      setPeriodsState({ classId, subjectId, periods: [] })
      setPeriodId('')
      setData(null)
      return
    }
    const my = ++periodsReq.current
    setLoading('Загрузка периодов…')
    setData(null)
    window.api.getPeriods(classId, subjectId)
      .then((ps) => {
        if (my !== periodsReq.current) return
        setPeriodsState({ classId, subjectId, periods: ps })
        setPeriodId(pickPeriod(ps)?.id ?? '')
      })
      .catch(fail)
      .finally(() => { if (my === periodsReq.current) setLoading('') })
  }, [classId, subjectId])

  // 3. journal data + local store for class+period
  useEffect(() => {
    const period = periods.find((p) => p.id === periodId)
    if (!classId || !period) return
    const my = ++dataReq.current
    setError('')
    setLoading('Загрузка данных журнала…')
    Promise.all([window.api.loadJournal(classId, subjectId, period), window.api.getStore(classId, periodId)])
      .then(([d, s]) => { if (my !== dataReq.current) return; setData(d); setStore(s); setSelectedId(null) })
      .catch(fail)
      .finally(() => { if (my === dataReq.current) setLoading('') })
  }, [classId, subjectId, periodId, periods, reload])

  const classInfo = classes.find((c) => c.id === classId)
  const grade = classInfo?.grade ?? 9

  // classification + scoring: pure functions, recomputed instantly when overrides/bonuses change
  const computed = useMemo(() => {
    if (!data || !settings) return null
    const classifier = new Classifier(settings.classifierRules)
    const autoTypes: Record<string, TaskType | null> = {}
    const types: Record<string, TaskType | null> = {}
    for (const l of data.lessons) {
      autoTypes[l.id] = l.taskType ?? classifier.classify(l.description)
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

  async function checkForUpdates() {
    setCheckingUpdate(true)
    setUpdateStatus('')
    try {
      const update = await window.api.checkUpdates()
      if (update) {
        setUpdateStatus(`Доступна версия ${update.version}`)
        await window.api.openExternal(update.url)
      } else {
        setUpdateStatus('Установлена последняя версия')
      }
    } catch (e) {
      setUpdateStatus(`Не удалось проверить обновления: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setCheckingUpdate(false)
    }
  }

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
        <label>Предмет
          <select value={subjectId} disabled={!subjects.length} onChange={(e) => setSubjectId(e.target.value)}>
            {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label>Период
          <select value={periodId} onChange={(e) => setPeriodId(e.target.value)}>
            {periods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <button onClick={() => setReload((n) => n + 1)} disabled={!!loading}>Обновить из журнала</button>
        <button onClick={exportCsv} disabled={!computed}>Экспорт CSV</button>
        <button onClick={checkForUpdates} disabled={checkingUpdate}>{checkingUpdate ? 'Проверка…' : 'Проверить обновления'}</button>
        <span className="grow" />
        <span className="muted">{session.displayName}</span>
        <button onClick={onLogout}>Выйти</button>
      </header>

      {error && <div className="banner error" onClick={() => setError('')}>{error} <span className="muted">(нажмите, чтобы скрыть)</span></div>}
      {updateStatus && <div className="banner" role="status">{updateStatus}</div>}

      <main className="content">
        {computed ? (
          <>
            <ResultsTable students={students} results={computed.results} columns={columns} selectedId={selectedId} onSelect={setSelectedId} periodMarks={data!.periodMarks} />
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

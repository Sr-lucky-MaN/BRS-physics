/**
 * >>> YOUR CODE GOES HERE <<<
 * Fill in the TODOs, then set  "provider": "journal"  in config.json.
 * (`options` = "providerOptions" from config.json, e.g. { "baseUrl": "https://journal.example" })
 */
import type { ClassInfo, Entry, JournalTopic, Lesson, Period, Student, SubjectInfo, TaskType } from '@core/models'
import { Agent, fetch as undiciFetch } from 'undici'
import { AuthError, type JournalProvider } from './types'
import solveCaptcha from './captcha_solver';
import { buildTopicText, currentAcademicStartYear, journalDate, journalEndpoint, parseGradeCell, parseJournalResponse, parseScoleConfig, parseTopicRecord, periodsFromColumns, typeFromTopic, yearColumnFromColumns, type ScoleConfig } from './journal-format'

const DEFAULT_SUBJECTS: Record<string, string> = {
  s110: 'Русский язык', s120: 'Литература', s210: 'Английский язык', s220: 'Немецкий язык',
  s230: 'Французский язык', s310: 'Искусство', s320: 'МХК', s330: 'Музыка', s410: 'Математика',
  s420: 'Алгебра', s430: 'Алгебра и начала анализа', s440: 'Геометрия', s450: 'Вероятность и статистика',
  s460: 'Информатика', s510: 'История', s520: 'История России', s530: 'Всеобщая история',
  s540: 'Обществознание', s550: 'Экономика', s560: 'Право', s570: 'География', s610: 'Физика',
  s620: 'Астрономия', s630: 'Химия', s640: 'Биология', s710: 'Технология',
  s810: 'Физическая культура', s820: 'ОБЗР'
}

export class JournalApiProvider implements JournalProvider {
  private cookies = ''
  private teachLoad: Record<string, string[]> = {}
  private username = ''
  private token = ''
  private customSubjectNames: Record<string, string> | null = null
  private scoleConfigPromise: Promise<ScoleConfig | null> | null = null
  private journalTypeLabels: Partial<Record<Exclude<TaskType, 'ignored'>, string>> = {}
  private options: Record<string, unknown>
  private insecureAgent: Agent | null = null

  constructor(options: Record<string, unknown>) { this.options = options }

  configure(options: Record<string, unknown>) {
    if (options.baseUrl !== undefined && options.baseUrl !== this.options.baseUrl) this.scoleConfigPromise = null
    this.options = { ...this.options, ...options }
    const labels = options.journalTypeLabels
    if (labels && typeof labels === 'object' && !Array.isArray(labels)) {
      this.journalTypeLabels = labels as Partial<Record<Exclude<TaskType, 'ignored'>, string>>
    }
  }

  /** Resolve an endpoint against the configured base URL, preserving its path prefix. */
  private endpoint(path: string): URL {
    const baseUrl = String(this.options.baseUrl ?? '').trim()
    if (!baseUrl) throw new AuthError('Укажите URL журнала в настройках профиля')
    try {
      return new URL(journalEndpoint(baseUrl, path))
    } catch {
      throw new AuthError(`Некорректный URL журнала: ${baseUrl}`)
    }
  }

  private async apiRequest(functionName: string, args?: string[], allowNone = false): Promise<Record<string, unknown>> {
    if (!this.token || !this.username) throw new AuthError('Сессия журнала завершена. Войдите снова.')
    const response = await this.fetchJournal(this.endpoint('/'), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain; charset=UTF-8', ...(this.cookies ? { Cookie: this.cookies } : {}) },
      body: JSON.stringify({
        t: String(this.options.loginType ?? 'staff'), l: this.username, p: this.token,
        f: functionName, ...(args ? { z: args } : {})
      })
    }, `${functionName} request`)
    const raw = await response.text().catch(() => '')
    if (!response.ok) throw new AuthError(`Ошибка ${functionName}: HTTP ${response.status}${raw.trim() ? `: ${raw.trim().slice(0, 300)}` : ''}`)
    if (allowNone && !raw.trim()) return {}

    return parseJournalResponse(raw, functionName, allowNone)
  }

  private async fetchJournal(url: URL, init: RequestInit, operation: string): Promise<Response> {
    try {
      const allowSelfSigned = this.options.allowSelfSignedCertificates === true
      if (allowSelfSigned && !this.insecureAgent) {
        this.insecureAgent = new Agent({ connect: { rejectUnauthorized: false } })
      }
      const requestInit = allowSelfSigned && this.insecureAgent
        ? { ...init, dispatcher: this.insecureAgent } as RequestInit
        : init
      return await undiciFetch(url, requestInit as Parameters<typeof undiciFetch>[1]) as unknown as Response
    } catch (error) {
      const cause = error instanceof Error && error.cause instanceof Error ? error.cause : undefined
      const code = cause && 'code' in cause ? ` [${String(cause.code)}]` : ''
      const details = cause?.message ?? (error instanceof Error ? error.message : String(error))
      throw new AuthError(`${operation} failed (${url.origin}${url.pathname}): ${details}${code}`)
    }
  }

  /** Read only the data literals from scole's public ini.js; never execute downloaded JavaScript. */
  private async getScoleConfig(): Promise<ScoleConfig | null> {
    if (!this.scoleConfigPromise) {
      this.scoleConfigPromise = (async () => {
        try {
          if (!this.options.baseUrl) return null
          const response = await this.fetchJournal(this.endpoint('/js/ini.js'), { method: 'GET' }, 'Scole configuration request')
          if (!response.ok) return null
          const source = await response.text()
          if (source.length > 1_000_000) return null
          return parseScoleConfig(source)
        } catch {
          return null
        }
      })()
    }
    const pending = this.scoleConfigPromise
    const config = await pending
    if (!config && this.scoleConfigPromise === pending) this.scoleConfigPromise = null
    return config
  }

  /** Replace this with the captcha calculation and return its ID and answer. */
  private async getCaptchaValues(): Promise<{ ci: string; c: string }> {
    const response = await this.fetchJournal(this.endpoint('/cpt.a'), { method: 'GET' }, 'Captcha request')
    if (!response.ok) throw new AuthError(`Ошибка получения капчи: HTTP ${response.status}`);
    const raw = await response.arrayBuffer().catch(() => null)
    if (!raw) throw new AuthError('Ошибка получения капчи: пустой ответ')
    const bytes = new Uint8Array(raw)
    const solution = solveCaptcha(bytes)
    const ci = response.headers.get('X-Cpt') ?? ''
    if (!ci) throw new AuthError('Ошибка получения капчи: отсутствует идентификатор')
    return { ci, c: solution }

  }

  async login(username: string, password: string) {
    // bypassCaptcha = true means skip captcha (checkbox "Use captcha" is unchecked)
    // bypassCaptcha = false means use captcha (checkbox "Use captcha" is checked)
    const useCaptcha = this.options.bypassCaptcha !== true
    
    let ci = ''
    let c = ''
    if (useCaptcha) {
      const captchaValues = await this.getCaptchaValues()
      ci = captchaValues.ci
      c = captchaValues.c
    }
    
    const body = JSON.stringify({
      t: String(this.options.loginType ?? 'staff'),
      l: username,
      p: password,
      f: 'login',
      ...(ci ? { ci } : {}),
      ...(c ? { c } : {})
    })
    const response = await this.fetchJournal(this.endpoint('/'), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain; charset=UTF-8', ...(this.cookies ? { Cookie: this.cookies } : {}) },
      body
    }, 'Login request')
    const setCookie = response.headers.getSetCookie?.() ?? []
    if (setCookie.length) this.cookies = setCookie.map((cookie) => cookie.split(';')[0]).join('; ')
    const raw = await response.text().catch(() => '')
    if (!response.ok) {
      const message = raw
      throw new AuthError(message || `Ошибка входа: HTTP ${response.status}`)
    }
    let result: unknown
    try { result = JSON.parse(raw) } catch { throw new AuthError('Журнал вернул некорректный ответ') }
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw new AuthError('Неверный логин или пароль')
    const auth = result as { token?: unknown; roles?: unknown; tutClss?: unknown; teachLoad?: unknown }
    if (typeof auth.token !== 'string' && !Array.isArray(auth.roles)) throw new AuthError('Неверный логин или пароль')
    this.username = username
    this.token = typeof auth.token === 'string' ? auth.token : ''
    this.customSubjectNames = null
    this.teachLoad = auth.teachLoad && typeof auth.teachLoad === 'object' && !Array.isArray(auth.teachLoad)
      ? Object.fromEntries(Object.entries(auth.teachLoad).filter((entry): entry is [string, string[]] =>
        Array.isArray(entry[1]) && entry[1].every((subject): subject is string => typeof subject === 'string')))
      : {}
    return {
      displayName: username,
      token: typeof auth.token === 'string' ? auth.token : undefined,
      roles: Array.isArray(auth.roles) ? auth.roles.filter((role): role is string => typeof role === 'string') : undefined,
      tutClss: Array.isArray(auth.tutClss) ? auth.tutClss.filter((className): className is string => typeof className === 'string') : undefined,
      teachLoad: auth.teachLoad && typeof auth.teachLoad === 'object' && !Array.isArray(auth.teachLoad)
        ? auth.teachLoad as Record<string, string[]>
        : undefined
    }
  }

  async logout() {
    this.cookies = ''
    this.teachLoad = {}
    this.username = ''
    this.token = ''
    this.customSubjectNames = null
  }

  async getClasses(): Promise<ClassInfo[]> {
    return Object.keys(this.teachLoad)
      .flatMap((name): ClassInfo[] => {
        const match = /^(\d{1,2})/.exec(name)
        const grade = match ? Number(match[1]) : NaN
        return Number.isInteger(grade) && grade >= 8 && grade <= 11
          ? [{ id: name, name, grade }]
          : []
      })
      .sort((a, b) => a.grade - b.grade || a.name.localeCompare(b.name, 'ru'))
  }

  async getSubjects(classId: string): Promise<SubjectInfo[]> {
    const subjectIds = [...new Set(this.teachLoad[classId] ?? [])]
    if (!subjectIds.length) return []

    const scoleConfig = await this.getScoleConfig()
    const defaultSubjects = { ...DEFAULT_SUBJECTS, ...(scoleConfig?.defaultSubjects ?? {}) }
    const customIds = subjectIds.filter((id) => !(id in defaultSubjects))
    if (customIds.length && this.customSubjectNames === null) {
      if (!this.token) throw new AuthError('Не удалось получить токен для загрузки списка предметов')
      const response = await this.fetchJournal(this.endpoint('/'), {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain; charset=UTF-8',
          ...(this.cookies ? { Cookie: this.cookies } : {})
        },
        body: JSON.stringify({
          t: String(this.options.loginType ?? 'staff'),
          l: this.username,
          p: this.token,
          f: 'subjList'
        })
      }, 'Subject list request')
      const raw = await response.text().catch(() => '')
      if (!response.ok) throw new AuthError(`Ошибка получения предметов: HTTP ${response.status}`)
      let result: unknown
      try { result = JSON.parse(raw) } catch { throw new AuthError('Журнал вернул некорректный список предметов') }
      if (!result || typeof result !== 'object' || Array.isArray(result)) {
        throw new AuthError('Не удалось получить список дополнительных предметов')
      }
      this.customSubjectNames = Object.fromEntries(Object.entries(result).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string'
      ))
    }

    return subjectIds.map((id) => ({
      id,
      name: defaultSubjects[id] ?? this.customSubjectNames?.[id] ?? id
    }))
  }

  async getPeriods(classId: string, subjectId: string): Promise<Period[]> {
    const grades = await this.apiRequest('gradesGet', [classId, subjectId, this.username])
    const grade = Number(/^\d{1,2}/.exec(classId)?.[0] ?? 9)
    const config = await this.getScoleConfig()
    return periodsFromColumns(Object.keys(grades), grade, currentAcademicStartYear(), config?.periods)
  }

  async loadJournal(classId: string, subjectId: string, period: Period) {
    const config = await this.getScoleConfig()
    const [grades, topics, respect] = await Promise.all([
      this.apiRequest('gradesGet', [classId, subjectId, this.username]),
      this.apiRequest('topicsGet', [classId, subjectId, this.username], true),
      this.apiRequest('sprResp', [classId.split('-')[0], ''], true)
    ])
    const academicYear = currentAcademicStartYear()
    const usernames = Array.isArray(grades.puList) ? grades.puList.filter((value): value is string => typeof value === 'string') : []
    const names = Array.isArray(grades.pnList) ? grades.pnList : []
    const students: Student[] = usernames.map((id, index) => ({
      id,
      fullName: typeof names[index] === 'string' ? names[index] as string : id
    }))
    const dateKeys = new Set<string>()
    for (const key of [...Object.keys(grades), ...Object.keys(topics)]) {
      if (/^d\d\d\d$/.test(key)) dateKeys.add(key)
    }
    const topicValues = topics as Record<string, Record<string, unknown>>
    const journalTopics: JournalTopic[] = []
    const lessons: Lesson[] = [...dateKeys].flatMap((key) => {
      const date = journalDate(key, academicYear)
      if (!date || date < period.start || date > period.end) return []
      const topic = topicValues[key] ?? {}
      const record = parseTopicRecord(key, date, topic, this.journalTypeLabels)
      journalTopics.push(record)
      const rawTopic = typeof topic.t === 'string' ? topic.t.trim() : ''
      const hours = record.hours
      const description = rawTopic ? `${rawTopic}${hours > 1 ? ` (${hours} ч)` : ''}` : ''
      return [{ id: key, date, description, taskType: typeFromTopic(rawTopic, this.journalTypeLabels) }]
    }).sort((a, b) => a.date.localeCompare(b.date))
    journalTopics.sort((a, b) => a.date.localeCompare(b.date))

    const periodsByStudent = respect as Record<string, unknown>
    const excusedByDate = new Map<string, boolean>()
    for (const student of students) {
      const intervals = Array.isArray(periodsByStudent[student.id]) ? periodsByStudent[student.id] as unknown[] : []
      for (const interval of intervals) {
        if (!Array.isArray(interval) || typeof interval[0] !== 'string' || typeof interval[1] !== 'string') continue
        const [from, to] = interval as [string, string]
        for (const lesson of lessons) {
          if (lesson.date >= from && lesson.date <= to) excusedByDate.set(`${student.id}|${lesson.id}`, true)
        }
      }
    }

    const entries: Entry[] = []
    const gradeColumns = grades as Record<string, unknown>
    for (const lesson of lessons) {
      const values = Array.isArray(gradeColumns[lesson.id]) ? gradeColumns[lesson.id] as unknown[] : []
      students.forEach((student, index) => {
        const parsed = parseGradeCell(values[index])
        if (parsed.value === null && parsed.absenceCount === 0) return
        entries.push({
          studentId: student.id, lessonId: lesson.id, value: parsed.value,
          absent: parsed.absenceCount > 0,
          excused: parsed.absenceCount > 0 && excusedByDate.has(`${student.id}|${lesson.id}`),
          absenceCount: parsed.absenceCount,
          raw: parsed.raw
        })
      })
    }

    const marksFrom = (column: string): Record<string, string> => {
      const values = Array.isArray(gradeColumns[column]) ? gradeColumns[column] as unknown[] : []
      return Object.fromEntries(students.flatMap((student, index) => {
        const mark = typeof values[index] === 'string' || typeof values[index] === 'number' ? String(values[index]).trim() : ''
        return mark ? [[student.id, mark]] : []
      }))
    }
    const periodMarks = marksFrom(period.finalColumn)
    const yearColumn = yearColumnFromColumns(Object.keys(grades), academicYear, config?.periods)
    const yearMarks = yearColumn ? marksFrom(yearColumn) : {}
    return { students, lessons, topics: journalTopics, entries, periodMarks, yearColumn, yearMarks }
  }

  async saveTopic(classId: string, subjectId: string, topic: JournalTopic): Promise<void> {
    await this.apiRequest('topicEdit', [
      classId, subjectId, topic.id,
      buildTopicText(topic.theme, topic.taskType, this.journalTypeLabels),
      topic.homework, String(topic.weight), String(topic.hours)
    ], true)
  }

  async deleteTopic(classId: string, subjectId: string, topic: JournalTopic): Promise<void> {
    await this.apiRequest('topicEdit', [
      classId, subjectId, topic.id, '',
      topic.homework, String(topic.weight), String(topic.hours)
    ], true)
  }

  async setGrade(classId: string, subjectId: string, day: string, studentId: string, value: string): Promise<void> {
    await this.apiRequest('gradeAdd', [day, classId, subjectId, studentId, value, 'a'], true)
  }
}

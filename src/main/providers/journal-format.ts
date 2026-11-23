import { JOURNAL_TYPE_LABELS, type JournalTopic, type Period, type TaskType } from '@core/models'

export interface ScolePeriodDefinition {
  shortName: string
  name: string
  start: string
  end: string
}

export interface ScoleConfig {
  periods: ScolePeriodDefinition[]
  defaultSubjects: Record<string, string>
}

const FALLBACK_PERIODS: ScolePeriodDefinition[] = [
  { shortName: '1ч', name: 'Первая четверть', start: '01.09', end: '05.11' },
  { shortName: '2ч', name: 'Вторая четверть', start: '06.11', end: '31.12' },
  { shortName: '1п', name: 'Первое полугодие', start: '01.09', end: '31.12' },
  { shortName: '3ч', name: 'Третья четверть', start: '01.01', end: '28.03' },
  { shortName: '4ч', name: 'Четвертая четверть', start: '29.03', end: '31.05' },
  { shortName: '2п', name: 'Второе полугодие', start: '01.01', end: '31.05' },
  { shortName: 'Год', name: 'Учебный год', start: '01.09', end: '25.06' }
]

type JsLiteral = string | JsLiteral[] | { [key: string]: JsLiteral }

/** Parse only JS string/array/object literals. The downloaded script is never executed. */
function parseLiteral(source: string, start: number): { value: JsLiteral; end: number } {
  let i = start
  const skip = () => {
    while (i < source.length) {
      if (/\s/.test(source[i])) { i++; continue }
      if (source.startsWith('//', i)) {
        i = source.indexOf('\n', i + 2)
        if (i < 0) i = source.length
        continue
      }
      if (source.startsWith('/*', i)) {
        const end = source.indexOf('*/', i + 2)
        if (end < 0) throw new Error('Unclosed comment')
        i = end + 2
        continue
      }
      break
    }
  }
  const readString = (): string => {
    const quote = source[i++]
    let value = ''
    while (i < source.length && source[i] !== quote) {
      const ch = source[i++]
      if (ch !== '\\') { value += ch; continue }
      if (i >= source.length) throw new Error('Invalid string escape')
      const escaped = source[i++]
      const simple: Record<string, string> = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v', '0': '\0' }
      if (escaped in simple) value += simple[escaped]
      else if (escaped === '\n') continue
      else if (escaped === '\r') { if (source[i] === '\n') i++; continue }
      else if (escaped === 'x' || escaped === 'u') {
        const count = escaped === 'x' ? 2 : 4
        const hex = source.slice(i, i + count)
        if (!new RegExp(`^[0-9a-fA-F]{${count}}$`).test(hex)) throw new Error('Invalid unicode escape')
        value += String.fromCharCode(parseInt(hex, 16))
        i += count
      } else value += escaped
    }
    if (source[i] !== quote) throw new Error('Unclosed string')
    i++
    return value
  }
  const readValue = (): JsLiteral => {
    skip()
    const ch = source[i]
    if (ch === '"' || ch === "'") return readString()
    if (ch === '[') {
      i++
      const values: JsLiteral[] = []
      skip()
      while (source[i] !== ']') {
        values.push(readValue())
        skip()
        if (source[i] === ',') { i++; skip(); continue }
        if (source[i] !== ']') throw new Error('Expected comma or closing bracket')
      }
      i++
      return values
    }
    if (ch === '{') {
      i++
      const value: Record<string, JsLiteral> = {}
      skip()
      while (source[i] !== '}') {
        let key: string
        if (source[i] === '"' || source[i] === "'") key = readString()
        else {
          const match = /^[A-Za-z_$][\w$]*/.exec(source.slice(i))
          if (!match) throw new Error('Invalid object key')
          key = match[0]
          i += key.length
        }
        skip()
        if (source[i++] !== ':') throw new Error('Expected colon')
        value[key] = readValue()
        skip()
        if (source[i] === ',') { i++; skip(); continue }
        if (source[i] !== '}') throw new Error('Expected comma or closing brace')
      }
      i++
      return value
    }
    throw new Error('Unsupported JavaScript value')
  }
  const value = readValue()
  return { value, end: i }
}

function readDeclaration(source: string, name: string): JsLiteral {
  const declaration = new RegExp(`\\b(?:const|let|var)\\s+${name}\\s*=`).exec(source)
  if (!declaration) throw new Error(`Missing ${name}`)
  return parseLiteral(source, declaration.index + declaration[0].length).value
}

/** Extract scole's period and default-subject literals without evaluating remote JavaScript. */
export function parseScoleConfig(source: string): ScoleConfig {
  const rawPeriods = readDeclaration(source, 'STPER')
  const rawSubjects = readDeclaration(source, 'subjDef')
  if (!Array.isArray(rawPeriods) || !rawPeriods.length || !rawSubjects || Array.isArray(rawSubjects) || typeof rawSubjects !== 'object') {
    throw new Error('Invalid scole configuration')
  }
  const periods = rawPeriods.map((row): ScolePeriodDefinition => {
    if (!Array.isArray(row) || row.length !== 4 || !row.every((item) => typeof item === 'string')) {
      throw new Error('Invalid period definition')
    }
    const [shortName, name, start, end] = row as string[]
    for (const date of [start, end]) {
      const match = /^(\d{2})\.(\d{2})$/.exec(date)
      if (!match) throw new Error('Invalid period date')
      const month = Number(match[2])
      const day = Number(match[1])
      const check = new Date(Date.UTC(2024, month - 1, day))
      if (month < 1 || month > 12 || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
        throw new Error('Invalid period date')
      }
    }
    return { shortName, name, start, end }
  })
  const defaultSubjects: Record<string, string> = {}
  for (const [id, label] of Object.entries(rawSubjects)) {
    if (!/^s\d{3}$/.test(id) || typeof label !== 'string' || !label.trim()) throw new Error('Invalid default subject')
    defaultSubjects[id] = label
  }
  if (!Object.keys(defaultSubjects).length) throw new Error('Empty default subject list')
  return { periods, defaultSubjects }
}

/** The journal uses dxyy: x=0..9 means Sep..Jun, yy is the day of month. */
export function journalDate(key: string, academicStartYear: number): string | null {
  const match = /^d([0-9])(\d{2})$/.exec(key)
  if (!match) return null
  const monthIndex = Number(match[1])
  const day = Number(match[2])
  if (monthIndex > 9 || day < 1 || day > 31) return null
  const month = (monthIndex + 8) % 12
  const year = academicStartYear + (monthIndex >= 4 ? 1 : 0)
  const date = new Date(Date.UTC(year, month, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month || date.getUTCDate() !== day) return null
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function currentAcademicStartYear(now = new Date()): number {
  return now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1
}

/** Inverse of journalDate: '2026-09-16' -> 'd016'. Rejects dates outside the academic year. */
export function dateToJournalKey(iso: string, academicStartYear: number): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  const monthIndex = (month - 9 + 12) % 12
  const expectedYear = academicStartYear + (monthIndex >= 4 ? 1 : 0)
  if (year !== expectedYear) return null
  return `d${monthIndex}${String(day).padStart(2, '0')}`
}

/** Weight codes from topicsGet: 0..8 are 0..4 in 0.5 steps, 9 is a special "П". */
export function formatJournalWeight(weight: number): string {
  return weight === 9 ? 'П' : String(weight / 2)
}

/**
 * Parse a journal response. Write requests answer with 'success', an empty body or a plain string,
 * so allowNone treats any non-error payload as success instead of demanding JSON.
 */
export function parseJournalResponse(raw: string, functionName: string, allowNone = false): Record<string, unknown> {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
    if (typeof parsed === 'string') {
      try { parsed = JSON.parse(parsed) } catch { /* plain text response */ }
    }
  } catch {
    parsed = raw.trim()
  }

  if (allowNone) {
    const isObject = !!parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    const message = isObject
      ? String((parsed as Record<string, unknown>).error ?? (parsed as Record<string, unknown>).message ?? '')
      : String(parsed)
    if (message && /ошибк|error|denied|forbidden|invalid|fail|неверн/i.test(message)) {
      throw new Error(`${functionName}: ${message.slice(0, 300)}`)
    }
    // Valid JSON must still reach the caller: allowNone only tolerates empty/plain responses.
    return isObject ? parsed as Record<string, unknown> : {}
  }

  if (parsed === 'none') throw new Error(`Журнал не вернул данные для ${functionName}`)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Журнал вернул некорректный ответ для ${functionName}`)
  }
  return parsed as Record<string, unknown>
}

function periodDate(value: string, academicYear: number): string | null {
  const match = /^(\d{2})\.(\d{2})$/.exec(value)
  if (!match) return null
  const day = Number(match[1])
  const month = Number(match[2])
  const year = academicYear + (month < 9 ? 1 : 0)
  const date = new Date(Date.UTC(year, month - 1, day))
  if (month < 1 || month > 12 || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function periodsFromColumns(
  keys: string[],
  grade: number,
  academicYear: number,
  definitions: ScolePeriodDefinition[] = FALLBACK_PERIODS
): Period[] {
  const wanted = new Set(grade <= 9 ? ['1ч', '2ч', '3ч', '4ч'] : ['1п', '2п'])
  const columns = new Map(keys.flatMap((key) => {
    const match = /^d([0-9])(\d{2})([a-g])$/.exec(key)
    if (!match) return []
    const index = match[3].charCodeAt(0) - 97
    const definition = definitions[index]
    if (!definition || !wanted.has(definition.shortName)) return []
    return [[definition.shortName, key] as const]
  }))

  return definitions.flatMap((definition, index) => {
    if (!wanted.has(definition.shortName)) return []
    const start = periodDate(definition.start, academicYear)
    const end = periodDate(definition.end, academicYear)
    if (!start || !end) return []
    const letter = String.fromCharCode(97 + index)
    const dayMonth = /^\d{2}\.(\d{2})$/.exec(definition.end)
    if (!dayMonth) return []
    const month = Number(dayMonth[1])
    const monthIndex = month > 8 ? month - 9 : month + 3
    const expectedColumn = `d${monthIndex}${definition.end.slice(0, 2)}${letter}`
    return [{
      id: `${letter}-${academicYear}`,
      name: definition.name,
      start,
      end,
      finalColumn: columns.get(definition.shortName) ?? expectedColumn
    }]
  }).sort((a, b) => a.end.localeCompare(b.end))
}

/** Column holding the mark for the whole academic year (e.g. d925g). Uses the real key when present. */
export function yearColumnFromColumns(
  keys: string[],
  academicYear: number,
  definitions: ScolePeriodDefinition[] = FALLBACK_PERIODS
): string {
  const index = definitions.findIndex((d) => d.shortName === 'Год')
  const fallbackIndex = FALLBACK_PERIODS.findIndex((d) => d.shortName === 'Год')
  const position = index >= 0 ? index : fallbackIndex
  if (position < 0) return ''
  const definition = index >= 0 ? definitions[index] : FALLBACK_PERIODS[fallbackIndex]
  const letter = String.fromCharCode(97 + position)
  const existing = keys.find((key) => new RegExp(`^d[0-9]{3}${letter}$`).test(key))
  if (existing) return existing
  const dayMonth = /^(\d{2})\.(\d{2})$/.exec(definition.end)
  if (!dayMonth || !periodDate(definition.end, academicYear)) return ''
  const month = Number(dayMonth[2])
  const monthIndex = month > 8 ? month - 9 : month + 3
  return `d${monthIndex}${dayMonth[1]}${letter}`
}

export function parseGradeCell(raw: unknown): { value: number | null; absenceCount: number; raw: string } {
  const text = typeof raw === 'string' || typeof raw === 'number' ? String(raw) : ''
  const absenceCount = (text.match(/н/gi) ?? []).length
  const mark = text.replace(/н/gi, '').match(/\d+(?:[.,]\d+)?/)
  const value = mark ? Number(mark[0].replace(',', '.')) : null
  return { value: Number.isFinite(value) && value !== 999 ? value : null, absenceCount, raw: text }
}

export function typeFromTopic(
  topic: string,
  labels: Partial<Record<Exclude<TaskType, 'ignored'>, string>>
): TaskType | undefined {
  const suffix = topic.split('|').at(-1)?.trim().toLocaleLowerCase('ru')
  if (!suffix) return undefined
  return (Object.keys(JOURNAL_TYPE_LABELS) as (keyof typeof JOURNAL_TYPE_LABELS)[]).find((type) =>
    suffix === (labels[type] || JOURNAL_TYPE_LABELS[type]).trim().toLocaleLowerCase('ru')
  )
}

/** Split a topic into the visible theme and the type encoded in its suffix. */
export function splitTopicText(
  raw: string,
  labels: Partial<Record<Exclude<TaskType, 'ignored'>, string>>
): { theme: string; taskType: TaskType | null } {
  const parts = raw.split('|')
  if (parts.length < 2) return { theme: raw.trim(), taskType: null }
  return {
    theme: parts.slice(0, -1).join('|').trim(),
    taskType: typeFromTopic(raw, labels) ?? null
  }
}

/** Build the `theme | type` value. "Не учитывать" is sent without a suffix. */
export function buildTopicText(
  theme: string,
  taskType: TaskType | null,
  labels: Partial<Record<Exclude<TaskType, 'ignored'>, string>>
): string {
  const clean = theme.trim()
  if (!taskType || taskType === 'ignored') return clean
  return `${clean} | ${labels[taskType] || JOURNAL_TYPE_LABELS[taskType]}`
}

/** Convert one topicsGet column into the model used by both new pages. */
export function parseTopicRecord(
  id: string,
  date: string,
  raw: Record<string, unknown>,
  labels: Partial<Record<Exclude<TaskType, 'ignored'>, string>>
): JournalTopic {
  const text = typeof raw.t === 'string' ? raw.t : ''
  const { theme, taskType } = splitTopicText(text, labels)
  const weight = Number(raw.w)
  const hours = Number(raw.v)
  return {
    id,
    date,
    theme,
    taskType,
    homework: raw.h == null ? '' : String(raw.h),
    weight: Number.isInteger(weight) && weight >= 0 && weight <= 9 ? weight : 0,
    hours: Number.isFinite(hours) && hours > 0 ? hours : 1
  }
}
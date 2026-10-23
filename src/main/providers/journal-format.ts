import type { Period, TaskType } from '@core/models'

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

export function parseGradeCell(raw: unknown): { value: number | null; absenceCount: number } {
  const text = typeof raw === 'string' || typeof raw === 'number' ? String(raw) : ''
  const absenceCount = (text.match(/н/gi) ?? []).length
  const mark = text.replace(/н/gi, '').match(/\d+(?:[.,]\d+)?/)
  const value = mark ? Number(mark[0].replace(',', '.')) : null
  return { value: Number.isFinite(value) && value !== 999 ? value : null, absenceCount }
}

export function typeFromTopic(
  topic: string,
  labels: Partial<Record<Exclude<TaskType, 'ignored'>, string>>
): TaskType | undefined {
  const defaults: Record<Exclude<TaskType, 'ignored'>, string> = {
    current_work: 'Текущая работа',
    lab: 'Лабораторная работа',
    homework: 'Процент выполнения ДЗ',
    exam_oral: 'Экзамен устный',
    exam_written: 'Экзамен письменный'
  }
  const suffix = topic.split('|').at(-1)?.trim().toLocaleLowerCase('ru')
  if (!suffix) return undefined
  return (Object.keys(defaults) as (keyof typeof defaults)[]).find((type) =>
    suffix === (labels[type] || defaults[type]).trim().toLocaleLowerCase('ru')
  )
}
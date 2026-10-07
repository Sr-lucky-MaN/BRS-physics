import type { TaskType } from './models'

// NOTE: JS "\b" only knows ASCII letters, so it is useless for Cyrillic. Use these look-arounds instead.
const L = String.raw`(?<![\p{L}\p{N}])`
const R = String.raw`(?![\p{L}\p{N}])`

export const DEFAULT_RULES: Record<Exclude<TaskType, 'ignored'>, string[]> = {
  exam_written: [String.raw`итогов\p{L}*\s+(контрольн|к/р|кр${R})`, String.raw`семестров\p{L}*\s+контрольн`],
  exam_oral: [String.raw`устн\p{L}*\s+экзамен`, String.raw`экзамен\p{L}*\s*\(?\s*устн`],
  lab: ['лаборатор', `${L}(л/р|лр)${R}`],
  homework: ['домашн', `${L}(д/з|дз)${R}`],
  current_work: ['самостоятельн', 'контрольн', `${L}(к/р|кр|с/р|ср)${R}`, 'коллоквиум', 'зач[её]т']
}

// Order matters: first match wins. "Итоговая контрольная" must be tested before plain "контрольная".
const ORDER: Exclude<TaskType, 'ignored'>[] = ['exam_written', 'exam_oral', 'lab', 'homework', 'current_work']

export class Classifier {
  private compiled: [TaskType, RegExp[]][]

  constructor(overrides: Partial<Record<TaskType, string[]>> = {}) {
    const rules = { ...DEFAULT_RULES, ...overrides } as Record<string, string[]>
    this.compiled = ORDER.map((t) => [t, (rules[t] ?? []).map((p) => new RegExp(p, 'iu'))])
  }

  /** Task type for a journal description, or null if nothing matches. */
  classify(description: string): TaskType | null {
    const text = (description ?? '').trim()
    for (const [type, patterns] of this.compiled) {
      if (patterns.some((p) => p.test(text))) return type
    }
    return null
  }
}

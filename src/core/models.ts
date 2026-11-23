/** Plain data structures shared by the main process (journal, storage) and the UI. Dates are 'YYYY-MM-DD'. */

export type TaskType = 'current_work' | 'homework' | 'lab' | 'exam_written' | 'exam_oral' | 'ignored'

export const TYPE_LABELS: Record<TaskType, string> = {
  current_work: 'Текущая работа',
  homework: 'Домашнее задание',
  lab: 'Лабораторная',
  exam_written: 'Итоговая контрольная',
  exam_oral: 'Устный экзамен',
  ignored: 'Не учитывать'
}

/** Labels the electronic journal expects after `|` in a topic description. */
export const JOURNAL_TYPE_LABELS: Record<Exclude<TaskType, 'ignored'>, string> = {
  current_work: 'Текущая работа',
  lab: 'Лабораторная работа',
  homework: 'Процент выполнения ДЗ',
  exam_oral: 'Экзамен устный',
  exam_written: 'Экзамен письменный'
}

export interface ClassInfo {
  id: string
  name: string // e.g. "9А"
  grade: number // 8..11
}

export interface SubjectInfo {
  id: string
  name: string
}

export interface Period {
  id: string
  name: string // e.g. "1 четверть"
  start: string
  end: string
  finalColumn: string
}

export interface Student {
  id: string
  fullName: string
}

/** One journal column: a date plus the teacher's description of the activity. */
export interface Lesson {
  id: string
  date: string
  description: string
  taskType?: TaskType
}

/**
 * What the journal holds for one student on one lesson.
 * value   - the mark (null/undefined if only an absence is recorded)
 * absent  - student has an "Н"
 * excused - the "Н" is green (уважительная)
 * A student with nothing on a lesson simply has no Entry.
 */
export interface Entry {
  studentId: string
  lessonId: string
  value?: number | null
  absent?: boolean
  excused?: boolean
  absenceCount?: number
  raw?: string // exact cell text from the journal ('5', 'н', '5 н н', ...)
}

/** One topic record from topicsGet (a dXXXX column). */
export interface JournalTopic {
  id: string // dXXXX
  date: string
  theme: string // without the '| type' suffix
  taskType: TaskType | null
  homework: string
  weight: number // 0..9 raw code; 9 means "П"
  hours: number
}

export interface UserSession {
  username: string
  displayName: string
  token?: string
  roles?: string[]
  tutClss?: string[]
  teachLoad?: Record<string, string[]>
}

export interface Profile {
  id: string
  name: string
  journalUrl: string
  allowSelfSignedCertificates?: boolean
  bypassCaptcha?: boolean
  labsMinFraction: number
  classifierRules: Partial<Record<TaskType, string[]>>
  journalTypeLabels?: Partial<Record<Exclude<TaskType, 'ignored'>, string>>
}

export interface SavedCredential {
  username: string
  password: string
  profileId: string
}

export interface LocalAuthState {
  profiles: Profile[]
  selectedProfileId: string
  credentials: SavedCredential[]
  rememberMe: boolean
  dontSignOut: boolean
}

export interface JournalData {
  students: Student[]
  lessons: Lesson[]
  topics: JournalTopic[]
  entries: Entry[]
  periodMarks: Record<string, string>
  /** Column that stores the final mark for the academic year (e.g. d925g). */
  yearColumn: string
  yearMarks: Record<string, string>
}

export interface BonusRow {
  key: string // catalog key or 'custom'
  points: number
  comment: string
}

/** Everything the app stores locally for one class+period. */
export interface StoreSnapshot {
  overrides: Record<string, TaskType> // lessonId -> type
  bonus: Record<string, BonusRow[]> // studentId -> rows
}

export interface AppSettings {
  labsMinFraction: number
  classifierRules: Partial<Record<TaskType, string[]>>
}

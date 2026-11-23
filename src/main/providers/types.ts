import type { ClassInfo, Entry, JournalTopic, Lesson, Period, Student, SubjectInfo } from '@core/models'

/** Throw from login() with a user-readable message (shown on the login screen). */
export class AuthError extends Error {}

/**
 * THE INTERFACE YOU IMPLEMENT to connect the app to the real journal.
 * Everything else (scoring, UI, storage) works on the plain types from @core/models.
 * It runs in Electron's main process (Node), so `fetch`, `fs`, cookies etc. are all available.
 */
export interface JournalProvider {
  /** Authenticate. Resolve with an optional display name, or throw AuthError("Неверный пароль"). */
  login(username: string, password: string): Promise<{ displayName?: string; token?: string; roles?: string[]; tutClss?: string[]; teachLoad?: Record<string, string[]> } | void>
  logout(): Promise<void>

  /** Classes (grade 8..11) the logged-in teacher can see. */
  getClasses(): Promise<ClassInfo[]>
  /** Subjects assigned to the teacher for the selected class. */
  getSubjects(classId: string): Promise<SubjectInfo[]>
  /** Quarters for grades 8-9, semesters for 10-11 (dates as 'YYYY-MM-DD'). */
  getPeriods(classId: string, subjectId: string): Promise<Period[]>
  /**
   * EVERY physics lesson (journal column) in the period, including ones with no marks:
   * the count is the denominator of the absence percentage.
   * `description` is the text the teacher wrote for that date - it drives task-type detection.
   */
  loadJournal(classId: string, subjectId: string, period: Period): Promise<{
    students: Student[]
    lessons: Lesson[]
    topics: JournalTopic[]
    entries: Entry[]
    periodMarks: Record<string, string>
    yearColumn: string
    yearMarks: Record<string, string>
  }>
  /** Create or update one dXXXX topic. "Не учитывать" is encoded as no type suffix. */
  saveTopic(classId: string, subjectId: string, topic: JournalTopic): Promise<void>
  /** Delete a topic by sending an empty theme to topicEdit. */
  deleteTopic(classId: string, subjectId: string, topic: JournalTopic): Promise<void>
  /** Write one grade cell: gradeAdd [day, class, subject, student, value, 'a']. */
  setGrade(classId: string, subjectId: string, day: string, studentId: string, value: string): Promise<void>
}

export type ProviderFactory = (options: Record<string, unknown>) => JournalProvider

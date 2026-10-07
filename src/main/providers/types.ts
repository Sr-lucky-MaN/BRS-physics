import type { ClassInfo, Entry, Lesson, Period, Student } from '@core/models'

/** Throw from login() with a user-readable message (shown on the login screen). */
export class AuthError extends Error {}

/**
 * THE INTERFACE YOU IMPLEMENT to connect the app to the real journal.
 * Everything else (scoring, UI, storage) works on the plain types from @core/models.
 * It runs in Electron's main process (Node), so `fetch`, `fs`, cookies etc. are all available.
 */
export interface JournalProvider {
  /** Authenticate. Resolve with an optional display name, or throw AuthError("Неверный пароль"). */
  login(username: string, password: string): Promise<{ displayName?: string } | void>
  logout(): Promise<void>

  /** Classes (grade 8..11) the logged-in teacher can see. */
  getClasses(): Promise<ClassInfo[]>
  /** Quarters for grades 8-9, semesters for 10-11 (dates as 'YYYY-MM-DD'). */
  getPeriods(classId: string): Promise<Period[]>
  getStudents(classId: string): Promise<Student[]>
  /**
   * EVERY physics lesson (journal column) in the period, including ones with no marks:
   * the count is the denominator of the absence percentage.
   * `description` is the text the teacher wrote for that date - it drives task-type detection.
   */
  getLessons(classId: string, period: Period): Promise<Lesson[]>
  /**
   * One Entry per (student, lesson) that has a mark and/or an "Н".
   * Set excused: true for green (уважительная) absences.
   */
  getEntries(classId: string, period: Period): Promise<Entry[]>
}

export type ProviderFactory = (options: Record<string, unknown>) => JournalProvider

/**
 * >>> YOUR CODE GOES HERE <<<
 * Fill in the TODOs, then set  "provider": "journal"  in config.json.
 * (`options` = "providerOptions" from config.json, e.g. { "baseUrl": "https://journal.example" })
 */
import type { ClassInfo, Entry, Lesson, Period, Student } from '@core/models'
import { AuthError, type JournalProvider } from './types'

export class JournalApiProvider implements JournalProvider {
  // private token: string | null = null

  constructor(private options: Record<string, unknown>) {}

  async login(username: string, password: string) {
    // TODO: call the journal's login endpoint, keep cookies / token in this instance.
    // On failure: throw new AuthError('Неверный логин или пароль')
    void username; void password
    throw new AuthError('Провайдер журнала ещё не реализован (src/main/providers/journal.ts)')
  }

  async logout() {
    // TODO: drop token / cookies
  }

  async getClasses(): Promise<ClassInfo[]> {
    // TODO: return [{ id: '...', name: '9А', grade: 9 }, ...]
    throw new Error('not implemented')
  }

  async getPeriods(classId: string): Promise<Period[]> {
    // TODO: return [{ id: 'q1', name: '1 четверть', start: '2026-09-01', end: '2026-10-31' }, ...]
    void classId
    throw new Error('not implemented')
  }

  async getStudents(classId: string): Promise<Student[]> {
    // TODO: return [{ id: '...', fullName: 'Иванов Иван' }, ...]
    void classId
    throw new Error('not implemented')
  }

  async getLessons(classId: string, period: Period): Promise<Lesson[]> {
    // TODO: return [{ id: '...', date: '2026-09-03', description: 'Самостоятельная работа №2' }, ...]
    void classId; void period
    throw new Error('not implemented')
  }

  async getEntries(classId: string, period: Period): Promise<Entry[]> {
    // TODO: return [{ studentId, lessonId, value: 8, absent: false, excused: false }, ...]
    void classId; void period
    throw new Error('not implemented')
  }
}

import type {
  AppSettings, BonusRow, ClassInfo, JournalData, Period, StoreSnapshot, TaskType, UserSession
} from '@core/models'

/** The API the renderer sees as `window.api` (implemented via IPC in src/main/ipc.ts). */
export interface BrsApi {
  login(username: string, password: string): Promise<UserSession>
  logout(): Promise<void>
  getSettings(): Promise<AppSettings>
  getClasses(): Promise<ClassInfo[]>
  getPeriods(classId: string): Promise<Period[]>
  loadJournal(classId: string, period: Period): Promise<JournalData>
  getStore(classId: string, periodId: string): Promise<StoreSnapshot>
  setOverride(classId: string, periodId: string, lessonId: string, type: TaskType | null): Promise<StoreSnapshot>
  setBonus(classId: string, periodId: string, studentId: string, rows: BonusRow[]): Promise<StoreSnapshot>
  /** Opens a "save as" dialog and writes the text file. Returns the path or null if cancelled. */
  saveCsv(defaultName: string, content: string): Promise<string | null>
}

export const API_METHODS: (keyof BrsApi)[] = [
  'login', 'logout', 'getSettings', 'getClasses', 'getPeriods', 'loadJournal', 'getStore', 'setOverride',
  'setBonus', 'saveCsv'
]

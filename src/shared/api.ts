import type {
  AppSettings, BonusRow, ClassInfo, JournalData, LocalAuthState, Period, Profile, StoreSnapshot, SubjectInfo, TaskType, UserSession
} from '@core/models'

/** The API the renderer sees as `window.api` (implemented via IPC in src/main/ipc.ts). */
export interface BrsApi {
  login(username: string, password: string, profile: Profile): Promise<UserSession>
  logout(): Promise<void>
  getSettings(): Promise<AppSettings>
  getAuthState(): Promise<LocalAuthState>
  saveAuthState(state: LocalAuthState): Promise<LocalAuthState>
  getClasses(): Promise<ClassInfo[]>
  getSubjects(classId: string): Promise<SubjectInfo[]>
  getPeriods(classId: string, subjectId: string): Promise<Period[]>
  loadJournal(classId: string, subjectId: string, period: Period): Promise<JournalData>
  getStore(classId: string, periodId: string): Promise<StoreSnapshot>
  setOverride(classId: string, periodId: string, lessonId: string, type: TaskType | null): Promise<StoreSnapshot>
  setBonus(classId: string, periodId: string, studentId: string, rows: BonusRow[]): Promise<StoreSnapshot>
  /** Opens a "save as" dialog and writes the text file. Returns the path or null if cancelled. */
  saveCsv(defaultName: string, content: string): Promise<string | null>
  checkUpdates(): Promise<{ version: string; url: string } | null>
  openExternal(url: string): Promise<void>
}

export const API_METHODS: (keyof BrsApi)[] = [
  'login', 'logout', 'getSettings', 'getAuthState', 'saveAuthState', 'getClasses', 'getSubjects', 'getPeriods', 'loadJournal', 'getStore', 'setOverride',
  'setBonus', 'saveCsv', 'checkUpdates', 'openExternal'
]

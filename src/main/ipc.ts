import { BrowserWindow, dialog, ipcMain } from 'electron'
import { writeFileSync } from 'node:fs'
import type { BonusRow, LocalAuthState, Period, Profile, TaskType } from '@core/models'
import { API_METHODS, type BrsApi } from '@shared/api'
import type { AppConfig } from './config'
import type { JournalProvider } from './providers/types'
import type { Store } from './storage'

/** Wire the BrsApi methods to ipcMain. Errors are returned as {ok:false,error} so the message survives IPC. */
export function registerIpc(cfg: AppConfig, provider: JournalProvider, store: Store, getWindow: () => BrowserWindow | null) {
  const impl: BrsApi = {
    async login(username, password, profile: Profile) {
      const configurable = provider as JournalProvider & { configure?: (options: Record<string, unknown>) => void }
      configurable.configure?.({
        baseUrl: profile.journalUrl,
        allowSelfSignedCertificates: profile.allowSelfSignedCertificates === true,
        journalTypeLabels: profile.journalTypeLabels ?? {}
      })
      const res = await provider.login(username, password)
      return { ...(res ?? {}), username, displayName: username }
    },
    logout: () => provider.logout(),
    getSettings: async () => ({
      homeworkMode: cfg.homeworkMode, labsMinFraction: cfg.labsMinFraction, classifierRules: cfg.classifierRules
    }),
    getAuthState: async () => store.authState({
      profiles: [{ id: 'default', name: 'Основной', journalUrl: String(cfg.providerOptions.baseUrl ?? ''),
        homeworkMode: cfg.homeworkMode, labsMinFraction: cfg.labsMinFraction, classifierRules: cfg.classifierRules }],
      selectedProfileId: 'default', credentials: [], rememberMe: false, dontSignOut: false
    }),
    saveAuthState: async (state: LocalAuthState) => store.setAuthState(state),
    getClasses: () => provider.getClasses(),
    getSubjects: (classId: string) => provider.getSubjects(classId),
    getPeriods: (classId: string, subjectId: string) => provider.getPeriods(classId, subjectId),
    loadJournal: (classId: string, subjectId: string, period: Period) => provider.loadJournal(classId, subjectId, period),
    async getStore(classId: string, periodId: string) {
      return store.snapshot(classId, periodId)
    },
    async setOverride(classId: string, periodId: string, lessonId: string, type: TaskType | null) {
      store.setOverride(classId, lessonId, type)
      return store.snapshot(classId, periodId)
    },
    async setBonus(classId: string, periodId: string, studentId: string, rows: BonusRow[]) {
      store.setBonus(classId, periodId, studentId, rows)
      return store.snapshot(classId, periodId)
    },
    async saveCsv(defaultName: string, content: string) {
      const win = getWindow()
      const opts = { defaultPath: defaultName, filters: [{ name: 'CSV', extensions: ['csv'] }] }
      const { canceled, filePath } = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts)
      if (canceled || !filePath) return null
      writeFileSync(filePath, '\uFEFF' + content, 'utf-8') // BOM so Excel reads UTF-8
      return filePath
    }
  }

  for (const name of API_METHODS) {
    ipcMain.handle('brs:' + name, async (_event, ...args: unknown[]) => {
      try {
        const fn = impl[name] as (...a: unknown[]) => Promise<unknown>
        return { ok: true, data: await fn(...args) }
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) }
      }
    })
  }
}

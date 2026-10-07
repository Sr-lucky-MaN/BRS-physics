import { BrowserWindow, dialog, ipcMain } from 'electron'
import { writeFileSync } from 'node:fs'
import type { BonusRow, Period, TaskType } from '@core/models'
import { API_METHODS, type BrsApi } from '@shared/api'
import type { AppConfig } from './config'
import type { JournalProvider } from './providers/types'
import type { Store } from './storage'

/** Wire the BrsApi methods to ipcMain. Errors are returned as {ok:false,error} so the message survives IPC. */
export function registerIpc(cfg: AppConfig, provider: JournalProvider, store: Store, getWindow: () => BrowserWindow | null) {
  const impl: BrsApi = {
    async login(username, password) {
      const res = await provider.login(username, password)
      return { username, displayName: (res && res.displayName) || username }
    },
    logout: () => provider.logout(),
    getSettings: async () => ({
      homeworkMode: cfg.homeworkMode, labsMinFraction: cfg.labsMinFraction, classifierRules: cfg.classifierRules
    }),
    getClasses: () => provider.getClasses(),
    getPeriods: (classId: string) => provider.getPeriods(classId),
    async loadJournal(classId: string, period: Period) {
      const [students, lessons, entries] = await Promise.all([
        provider.getStudents(classId), provider.getLessons(classId, period), provider.getEntries(classId, period)
      ])
      return { students, lessons, entries }
    },
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

/** Local JSON store for what the journal doesn't have: manual bonus points and per-lesson type overrides. */
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import type { BonusRow, LocalAuthState, StoreSnapshot, TaskType } from '@core/models'

interface Data {
  overrides: Record<string, Record<string, TaskType>> // classId -> lessonId -> type
  bonus: Record<string, Record<string, BonusRow[]>> // `${classId}|${periodId}` -> studentId -> rows
  auth?: LocalAuthState
}

export class Store {
  private data: Data = { overrides: {}, bonus: {} }

  constructor(private file: string) {
    if (existsSync(file)) {
      try {
        this.data = { overrides: {}, bonus: {}, ...JSON.parse(readFileSync(file, 'utf-8')) }
      } catch {
        renameSync(file, file + '.corrupt-' + Date.now()) // keep the broken file, start fresh
      }
    }
  }

  private save() {
    const tmp = this.file + '.tmp'
    writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf-8')
    renameSync(tmp, this.file)
  }

  authState(fallback: LocalAuthState): LocalAuthState {
    return this.data.auth ? JSON.parse(JSON.stringify(this.data.auth)) : JSON.parse(JSON.stringify(fallback))
  }

  setAuthState(state: LocalAuthState): LocalAuthState {
    this.data.auth = JSON.parse(JSON.stringify(state))
    this.save()
    return this.authState(state)
  }

  snapshot(classId: string, periodId: string): StoreSnapshot {
    return {
      overrides: { ...(this.data.overrides[classId] ?? {}) },
      bonus: JSON.parse(JSON.stringify(this.data.bonus[`${classId}|${periodId}`] ?? {}))
    }
  }

  setOverride(classId: string, lessonId: string, type: TaskType | null) {
    const m = (this.data.overrides[classId] ??= {})
    if (type === null) delete m[lessonId]
    else m[lessonId] = type
    this.save()
  }

  setBonus(classId: string, periodId: string, studentId: string, rows: BonusRow[]) {
    const m = (this.data.bonus[`${classId}|${periodId}`] ??= {})
    if (rows.length) m[studentId] = rows
    else delete m[studentId]
    this.save()
  }
}

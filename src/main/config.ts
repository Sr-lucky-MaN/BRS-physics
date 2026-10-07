import { app } from 'electron'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AppSettings } from '@core/models'

export interface AppConfig extends AppSettings {
  provider: string
  providerOptions: Record<string, unknown>
}

export const DEFAULT_CONFIG: AppConfig = {
  provider: 'mock',
  providerOptions: {},
  // How a homework mark becomes "% done": 'percent' (mark IS the %), 'ten_point' (10 -> 100%), 'binary' (any mark = done)
  homeworkMode: 'percent',
  // Lab rule "4/5 done": minimum share of held labs a student must have done
  labsMinFraction: 0.8,
  // Replace the default regexes for a task type, e.g. { "homework": ["домашн", "на дом"] }
  classifierRules: {}
}

/** First existing of: $BRS_CONFIG, <userData>/config.json (survives updates), bundled config.json. */
export function loadConfig(): AppConfig {
  const bundled = app.isPackaged ? join(process.resourcesPath, 'config.json') : join(app.getAppPath(), 'config.json')
  const candidates = [process.env.BRS_CONFIG, join(app.getPath('userData'), 'config.json'), bundled]
  for (const c of candidates) {
    if (c && existsSync(c)) return { ...DEFAULT_CONFIG, ...JSON.parse(readFileSync(c, 'utf-8')) }
  }
  return DEFAULT_CONFIG
}

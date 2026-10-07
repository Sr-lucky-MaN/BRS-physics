import { app } from 'electron'
import { createRequire } from 'node:module'
import { isAbsolute, join, resolve } from 'node:path'
import type { AppConfig } from '../config'
import { JournalApiProvider } from './journal'
import { MockProvider } from './mock'
import type { JournalProvider, ProviderFactory } from './types'

/** Built-in providers. Add yours here if you prefer several. config.json: "provider": "<name>". */
const REGISTRY: Record<string, ProviderFactory> = {
  mock: () => new MockProvider(),
  journal: (options) => new JournalApiProvider(options)
}

export function createProvider(cfg: AppConfig): JournalProvider {
  const factory = REGISTRY[cfg.provider]
  if (factory) return factory(cfg.providerOptions)

  // Alternatively: "provider": "C:\\path\\to\\my-provider.js" - a plain CommonJS file that exports
  // a class (module.exports = class ...) or { default: class ... } taking (options) in its constructor.
  if (/\.c?js$/i.test(cfg.provider)) {
    const file = isAbsolute(cfg.provider) ? cfg.provider : resolve(app.getPath('userData'), cfg.provider)
    const nodeRequire = createRequire(join(app.getAppPath(), 'package.json'))
    const mod = nodeRequire(file)
    const Cls = mod.default ?? mod.Provider ?? mod
    return new Cls(cfg.providerOptions) as JournalProvider
  }
  throw new Error(`Неизвестный провайдер "${cfg.provider}". Доступны: ${Object.keys(REGISTRY).join(', ')} или путь к .js файлу.`)
}

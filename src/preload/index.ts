import { contextBridge, ipcRenderer } from 'electron'
import { API_METHODS, type BrsApi } from '@shared/api'

type Res = { ok: true; data: unknown } | { ok: false; error: string }

const api = Object.fromEntries(
  API_METHODS.map((name) => [
    name,
    async (...args: unknown[]) => {
      const res = (await ipcRenderer.invoke('brs:' + name, ...args)) as Res
      if (!res.ok) throw new Error(res.error)
      return res.data
    }
  ])
) as unknown as BrsApi

contextBridge.exposeInMainWorld('api', api)

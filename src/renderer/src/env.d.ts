import type { BrsApi } from '@shared/api'

declare global {
  interface Window {
    api: BrsApi
  }
}
export {}

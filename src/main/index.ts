import { BrowserWindow, Menu, app, session, shell } from 'electron'
import { join } from 'node:path'
import { loadConfig } from './config'
import { registerIpc } from './ipc'
import { createProvider } from './providers'
import { Store } from './storage'

let win: BrowserWindow | null = null

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 860,
    minWidth: 1000,
    minHeight: 600,
    show: false,
    title: 'БРС по физике',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  win.once('ready-to-show', () => win?.show())
  win.on('closed', () => { win = null })

  // The UI never needs to open external pages or navigate away.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(process.env.ELECTRON_RENDERER_URL ?? 'file://')) e.preventDefault()
  })

  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void win.loadFile(join(__dirname, '../renderer/index.html'))
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus() }
  })

  app.whenReady().then(() => {
    if (app.isPackaged) {
      Menu.setApplicationMenu(null)
      // Strict CSP in production only (the Vite dev server needs inline scripts for hot reload).
      session.defaultSession.webRequest.onHeadersReceived((details, cb) => {
        cb({ responseHeaders: { ...details.responseHeaders,
          'Content-Security-Policy': ["default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:"] } })
      })
    }
    const cfg = loadConfig()
    const store = new Store(join(app.getPath('userData'), 'brs-data.json'))
    registerIpc(cfg, createProvider(cfg), store, () => win)
    createWindow()
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
  })

  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
}

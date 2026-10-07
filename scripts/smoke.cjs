// Headless smoke test:  xvfb-run -a npx electron --no-sandbox scripts/smoke.cjs   (after `npm run build`)
const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const path = require('path')
app.setPath('userData', fs.mkdtempSync('/tmp/brs-smoke-'))
require(path.join(__dirname, '../out/main/index.js'))

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const out = []
const log = (...a) => { console.log(...a) }

app.whenReady().then(async () => {
  let win
  while (!(win = BrowserWindow.getAllWindows()[0])) await sleep(100)
  const js = (code) => win.webContents.executeJavaScript(code)
  const shot = async (name) => fs.writeFileSync(`/tmp/${name}.png`, (await win.webContents.capturePage()).toPNG())
  win.webContents.on('console-message', (_e, level, msg) => { if (level >= 2) log('[renderer error]', msg) })
  await sleep(1500)
  log('api exposed:', await js('typeof window.api?.login'))

  // wrong password first
  const setVal = (sel, v) => js(`(() => { const el = document.querySelector(${JSON.stringify(sel)});
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el, ${JSON.stringify(v)});
    el.dispatchEvent(new Event('input', {bubbles:true})) })()`)
  await setVal('input:not([type])', 'teacher'); await setVal('input[type=password]', 'bad')
  await js(`document.querySelector('button.primary').click()`); await sleep(500)
  log('login error shown:', await js(`document.querySelector('.error')?.textContent`))
  await setVal('input[type=password]', 'teacher')
  await js(`document.querySelector('button.primary').click()`); await sleep(1500)

  const table = async () => js(`[...document.querySelectorAll('table.results tr')].slice(0,3).map(r => [...r.children].map(c => c.textContent).join(' | ')).join('\\n')`)
  log('--- 9A ---\n' + await table()); log(await js(`document.querySelector('.status').textContent`))
  await js(`document.querySelector('table.results tbody tr').click()`); await sleep(300)
  await shot('electron-9a')

  // switch to 11B
  await js(`(() => { const s = document.querySelector('.toolbar select'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s, '11b'); s.dispatchEvent(new Event('change',{bubbles:true})) })()`)
  await sleep(1500)
  log('--- 11B ---\n' + await table()); log(await js(`document.querySelector('.status').textContent`))
  await js(`document.querySelector('table.results tbody tr').click()`); await sleep(300)
  await shot('electron-11b')
  app.exit(0)
})
setTimeout(() => { console.log('TIMEOUT'); app.exit(1) }, 60000)

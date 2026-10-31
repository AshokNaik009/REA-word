import { spawn } from 'node:child_process'
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { chromium, webkit } from '@playwright/test'

const root = resolve(import.meta.dirname, '..')
const folder = await mkdtemp(join(tmpdir(), 'wordcraft-native-'))
const config = JSON.parse(await readFile(join(root, 'neutralino.config.json'), 'utf8'))
const bundledApp = process.env.WORDCRAFT_BUNDLED_APP === '1'
const nativeWindow = bundledApp || process.env.WORDCRAFT_NATIVE_WINDOW === '1'
config.applicationId = `dev.wordcraft.smoke.${randomUUID().replaceAll('-', '')}`
config.dataLocation = 'app'
config.storageLocation = nativeWindow ? 'app' : 'system'
config.modes.window.useSavedState = false
await cp(join(root, 'dist'), join(folder, 'dist'), { recursive: true })
await mkdir(join(folder, '.tmp'), { recursive: true })
await writeFile(join(folder, 'neutralino.config.json'), JSON.stringify(config))
const platform = { darwin: 'mac', linux: 'linux', win32: 'win' }[process.platform]
const binary = bundledApp
  ? join(root, `release/macos-${config.version}/Wordcraft Desktop.app/Contents/MacOS/wordcraft-desktop`)
  : join(root, `bin/neutralino-${platform}_${process.arch}${process.platform === 'win32' ? '.exe' : ''}`)
const host = spawn(binary, ['--path=.', ...bundledApp ? [] : ['--load-dir-res'], nativeWindow ? '--mode=window' : '--mode=cloud', '--window-hidden=true', '--export-auth-info', '--data-location=app', `--storage-location=${nativeWindow ? 'app' : 'system'}`, '--window-use-saved-state=false'], { cwd: folder, stdio: 'ignore' })
if (nativeWindow) {
  try {
    let snapshot
    for (let attempt = 0; attempt < 150; attempt++) {
      try { snapshot = JSON.parse(await readFile(join(folder, '.storage/workspace-a.neustorage'), 'utf8')); break } catch {}
      if (host.exitCode !== null) throw new Error(`Native WebView exited with ${host.exitCode}`)
      await delay(100)
    }
    assert.equal(snapshot?.documents?.[0]?.title, 'The thoughtful workspace', 'Actual system WebView must bootstrap and save a fresh workspace')
    console.log(`PASS: ${bundledApp ? 'packaged macOS app' : 'actual hidden system WebView'} bootstraps a fresh workspace and autosaves using native storage.`)
  } finally { host.kill('SIGTERM') }
  process.exit(0)
}
let browser
try {
  let auth
  for (let attempt = 0; attempt < 100; attempt++) {
    try { auth = JSON.parse(await readFile(join(folder, '.tmp/auth_info.json'), 'utf8')); break } catch {}
    if (host.exitCode !== null) throw new Error(`Native host exited with ${host.exitCode}`)
    await delay(100)
  }
  if (!auth) throw new Error('Native host did not become ready')
  const url = `http://127.0.0.1:${auth.nlPort}`
  browser = process.env.WORDCRAFT_WEBKIT ? await webkit.launch({ headless: true }) : await chromium.launch({ channel: 'chrome', headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  await context.addInitScript(({ port, token, applicationId, os }) => {
    Object.assign(window, { NL_PORT: port, NL_TOKEN: token, NL_APPID: applicationId, NL_OS: os, NL_EXTENABLED: false, NL_GINJECTED: true, NL_MODE: 'cloud', NL_ARGS: [], NL_CMETHODS: [] })
  }, { port: auth.nlPort, token: auth.nlToken, applicationId: config.applicationId, os: process.platform === 'darwin' ? 'Darwin' : process.platform === 'win32' ? 'Windows' : 'Linux' })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(url)
  assert.equal(await page.evaluate(() => typeof window.NL_OS), 'string', 'Smoke test must use native APIs, not browser storage')
  const title = page.getByRole('textbox', { name: 'Document title' })
  const editor = page.getByRole('textbox', { name: 'Document editor' })
  try { await editor.waitFor({ timeout: 8000 }) }
  catch { throw new Error(`Packaged first-launch failure: ${await page.locator('.loading-screen').textContent()}`) }
  await title.fill('Native storage smoke test')
  await editor.fill('These words live in native storage.')
  await page.locator('.save-indicator.saved').waitFor()
  await page.reload()
  await editor.waitFor()
  assert.equal(await title.inputValue(), 'Native storage smoke test')
  assert.equal(await editor.textContent(), 'These words live in native storage.')
  assert.deepEqual(errors, [])
  console.log('PASS: built UI connects to the real Neutralino host and restores native saves after reload.')
  console.log('Native dialogs and system-WebView rendering still require manual platform testing.')
} finally {
  await browser?.close()
  host.kill('SIGTERM')
}

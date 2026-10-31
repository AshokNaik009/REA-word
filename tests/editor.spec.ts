import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import mammoth from 'mammoth'

const editor = (page: Page) => page.getByRole('textbox', { name: 'Document editor' })
const saved = (page: Page) => expect(page.getByText('All changes saved locally', { exact: true })).toBeVisible()
async function newDocument(page: Page, text: string, title = 'Test document') {
  await page.getByRole('button', { name: 'New document', exact: true }).click()
  await page.getByRole('textbox', { name: 'Document title' }).fill(title)
  await editor(page).fill(text)
}
async function exportDocument(page: Page, format: 'wordcraft' | 'docx') {
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  await page.locator(`input[name="format"][value="${format}"]`).check()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: format === 'wordcraft' ? 'Export document' : 'Export .docx', exact: true }).click()
  return await download
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(editor(page)).toBeVisible()
  await saved(page)
})

test('edits, formats, undoes and redoes text', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await newDocument(page, 'A better first draft.')
  await editor(page).press('Meta+a')
  await page.getByRole('button', { name: 'Bold (Cmd/Ctrl+B)', exact: true }).click()
  await expect(editor(page).locator('strong')).toHaveText('A better first draft.')
  await page.getByRole('button', { name: 'Undo (Cmd/Ctrl+Z)', exact: true }).click()
  await expect(editor(page).locator('strong')).toHaveCount(0)
  await page.getByRole('button', { name: 'Redo (Cmd/Ctrl+Shift+Z)', exact: true }).click()
  await expect(editor(page).locator('strong')).toHaveText('A better first draft.')
  await saved(page)
  await expect(page.getByText('4 words', { exact: true })).toBeVisible()
  expect(errors).toEqual([])
})

test('autosaves, restores after reload and switches between documents', async ({ page }) => {
  await newDocument(page, 'Keep these words.', 'My saved draft')
  await saved(page)
  await page.reload()
  await expect(editor(page)).toHaveText('Keep these words.')
  await expect(page.getByRole('textbox', { name: 'Document title' })).toHaveValue('My saved draft')
  await newDocument(page, 'Another thought.', 'Second draft')
  await saved(page)
  await page.getByRole('button', { name: 'My saved draft', exact: true }).click()
  await expect(editor(page)).toHaveText('Keep these words.')
  await page.getByRole('button', { name: 'Second draft', exact: true }).click()
  await expect(editor(page)).toHaveText('Another thought.')
})

test('finds and replaces literal text, including an empty replacement', async ({ page }) => {
  await newDocument(page, 'Hello world. Hello again.')
  await page.getByRole('button', { name: 'Find & replace', exact: true }).click()
  await page.getByLabel('Find in document').fill('hello')
  await expect(page.getByText('2 matches', { exact: true })).toBeVisible()
  await page.getByLabel('Replace with').fill('Goodbye')
  await page.getByRole('button', { name: 'Replace all', exact: true }).click()
  await expect(editor(page)).toHaveText('Goodbye world. Goodbye again.')
  await page.getByLabel('Find in document').fill('Goodbye ')
  await page.getByLabel('Replace with').fill('')
  await page.getByRole('button', { name: 'Replace all', exact: true }).click()
  await expect(editor(page)).toHaveText('world. again.')
})

test('inserts and edits a table', async ({ page }) => {
  await newDocument(page, 'Table notes.')
  await editor(page).press('Meta+End')
  await editor(page).press('Enter')
  await page.getByRole('button', { name: 'Insert', exact: true }).click()
  await page.getByRole('button', { name: 'Table 3 x 3', exact: true }).click()
  await expect(editor(page).locator('table tr')).toHaveCount(3)
  await editor(page).locator('table th').first().click()
  await page.keyboard.insertText('Topic')
  await page.getByRole('button', { name: 'Add row', exact: true }).click()
  await expect(editor(page).locator('table tr')).toHaveCount(4)
  await page.getByRole('button', { name: 'Add column', exact: true }).click()
  await expect(editor(page).locator('table tr').first().locator('th,td')).toHaveCount(4)
  await saved(page)
  await page.reload()
  await expect(editor(page).locator('table tr')).toHaveCount(4)
  await expect(editor(page)).toContainText('Topic')
})

test('exports and imports a native document without overwriting the source', async ({ page }) => {
  await newDocument(page, 'A portable little idea.', 'Portable draft')
  const download = await exportDocument(page, 'wordcraft')
  const file = JSON.parse(await readFile((await download.path())!, 'utf8'))
  expect(file.title).toBe('Portable draft')
  expect(file.content.content[0].content[0].text).toBe('A portable little idea.')
  await page.getByLabel('Open document file', { exact: true }).setInputFiles({ name: 'Portable draft.wordcraft', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) })
  await expect(page.getByRole('status')).toContainText('Opened Portable draft.wordcraft')
  await expect(editor(page)).toHaveText('A portable little idea.')
  await expect(page.locator('.document-list .document-item').filter({ hasText: 'Portable draft' })).toHaveCount(2)
})

test('exchanges real DOCX files with an explicit fidelity warning', async ({ page }) => {
  const download = await exportDocument(page, 'docx')
  const bytes = await readFile((await download.path())!)
  expect(bytes.subarray(0, 2).toString()).toBe('PK')
  const result = await mammoth.extractRawText({ buffer: bytes })
  expect(result.value).toContain('A little room for big ideas.')
  expect(result.value).toContain('Make room for the messy middle')
  await page.getByLabel('Open document file', { exact: true }).setInputFiles({ name: 'roundtrip.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: bytes })
  await expect(page.getByRole('status')).toContainText('DOCX imported as an editable copy')
  await expect(editor(page)).toContainText('A little room for big ideas.')
  await expect(editor(page).locator('h1')).toHaveText('A little room for big ideas.')
})

test('sanitizes untrusted HTML without fetching remote assets', async ({ page }) => {
  const requests: string[] = []
  page.on('request', request => { if (request.url().includes('tracker.example')) requests.push(request.url()) })
  await page.getByLabel('Open document file', { exact: true }).setInputFiles({
    name: 'safe.html', mimeType: 'text/html',
    buffer: Buffer.from('<h1>Imported safely</h1><p onclick="alert(1)">Hello<script>window.bad = 1</script></p><img src="https://tracker.example/a.png"><a href="javascript:alert(1)">Bad link</a><p style="background:url(https://tracker.example/b.png)">No tracking</p>'),
  })
  await expect(editor(page)).toContainText('Imported safely')
  await expect(editor(page).locator('script, img, [onclick]')).toHaveCount(0)
  expect(await page.evaluate(() => 'bad' in window)).toBe(false)
  expect(requests).toEqual([])
})

test('preserves an emergency snapshot when reloading before the debounce', async ({ page }) => {
  await newDocument(page, 'Emergency snapshot.', 'Recovery draft')
  page.on('dialog', dialog => dialog.accept())
  const cached = await page.evaluate(() => JSON.parse(localStorage.getItem('wordcraft-recovery-v1') ?? 'null'))
  expect(cached.title).toBe('Recovery draft')
  await page.reload()
  await expect(editor(page)).toHaveText('Emergency snapshot.')
  await saved(page)
})

test('retains writing and blocks document switches when storage fails', async ({ page }) => {
  await page.evaluate(() => {
    IDBObjectStore.prototype.put = function () { throw new DOMException('Quota exceeded', 'QuotaExceededError') }
  })
  await editor(page).fill('These words must not be lost.')
  await page.getByRole('button', { name: 'New document', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Could not save to this device')
  await expect(editor(page)).toHaveText('These words must not be lost.')
  const download = await exportDocument(page, 'wordcraft')
  const backup = JSON.parse(await readFile((await download.path())!, 'utf8'))
  expect(backup.content.content[0].content[0].text).toBe('These words must not be lost.')
})

test('applies layout and focus mode and stays printable', async ({ page }) => {
  await page.getByRole('button', { name: 'Layout', exact: true }).click()
  await page.getByLabel('Page orientation').selectOption('landscape')
  await page.getByLabel('Page margins').selectOption('narrow')
  await saved(page)
  const download = await exportDocument(page, 'wordcraft')
  const file = JSON.parse(await readFile((await download.path())!, 'utf8'))
  expect(file.page).toEqual({ size: 'A4', orientation: 'landscape', margins: 'narrow' })
  await page.locator('.canvas-topline').getByRole('button', { name: 'Focus', exact: true }).click()
  await expect(page.locator('.titlebar')).toBeHidden()
  await page.getByRole('button', { name: 'Exit focus esc' }).click()
  await expect(page.locator('.titlebar')).toBeVisible()
  await page.emulateMedia({ media: 'print' })
  await expect(page.locator('.titlebar')).toBeHidden()
  await expect(editor(page)).toBeVisible()
})

test('shows the intended desktop layout', async ({ page }) => {
  await page.screenshot({ path: 'test-results/wordcraft-desktop.png', animations: 'disabled' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

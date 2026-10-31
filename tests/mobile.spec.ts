import { expect, test } from '@playwright/test'

test('loads, edits, opens navigation and exports on a narrow viewport', async ({ page }) => {
  await page.goto('/')
  const editor = page.getByRole('textbox', { name: 'Document editor' })
  await expect(editor).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.getByRole('textbox', { name: 'Document title' }).fill('A mobile thought')
  await editor.fill('Good words fit in small spaces.')
  await expect(page.locator('.save-indicator')).toHaveAttribute('title', 'Saved on this device')
  await page.getByRole('button', { name: 'Show navigation' }).click()
  await expect(page.getByRole('complementary', { name: 'Document navigation' })).toBeVisible()
  await page.getByRole('button', { name: 'Close navigation' }).click()
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Export document', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Close dialog' }).click()
  await page.screenshot({ path: `test-results/wordcraft-${test.info().project.name}.png`, animations: 'disabled' })
})

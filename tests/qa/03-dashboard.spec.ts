import { test, expect, Page } from '@playwright/test'

// Shared login helper
async function login(page: Page) {
  const email = process.env.QA_EMAIL || ''
  const password = process.env.QA_PASSWORD || ''
  if (!email || !password) {
    test.skip(true, 'QA_EMAIL and QA_PASSWORD env vars not set')
    return
  }
  await page.goto('/login')
  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', password)
  await page.click('button[type="submit"]')
  await page.waitForURL(/dashboard|onboarding/, { timeout: 10000 })
}

test.describe('Dashboard', () => {
  test('dashboard loads after login', async ({ page }) => {
    await login(page)
    await page.goto('/dashboard')
    await page.screenshot({ path: 'tests/qa/results/dashboard.png', fullPage: true })
    // Sidebar should be visible
    await expect(page.locator('nav, aside, [data-testid="sidebar"]').first()).toBeVisible()
  })

  test('segment switcher visible (Individual / Corporate)', async ({ page }) => {
    await login(page)
    await page.goto('/dashboard')
    const switcher = page.locator('text=Individual, text=Corporate').first()
    await expect(switcher).toBeVisible()
  })

  test('create post page loads', async ({ page }) => {
    await login(page)
    await page.goto('/dashboard/create')
    await page.screenshot({ path: 'tests/qa/results/create.png', fullPage: true })
    // Topic input should exist
    await expect(page.locator('textarea, input[placeholder*="topic" i], input[placeholder*="what" i]').first()).toBeVisible()
  })

  test('schedule page loads with calendar', async ({ page }) => {
    await login(page)
    await page.goto('/dashboard/schedule')
    await page.screenshot({ path: 'tests/qa/results/schedule.png', fullPage: true })
    await expect(page.locator('text=Schedule, text=Calendar').first()).toBeVisible()
  })

  test('history page loads', async ({ page }) => {
    await login(page)
    await page.goto('/dashboard/history')
    await page.screenshot({ path: 'tests/qa/results/history.png', fullPage: true })
    await expect(page).toHaveURL(/history/)
  })

  test('settings page loads with tabs', async ({ page }) => {
    await login(page)
    await page.goto('/dashboard/settings')
    await page.screenshot({ path: 'tests/qa/results/settings.png', fullPage: true })
    await expect(page.locator('text=Identity, text=Voice, text=Audience').first()).toBeVisible()
  })

  test('memory page loads', async ({ page }) => {
    await login(page)
    await page.goto('/dashboard/memory')
    await page.screenshot({ path: 'tests/qa/results/memory.png', fullPage: true })
    await expect(page).toHaveURL(/memory/)
  })
})

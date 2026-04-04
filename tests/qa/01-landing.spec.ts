import { test, expect } from '@playwright/test'

test.describe('Landing Page', () => {
  test('loads and shows key UI', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/LinkAuto|LinkedIn/i)
    await page.screenshot({ path: 'tests/qa/results/landing.png', fullPage: true })
  })

  test('login link is visible', async ({ page }) => {
    await page.goto('/')
    const loginLink = page.locator('a[href*="login"], button:has-text("Login"), button:has-text("Sign in")')
    await expect(loginLink.first()).toBeVisible()
  })
})

import { test, expect } from '@playwright/test'

test.describe('Auth Pages', () => {
  test('login page loads', async ({ page }) => {
    await page.goto('/login')
    await page.screenshot({ path: 'tests/qa/results/login.png', fullPage: true })
    await expect(page.locator('input[type="email"], input[name="email"]').first()).toBeVisible()
    await expect(page.locator('input[type="password"]').first()).toBeVisible()
  })

  test('signup page loads', async ({ page }) => {
    await page.goto('/signup')
    await page.screenshot({ path: 'tests/qa/results/signup.png', fullPage: true })
    await expect(page.locator('input[type="email"], input[name="email"]').first()).toBeVisible()
  })

  test('unauthenticated dashboard redirects to login', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/login|signin|auth/i)
  })
})

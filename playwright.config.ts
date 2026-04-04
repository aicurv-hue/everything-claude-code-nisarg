import { defineConfig, devices } from '@playwright/test'

const BASE_URL = process.env.QA_URL || 'http://localhost:3000'

export default defineConfig({
  testDir: './tests/qa',
  timeout: 30000,
  retries: 1,
  reporter: [['list'], ['html', { outputFolder: 'tests/qa/report', open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    screenshot: 'on',
    video: 'off',
    headless: true,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  outputDir: 'tests/qa/results',
})

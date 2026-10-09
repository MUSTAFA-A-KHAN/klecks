import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './tests',
    testMatch: '*.spec.ts',
    workers: 1,
    use: {
        baseURL: 'http://127.0.0.1:4173/klecks/',
        channel: process.env.PLAYWRIGHT_CHANNEL || 'chromium',
        viewport: { width: 1280, height: 900 },
        screenshot: 'only-on-failure',
    },
    webServer: {
        command: 'node tests/serve-built.mjs',
        url: 'http://127.0.0.1:4173/klecks/',
        reuseExistingServer: false,
    },
});

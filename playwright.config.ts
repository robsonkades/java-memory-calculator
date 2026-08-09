import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './e2e',
    timeout: 60_000,
    use: {
        baseURL: 'http://localhost:3100',
    },
    projects: [
        { name: 'chromium', use: { browserName: 'chromium' } },
    ],
    webServer: {
        command: 'npm run dev -- -p 3100',
        url: 'http://localhost:3100',
        reuseExistingServer: false,
        timeout: 180_000,
    },
});

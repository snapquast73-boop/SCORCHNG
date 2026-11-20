import { defineConfig } from '@playwright/test';
export default defineConfig({
 testDir: './tools/browser',
 timeout: 30000,
 use: { baseURL: 'http://127.0.0.1:8001/SCORCHNG/', screenshot: 'only-on-failure' },
 reporter: [['list'], ['json', { outputFile: 'test-results/browser.json' }]],
 webServer: { command: 'node tools/preview.mjs', url: 'http://127.0.0.1:8001/SCORCHNG/', reuseExistingServer: !process.env.CI }
});

import path from 'node:path';

import { playwright } from '@vitest/browser-playwright';
import { defineConfig, defineProject } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      exclude: ['**/*.d.ts', '**/*.{test,spec}.{ts,tsx}', '**/*.{component,browser}.test.{ts,tsx}'],
    },
  },
});

export const unit = defineProject({
  test: {
    name: 'unit',
    environment: 'node',
    exclude: ['**/*.component.test.{ts,tsx}', '**/*.browser.test.{ts,tsx}', '**/node_modules/**'],
  },
});

export const component = defineProject({
  test: {
    name: 'component',
    environment: 'jsdom',
  },
});

export function browser(mode: string) {
  return defineProject({
    test: {
      name: 'browser',
      browser: {
        enabled: true,
        headless: true,
        provider: playwright({
          actionTimeout: 10_000,
          launchOptions: {
            executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
            slowMo: mode === 'preview' ? 300 : 0,
          },
        }),
        instances: [{ browser: 'chromium' }],
        expect: {
          toMatchScreenshot: {
            resolveScreenshotPath: ({ arg, browserName, ext, platform, root, testFileName }) => {
              const filename = `${arg}-${browserName}-${platform}${ext}`;

              return path.join(root, 'tests/screenshots', testFileName, filename);
            },
          },
        },
      },
    },
  });
}

import { test, expect } from '@playwright/test';
import * as axe from 'axe-core';

const PUBLIC_ROUTES = ['/', '/login'] as const;

test.describe('WCAG 2.1 AA public surfaces', () => {
  for (const route of PUBLIC_ROUTES) {
    test(`has no automated accessibility violations: ${route} @a11y`, async ({ page }) => {
      await page.goto(route, { waitUntil: 'networkidle' });
      await page.addScriptTag({ content: axe.source });

      const results = await page.evaluate(async () => {
        const browserWindow = window as unknown as Window & {
          axe: {
            run: (
              context: Document,
              options: { runOnly: { type: 'tag'; values: string[] } },
            ) => Promise<{ violations: Array<{ id: string; impact?: string | null }> }>;
          };
        };

        return browserWindow.axe.run(document, {
          runOnly: {
            type: 'tag',
            values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'],
          },
        });
      });

      expect(results.violations, JSON.stringify(results.violations)).toEqual([]);
    });
  }
});

import { chromium } from 'playwright';
import axe from 'axe-core';

const urls = [
  'https://app.bawain.my.id',
  'https://app.bawain.my.id/login',
];
const tags = [
  'wcag2a',
  'wcag2aa',
  'wcag21aa',
  'wcag22aa',
  'best-practice',
];

const browser = await chromium.launch({ headless: true });
let failed = false;

try {
  for (const url of urls) {
    const page = await browser.newPage();

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await page.waitForTimeout(500);
      await page.addScriptTag({ content: axe.source });

      const results = await page.evaluate(async (runTags) => {
        return window.axe.run(document, {
          runOnly: { type: 'tag', values: runTags },
        });
      }, tags);

      if (results.violations.length > 0) {
        failed = true;
        console.error(`axe violations on ${url}:`);
        console.error(JSON.stringify(results.violations, null, 2));
      } else {
        console.log(`axe passed: ${url}`);
      }
    } catch (error) {
      failed = true;
      console.error(`axe scan failed on ${url}:`, error);
    } finally {
      await page.close();
    }
  }
} finally {
  await browser.close();
}

process.exitCode = failed ? 1 : 0;

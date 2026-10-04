import { resolve } from 'node:path'
import { chromium } from '../../frontend/node_modules/playwright/index.mjs'

const [baseUrl = 'http://127.0.0.1:4173'] = process.argv.slice(2)
const routes = ['/', '/masuk', '/daftar', '/status']
const axePath = resolve('frontend/node_modules/axe-core/axe.min.js')

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ bypassCSP: true })
const page = await context.newPage()
const violations = []

try {
  for (const route of routes) {
    await page.goto(new URL(route, baseUrl).toString(), { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(900)
    await page.addScriptTag({ path: axePath })
    const result = await page.evaluate(async () => window.axe.run(document))
    for (const violation of result.violations) {
      violations.push({
        route,
        id: violation.id,
        impact: violation.impact,
        nodes: violation.nodes.map((node) => ({
          target: node.target,
          html: node.html.slice(0, 240),
          failureSummary: node.failureSummary,
        })),
      })
    }
  }
} finally {
  await context.close()
  await browser.close()
}

if (violations.length > 0) {
  console.error(JSON.stringify({ status: 'FAIL', violations }, null, 2))
  process.exitCode = 1
} else {
  console.log(JSON.stringify({ status: 'PASS', browser: 'chromium', routes, violations: 0 }))
}

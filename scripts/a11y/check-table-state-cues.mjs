#!/usr/bin/env node

/**
 * Shared table row-state contract.
 *
 * The global Customer/Admin styles must preserve non-color row cues when a
 * dense table is hovered, contains focus, or exposes aria-selected state.
 * Page-specific classes can add stronger treatment, but cannot remove the
 * baseline contract from a newly added table.
 */

import fs from 'node:fs'
import path from 'node:path'

const stylesheets = [
  path.resolve('frontend/src/app/globals.css'),
  path.resolve('admin-dashboard/src/index.css'),
]

const requiredSelectors = [
  /table\s+tbody\s+tr\s*:\s*hover\s*>\s*td/,
  /table\s+tbody\s+tr\s*:\s*focus-within/,
  /table\s+tbody\s+tr\s*\[aria-selected=['"]true['"]\]\s*>\s*td:first-child/,
]
const violations = []

for (const stylesheet of stylesheets) {
  const source = fs.readFileSync(stylesheet, 'utf8')
  for (const selector of requiredSelectors) {
    if (!selector.test(source)) violations.push(`${stylesheet}: missing table state selector ${selector}`)
  }
}

if (violations.length) {
  console.error('Table state cue guard failed:')
  for (const violation of violations) console.error(`- ${violation}`)
  process.exit(1)
}

console.log(`Table state cue guard passed: ${stylesheets.length} application stylesheets expose hover, focus-within and aria-selected row cues.`)

#!/usr/bin/env node

/**
 * Disabled controls must stay readable. Opacity below 60% can make labels,
 * status text and icon-only boundaries disappear against themed surfaces.
 */

import fs from 'node:fs'
import path from 'node:path'

const roots = [
  path.resolve('frontend/src'),
  path.resolve('admin-dashboard/src'),
]
const extensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.css'])
const lowOpacityPattern = /\bdisabled:opacity-(?:0|10|20|30|40|50)\b/g
const violations = []

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filePath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      walk(filePath)
      continue
    }
    if (!extensions.has(path.extname(entry.name))) continue

    const source = fs.readFileSync(filePath, 'utf8')
    for (const match of source.matchAll(lowOpacityPattern)) {
      const line = source.slice(0, match.index).split('\n').length
      violations.push(`${filePath}:${line}: ${match[0]} is below the 60% disabled readability baseline`)
    }
  }
}

for (const root of roots) walk(root)

if (violations.length) {
  console.error('Disabled-state readability guard failed:')
  for (const violation of violations) console.error(`- ${violation}`)
  process.exit(1)
}

console.log(`Disabled-state readability guard passed: ${roots.length} application source roots scanned.`)

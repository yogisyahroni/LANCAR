#!/usr/bin/env node

/**
 * Static table semantics guard for the application source roots.
 *
 * Every explicit table header needs a scope so assistive technology can map
 * headers to cells even when a dense table is rendered responsively. Complex
 * row/column groups may use the corresponding group scope; this guard only
 * rejects headers with no declared scope at all.
 */

import fs from 'node:fs'
import path from 'node:path'

const roots = [
  path.resolve('frontend/src'),
  path.resolve('admin-dashboard/src'),
]
const extensions = new Set(['.tsx', '.jsx', '.html'])
const headerPattern = /<th(?=\s|>)([^>]*)>/g
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
    for (const match of source.matchAll(headerPattern)) {
      if (/\bscope\s*=/.test(match[1])) continue
      const line = source.slice(0, match.index).split('\n').length
      violations.push(`${filePath}:${line}: <th> is missing an explicit scope attribute`)
    }
  }
}

for (const root of roots) walk(root)

if (violations.length) {
  console.error('Table semantics guard failed:')
  for (const violation of violations) console.error(`- ${violation}`)
  process.exit(1)
}

console.log(`Table semantics guard passed: ${roots.length} application source roots scanned.`)

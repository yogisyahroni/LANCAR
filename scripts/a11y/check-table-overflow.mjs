#!/usr/bin/env node

/**
 * Dense Admin tables must expose their horizontal scroll region to keyboard
 * users and assistive technology.  A named, focusable region lets a user
 * discover that the table can scroll and move through wide columns without
 * relying on a pointer or an invisible overflow boundary.
 */

import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve('admin-dashboard/src')
const extensions = new Set(['.tsx', '.jsx', '.html'])
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
    for (const match of source.matchAll(/<div\b[^>]*>/g)) {
      const openingTag = match[0]
      if (!/overflow-x-auto/.test(openingTag)) continue

      const line = source.slice(0, match.index).split('\n').length
      if (!/\brole\s*=\s*["']region["']/.test(openingTag)) {
        violations.push(`${filePath}:${line}: overflow-x-auto table region is missing role="region"`)
      }
      if (!/\baria-label\s*=\s*["'][^"']+/.test(openingTag)) {
        violations.push(`${filePath}:${line}: overflow-x-auto table region is missing a non-empty aria-label`)
      }
      if (!/\btabIndex\s*=\s*\{\s*0\s*\}/.test(openingTag)) {
        violations.push(`${filePath}:${line}: overflow-x-auto table region is not keyboard-focusable`)
      }
    }
  }
}

walk(root)

if (violations.length) {
  console.error('Table overflow guard failed:')
  for (const violation of violations) console.error(`- ${violation}`)
  process.exit(1)
}

console.log('Table overflow guard passed: every Admin overflow-x-auto region is named and keyboard-focusable.')

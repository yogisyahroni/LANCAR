#!/usr/bin/env node

/**
 * Status text must not sit on an arbitrary low-opacity tint of the same hue.
 * Use the tested semantic *-surface token for readable success/warning/error/
 * info status content. Decorative tint-only elements without matching status
 * text are intentionally outside this guard.
 */

import fs from 'node:fs'
import path from 'node:path'

const roots = [
  path.resolve('frontend/src'),
  path.resolve('admin-dashboard/src'),
]
const extensions = new Set(['.ts', '.tsx', '.js', '.jsx'])
const tones = ['success', 'warning', 'error', 'info']
const violations = []

function* stringLiterals(source) {
  for (let index = 0; index < source.length; index += 1) {
    const quote = source[index]
    if (!['"', "'", '`'].includes(quote)) continue

    const start = index
    index += 1
    let escaped = false
    for (; index < source.length; index += 1) {
      const character = source[index]
      if (escaped) {
        escaped = false
        continue
      }
      if (character === '\\') {
        escaped = true
        continue
      }
      if (character === quote) {
        yield { value: source.slice(start + 1, index), index: start }
        break
      }
    }
  }
}

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filePath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      walk(filePath)
      continue
    }
    if (!extensions.has(path.extname(entry.name))) continue

    const source = fs.readFileSync(filePath, 'utf8')
    for (const match of stringLiterals(source)) {
      const value = match.value
      if (!/^[\w\s:/%!\[\].-]+$/.test(value)) continue
      for (const tone of tones) {
        const hasTint = new RegExp(`\\bbg-${tone}/(?:[0-9]+)\\b`).test(value)
        const hasStatusText = new RegExp(`\\btext-${tone}\\b`).test(value)
        if (!hasTint || !hasStatusText) continue

        const line = source.slice(0, match.index).split('\n').length
        violations.push(`${filePath}:${line}: ${value} uses low-opacity ${tone} tint with ${tone} status text; use bg-${tone}-surface`)
      }
    }
  }
}

for (const root of roots) walk(root)

if (violations.length) {
  console.error('Tinted status surface guard failed:')
  for (const violation of violations) console.error(`- ${violation}`)
  process.exit(1)
}

console.log(`Tinted status surface guard passed: ${roots.length} source roots scanned.`)

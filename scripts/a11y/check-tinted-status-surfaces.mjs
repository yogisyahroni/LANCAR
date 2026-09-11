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
const cssFiles = [
  path.resolve('frontend/src/app/globals.css'),
  path.resolve('admin-dashboard/src/index.css'),
]
const extensions = new Set(['.ts', '.tsx', '.js', '.jsx'])
const tones = ['success', 'warning', 'error', 'info']
const violations = []
const statusSurfacePairs = new Map(tones.map((tone) => [tone, 0]))

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
        const hasSemanticSurface = new RegExp(`\\bbg-${tone}-surface\\b`).test(value)
        if (hasSemanticSurface && hasStatusText) statusSurfacePairs.set(tone, statusSurfacePairs.get(tone) + 1)
        if (!hasTint || !hasStatusText) continue

        const line = source.slice(0, match.index).split('\n').length
        violations.push(`${filePath}:${line}: ${value} uses low-opacity ${tone} tint with ${tone} status text; use bg-${tone}-surface`)
      }
    }
  }
}

for (const root of roots) walk(root)

function readCssBlock(source, selector) {
  const match = source.match(new RegExp(`(?:^|\\n)\\s*${selector}\\s*\\{([\\s\\S]*?)\\n\\s*\\}`))
  if (!match) throw new Error(`Missing CSS token block: ${selector}`)
  return match[1]
}

function readToken(block, token) {
  const match = block.match(new RegExp(`--token-${token}:\\s*(#[0-9A-Fa-f]{6})\\b`))
  if (!match) throw new Error(`Missing --token-${token}`)
  return match[1]
}

function luminance(hex) {
  const channels = [0, 1, 2].map((index) => Number.parseInt(hex.slice(index * 2 + 1, index * 2 + 3), 16) / 255)
  const linear = channels.map((channel) => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4))
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]
}

function contrast(first, second) {
  const lighter = Math.max(luminance(first), luminance(second))
  const darker = Math.min(luminance(first), luminance(second))
  return (lighter + 0.05) / (darker + 0.05)
}

for (const cssFile of cssFiles) {
  const source = fs.readFileSync(cssFile, 'utf8')
  for (const [themeName, selector] of [['light', ':root'], ['dark', '\\.dark']]) {
    const block = readCssBlock(source, selector)
    for (const tone of tones) {
      const ratio = contrast(readToken(block, tone), readToken(block, `${tone}-surface`))
      if (ratio < 4.5) {
        violations.push(`${cssFile} ${themeName}: text-${tone} on bg-${tone}-surface is ${ratio.toFixed(2)}:1; expected >= 4.5:1`)
      }
    }
  }
}

for (const tone of tones) {
  if (statusSurfacePairs.get(tone) === 0) {
    violations.push(`No source status pairing found for text-${tone} on bg-${tone}-surface`)
  }
}

if (violations.length) {
  console.error('Tinted status surface guard failed:')
  for (const violation of violations) console.error(`- ${violation}`)
  process.exit(1)
}

console.log(`Tinted status surface guard passed: ${roots.length} source roots and ${cssFiles.length} theme token files scanned; semantic status pairs meet 4.5:1.`)

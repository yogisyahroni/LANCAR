#!/usr/bin/env node

/**
 * Keep essential Customer/Admin copy on the shared readable scale.
 *
 * Deliberate monospace code-entry fields may use tracking-widest; ordinary
 * labels and presentation text may not introduce 9–11px arbitrary sizes or
 * custom tracking values without a reviewed exception.
 */

import fs from 'node:fs'
import path from 'node:path'

const roots = [
  path.resolve('frontend/src'),
  path.resolve('admin-dashboard/src'),
]
const extensions = new Set(['.tsx', '.jsx', '.ts', '.js'])
const violations = []
const codeEntryExceptions = [
  `${path.sep}frontend${path.sep}src${path.sep}app${path.sep}(portal)${path.sep}profil${path.sep}page.tsx`,
  `${path.sep}admin-dashboard${path.sep}src${path.sep}pages${path.sep}finance${path.sep}closingPanel.tsx`,
]
const otpPinScreens = [
  `${path.sep}frontend${path.sep}src${path.sep}app${path.sep}(auth)${path.sep}login${path.sep}page.tsx`,
  `${path.sep}frontend${path.sep}src${path.sep}app${path.sep}(auth)${path.sep}forgot-pin${path.sep}page.tsx`,
]

function isCodeEntryException(filePath, line) {
  return codeEntryExceptions.some((suffix) => filePath.endsWith(suffix)) && /font-mono/.test(line)
}

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filePath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      walk(filePath)
      continue
    }
    if (!extensions.has(path.extname(entry.name))) continue

    const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/)
    lines.forEach((line, index) => {
      const lineNumber = index + 1
      if (/\btext-\[(?:9|10|11)px\]/.test(line)) {
        violations.push(`${filePath}:${lineNumber}: essential copy uses a 9–11px text utility`)
      }

      if (/\btracking-\[[^\]]+\]/.test(line)) {
        const intentionalCodeSpacing = /font-mono/.test(line) && (
          /\b(?:otp|pin)\b/i.test(line) || otpPinScreens.some((suffix) => filePath.endsWith(suffix))
        )
        if (!intentionalCodeSpacing) {
          violations.push(`${filePath}:${lineNumber}: custom tracking requires a reviewed code-entry exception`)
        }
      }

      if (/\btracking-widest\b/.test(line) && !isCodeEntryException(filePath, line)) {
        violations.push(`${filePath}:${lineNumber}: tracking-widest is reserved for reviewed monospace code entry`)
      }
    })
  }
}

for (const root of roots) walk(root)

if (violations.length) {
  console.error('Typography scale guard failed:')
  for (const violation of violations) console.error(`- ${violation}`)
  process.exit(1)
}

console.log('Typography scale guard passed: no 9–11px utilities or unreviewed extreme tracking in Customer/Admin source.')

import fs from 'node:fs'
import path from 'node:path'

const roots = [
  path.resolve('frontend/src'),
  path.resolve('admin-dashboard/src'),
]
const extensions = new Set(['.ts', '.tsx', '.js', '.jsx'])
const forbiddenPackages = /from\s+["'](?:@heroicons|react-icons|@mui\/icons|@fortawesome)[^"']*["']/
// Keep ordinary typographic punctuation (✓, arrows, bullets) valid; block
// pictographic emoji commonly used as an ungoverned functional icon.
const emojiPattern = /[\u{1F000}-\u{1FAFF}\u{1FC00}-\u{1FFFD}]/u
const violations = []

function importedLucideNames(source) {
  const names = new Set()
  const importPattern = /import\s*{([^{}]*?)}\s*from\s*["']lucide-react["']/g
  for (const match of source.matchAll(importPattern)) {
    for (const part of match[1].split(',')) {
      const clean = part.replace(/\/\/[^\r\n]*/g, '').trim()
      if (!clean || /^type\s+/.test(clean)) continue
      const bits = clean.split(/\s+as\s+/)
      names.add(bits[bits.length - 1].trim())
    }
  }
  return names
}

function checkSvgSemantics(source, filePath) {
  const iconNames = importedLucideNames(source)
  const selfClosingIconPattern = /<([A-Z][A-Za-z0-9]*)\b([^<>]*?)\s*\/\s*>/g
  for (const match of source.matchAll(selfClosingIconPattern)) {
    if (!iconNames.has(match[1])) continue
    const attributes = match[2]
    if (/\baria-hidden\s*=|\brole\s*=|\baria-label\s*=/.test(attributes)) continue
    const line = source.slice(0, match.index).split('\n').length
    violations.push(`${filePath}:${line}: Lucide icon <${match[1]}> needs aria-hidden or an explicit accessible name`)
  }

  // Icon components passed through a data object are intentionally rendered
  // with member expressions (for example <stat.icon />) or the generic
  // <Icon /> convention, so they are not covered by importedLucideNames.
  // Require the same semantic contract for those dynamic render sites.
  const dynamicIconPattern = /<(?:Icon|[A-Za-z][A-Za-z0-9_]*\.icon)\b([^<>]*?)\s*\/\s*>/g
  for (const match of source.matchAll(dynamicIconPattern)) {
    const attributes = match[1]
    if (/\baria-hidden\s*=|\brole\s*=|\baria-label\s*=/.test(attributes)) continue
    const line = source.slice(0, match.index).split('\n').length
    violations.push(`${filePath}:${line}: dynamic icon needs aria-hidden or an explicit accessible name`)
  }

  const rawSvgPattern = /<svg\b([^>]*)>/g
  for (const match of source.matchAll(rawSvgPattern)) {
    const attributes = match[1]
    if (/\baria-hidden\s*=|\brole\s*=|\baria-label\s*=/.test(attributes)) continue
    const line = source.slice(0, match.index).split('\n').length
    violations.push(`${filePath}:${line}: raw <svg> needs aria-hidden or an explicit semantic role`)
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
    if (forbiddenPackages.test(source)) violations.push(`${filePath}: non-LUCIDE icon package import`)
    if (emojiPattern.test(source)) violations.push(`${filePath}: emoji used in application source; use Lucide or text`)
    checkSvgSemantics(source, filePath)
  }
}

for (const root of roots) walk(root)

if (violations.length) {
  console.error('Iconography guard failed:')
  for (const violation of violations) console.error(`- ${violation}`)
  process.exit(1)
}

console.log(`Iconography guard passed: ${roots.length} source roots, Lucide/default icon family enforced.`)

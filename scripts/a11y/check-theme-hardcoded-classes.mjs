#!/usr/bin/env node

/**
 * Theme-hardcode guard for the two web surfaces.
 *
 * Raw palette utilities and literal colors are allowed only at an explicit
 * rendering boundary (maps, charts, fixed external-brand artwork, or print
 * output). Ordinary application UI must consume the semantic theme tokens.
 */

import fs from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()
const roots = ['frontend/src', 'admin-dashboard/src']
const extensions = new Set(['.tsx', '.ts', '.jsx', '.js'])

const allowlistedFiles = new Set([
  'frontend/src/app/(auth)/daftar/page.tsx',
  'frontend/src/app/(auth)/login/page.tsx',
  'frontend/src/app/(portal)/orders/[id]/OrderDetailContent.tsx',
  'frontend/src/app/(portal)/orders/[id]/RouteSnapshotPanel.tsx',
  'frontend/src/app/(portal)/resi/[id]/page.tsx',
  'frontend/src/components/orders/OrderSummary.tsx',
  'admin-dashboard/src/components/LiveMap.tsx',
  'admin-dashboard/src/components/experience/DesignTokenEditor.tsx',
  'admin-dashboard/src/pages/Analytics.tsx',
  'admin-dashboard/src/pages/MapsRuntime.tsx',
  'admin-dashboard/src/pages/ResiTemplates.tsx',
  'admin-dashboard/src/pages/Zones.tsx',
  'admin-dashboard/src/pages/finance/treasury/RekeningGridSection.tsx',
  'admin-dashboard/src/pages/useFinanceData.ts',
])

const rawUtilityPattern = /\b(?:text|bg|border|ring|from|to|via|divide|shadow)-(?:zinc|gray|slate|neutral|white|black|red|green|orange|yellow|blue|emerald|amber|sky|indigo|purple|pink|teal|violet|rose|brand-emerald)(?:-[0-9]+)?(?:\/(?:[0-9]+|\[[^\]]+\]))?\b/g
const arbitraryColorPattern = /\b(?:text|bg|border|ring|from|to|via|divide|shadow)-\[(?:#|rgb|rgba|hsl|hsla)[^\]]+\]/gi
const literalColorPattern = /#[0-9a-f]{3,8}\b|\b(?:rgb|rgba|hsl|hsla)\([^)]*\)/gi

function walk(root) {
  const result = []
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const file = path.join(root, entry.name)
    if (entry.isDirectory()) result.push(...walk(file))
    else if (extensions.has(path.extname(entry.name))) result.push(file)
  }
  return result
}

const findings = []
for (const root of roots) {
  for (const absoluteFile of walk(path.join(repoRoot, root))) {
    const relativeFile = path.relative(repoRoot, absoluteFile).replaceAll(path.sep, '/')
    const source = fs.readFileSync(absoluteFile, 'utf8')
    const rawUtilityMatches = [...source.matchAll(rawUtilityPattern)].map((match) => match[0])
    const arbitraryColorMatches = [...source.matchAll(arbitraryColorPattern)].map((match) => match[0])
    const literalColorMatches = [...source.matchAll(literalColorPattern)].map((match) => match[0])
    const allMatches = [...new Set([...rawUtilityMatches, ...arbitraryColorMatches, ...literalColorMatches])]
    if (allMatches.length === 0) continue

    if (allowlistedFiles.has(relativeFile)) {
      console.log(`ALLOWLIST ${relativeFile}: ${allMatches.join(', ')}`)
    } else {
      findings.push({ file: relativeFile, matches: allMatches })
    }
  }
}

if (findings.length > 0) {
  console.error('Theme hardcode guard failed. Move ordinary UI colors to semantic tokens or document a rendering-boundary exception.')
  for (const finding of findings) console.error(`  ${finding.file}: ${finding.matches.join(', ')}`)
  process.exitCode = 1
} else {
  console.log(`Theme hardcode guard passed. Allowlisted rendering boundaries: ${allowlistedFiles.size}.`)
}

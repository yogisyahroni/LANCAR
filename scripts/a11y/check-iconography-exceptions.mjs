import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const manifestPath = path.join(root, 'docs/design/iconography-exceptions-2026.json')
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
const violations = []
const sourceRoots = [path.join(root, 'frontend/src'), path.join(root, 'admin-dashboard/src')]
const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.jsx'])
const entriesByPath = new Map(manifest.entries.map((entry) => [entry.path, entry]))

function readProjectFile(relativePath) {
  const absolutePath = path.join(root, relativePath)
  if (!fs.existsSync(absolutePath)) {
    violations.push(`${relativePath}: documented iconography exception file does not exist`)
    return null
  }
  return fs.readFileSync(absolutePath, 'utf8')
}

function walk(directory, callback) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      walk(absolutePath, callback)
      continue
    }
    if (sourceExtensions.has(path.extname(entry.name))) callback(absolutePath)
  }
}

for (const entry of manifest.entries) {
  const source = readProjectFile(entry.path)
  if (source === null) continue
  if (!entry.kind || !entry.rationale || !entry.accessible_contract) {
    violations.push(`${entry.path}: exception must declare kind, rationale and accessible_contract`)
  }
  if (entry.raw_svg_count !== undefined) {
    const rawSvgCount = (source.match(/<svg\b/g) || []).length
    if (rawSvgCount !== entry.raw_svg_count) {
      violations.push(`${entry.path}: manifest expects ${entry.raw_svg_count} raw SVG element(s), found ${rawSvgCount}`)
    }
    if (!source.includes(entry.needle)) {
      violations.push(`${entry.path}: documented raw SVG marker is missing or changed`)
    }
  }
}

for (const sourceRoot of sourceRoots) {
  walk(sourceRoot, (absolutePath) => {
    const relativePath = path.relative(root, absolutePath).replaceAll(path.sep, '/')
    const source = fs.readFileSync(absolutePath, 'utf8')
    const rawSvgCount = (source.match(/<svg\b/g) || []).length
    if (rawSvgCount > 0) {
      const entry = entriesByPath.get(relativePath)
      if (!entry || entry.raw_svg_count !== rawSvgCount) {
        violations.push(`${relativePath}: raw SVG usage must be listed in iconography-exceptions-2026.json`)
      }
    }
    for (const match of source.matchAll(/src=["']\/(?:[^"']+\/)?([^"'/]+\.svg)["']/g)) {
      const assetName = match[1]
      const assetEntries = manifest.entries.filter((entry) => entry.path.endsWith(`/${assetName}`))
      if (assetEntries.length === 0) {
        violations.push(`${relativePath}: SVG asset ${assetName} must be listed in iconography-exceptions-2026.json`)
      }
    }
  })
}

if (violations.length) {
  console.error('Iconography exception guard failed:')
  for (const violation of violations) console.error(`- ${violation}`)
  process.exit(1)
}

console.log(`Iconography exception guard passed: ${manifest.entries.length} documented brand/map/chart exceptions.`)

import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

const require = createRequire(import.meta.url)
const typescriptPath = require.resolve('typescript', {
  paths: [path.resolve('frontend'), path.resolve('admin-dashboard')],
})
const ts = require(typescriptPath)

const roots = [
  path.resolve('frontend/src'),
  path.resolve('admin-dashboard/src'),
]
const extensions = new Set(['.tsx', '.jsx'])
const violations = []

function attribute(opening, name) {
  return opening.attributes.properties.find(
    (property) => ts.isJsxAttribute(property) && property.name.text === name,
  )
}

function hasNonEmptyInitializer(candidate) {
  if (!candidate?.initializer) return false
  if (ts.isStringLiteral(candidate.initializer)) return candidate.initializer.text.trim().length > 0
  if (ts.isJsxExpression(candidate.initializer)) return Boolean(candidate.initializer.expression)
  return false
}

function tagName(opening) {
  return ts.isIdentifier(opening.tagName) ? opening.tagName.text : ''
}

function walk(directory, callback) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filePath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      walk(filePath, callback)
      continue
    }
    if (extensions.has(path.extname(entry.name))) callback(filePath)
  }
}

for (const root of roots) {
  walk(root, (filePath) => {
    const source = fs.readFileSync(filePath, 'utf8')
    const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    function visit(node) {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const invalid = attribute(node, 'aria-invalid')
        if (invalid && !hasNonEmptyInitializer(attribute(node, 'aria-describedby'))) {
          const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1
          const relativePath = path.relative(process.cwd(), filePath).replaceAll(path.sep, '/')
          violations.push(`${relativePath}:${line}: <${tagName(node)}> with aria-invalid must reference aria-describedby error/help text`)
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(sourceFile)
  })
}

if (violations.length) {
  console.error('Invalid-field description guard failed:')
  for (const violation of violations) console.error(`- ${violation}`)
  process.exit(1)
}

console.log(`Invalid-field description guard passed: ${roots.length} source roots scanned.`)

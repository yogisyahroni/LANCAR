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
const nonNativeTags = new Set(['div', 'span', 'p', 'li', 'td', 'tr'])
const violations = []

function attribute(opening, name) {
  return opening.attributes.properties.find(
    (property) => ts.isJsxAttribute(property) && property.name.text === name,
  )
}

function attributeValue(opening, name, sourceFile) {
  const candidate = attribute(opening, name)
  if (!candidate?.initializer) return ''
  if (ts.isStringLiteral(candidate.initializer)) return candidate.initializer.text
  if (ts.isJsxExpression(candidate.initializer)) return candidate.initializer.expression?.getText(sourceFile) || ''
  return ''
}

function hasAttribute(opening, name) {
  return Boolean(attribute(opening, name))
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
        const name = tagName(node)
        const onClick = attribute(node, 'onClick')
        const onKeyDown = attribute(node, 'onKeyDown')
        if (nonNativeTags.has(name) && (onClick || onKeyDown)) {
          const role = attributeValue(node, 'role', sourceFile)
          const ariaHidden = attributeValue(node, 'aria-hidden', sourceFile)
          const interactionText = [onClick, onKeyDown]
            .filter(Boolean)
            .map((candidate) => candidate.getText(sourceFile))
            .join(' ')
          const isBackdrop = ariaHidden === 'true'
          const isDialogOrMenu = role.includes('dialog') || role.includes('menu')
          const isPropagationGuard = interactionText.includes('stopPropagation') && !role
          if (!isBackdrop && !isDialogOrMenu && !isPropagationGuard) {
            const missing = []
            if (!role) missing.push('role')
            if (!hasAttribute(node, 'tabIndex')) missing.push('tabIndex')
            if (onClick && !onKeyDown) missing.push('onKeyDown')
            if (missing.length) {
              const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1
              const relativePath = path.relative(process.cwd(), filePath).replaceAll(path.sep, '/')
              violations.push(`${relativePath}:${line}: non-native interactive <${name}> requires ${missing.join(', ')}`)
            }
          }
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(sourceFile)
  })
}

if (violations.length) {
  console.error('Native control guard failed:')
  for (const violation of violations) console.error(`- ${violation}`)
  process.exit(1)
}

console.log(`Native control guard passed: ${roots.length} source roots scanned.`)

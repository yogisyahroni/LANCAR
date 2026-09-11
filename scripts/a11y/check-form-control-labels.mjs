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
const nativeControls = new Set(['input', 'textarea', 'select'])
const violations = []

function tagName(node) {
  return node && ts.isIdentifier(node) ? node.text : ''
}

function attribute(node, name) {
  return node.attributes.properties.find(
    (property) => ts.isJsxAttribute(property) && property.name.text === name,
  )
}

function staticValue(attributeNode) {
  if (!attributeNode?.initializer) return null
  if (ts.isStringLiteral(attributeNode.initializer)) return attributeNode.initializer.text
  if (!ts.isJsxExpression(attributeNode.initializer) || !attributeNode.initializer.expression) return null
  const expression = attributeNode.initializer.expression
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) return expression.text
  return undefined
}

function hasProgrammaticName(element) {
  const opening = ts.isJsxElement(element) ? element.openingElement : element
  for (const name of ['aria-label', 'aria-labelledby']) {
    const candidate = attribute(opening, name)
    if (!candidate) continue
    const value = staticValue(candidate)
    if (value === null || value === undefined || value.trim()) return true
  }

  for (const property of opening.attributes.properties) {
    if (!ts.isJsxSpreadAttribute(property) || !ts.isCallExpression(property.expression)) continue
    for (const argument of property.expression.arguments) {
      if (!ts.isObjectLiteralExpression(argument)) continue
      for (const objectProperty of argument.properties) {
        if (!ts.isPropertyAssignment(objectProperty)) continue
        const name = objectProperty.name
        const propertyName = ts.isIdentifier(name) || ts.isStringLiteral(name) ? name.text : ''
        if (!['aria-label', 'aria-labelledby'].includes(propertyName)) continue
        const value = ts.isStringLiteral(objectProperty.initializer)
          ? objectProperty.initializer.text
          : undefined
        if (value === undefined || value.trim()) return true
      }
    }
  }

  return false
}

function isNestedInLabel(element) {
  let current = element.parent
  while (current) {
    if (ts.isJsxElement(current) || ts.isJsxSelfClosingElement(current)) {
      const opening = current.openingElement
      if (tagName(opening.tagName).toLowerCase() === 'label') return true
    }
    current = current.parent
  }
  return false
}

function collectExplicitLabelTargets(sourceFile) {
  const targets = new Set()
  function visit(node) {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const opening = ts.isJsxElement(node) ? node.openingElement : node
      if (tagName(opening.tagName).toLowerCase() === 'label') {
        const target = attribute(opening, 'htmlFor') ?? attribute(opening, 'for')
        const value = staticValue(target)
        if (value) targets.add(value)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return targets
}

function checkFile(filePath) {
  const sourceFile = ts.createSourceFile(
    filePath,
    fs.readFileSync(filePath, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  const explicitLabelTargets = collectExplicitLabelTargets(sourceFile)

  function visit(node) {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const opening = ts.isJsxElement(node) ? node.openingElement : node
      const name = tagName(opening.tagName).toLowerCase()
      if (nativeControls.has(name)) {
        const type = staticValue(attribute(opening, 'type'))
        const id = staticValue(attribute(opening, 'id'))
        const isHidden = name === 'input' && type?.toLowerCase() === 'hidden'
        const hasExplicitLabel = Boolean(id && explicitLabelTargets.has(id))
        if (!isHidden && !isNestedInLabel(node) && !hasProgrammaticName(node) && !hasExplicitLabel) {
          const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1
          violations.push(`${filePath}:${line}: ${name} needs a persistent programmatic label or an associated label`)
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
}

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filePath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      walk(filePath)
    } else if (extensions.has(path.extname(entry.name))) {
      checkFile(filePath)
    }
  }
}

for (const root of roots) walk(root)

if (violations.length) {
  console.error('Form-control label guard failed:')
  for (const violation of violations) console.error(`- ${violation}`)
  process.exit(1)
}

console.log(`Form-control label guard passed: ${roots.length} source roots scanned.`)

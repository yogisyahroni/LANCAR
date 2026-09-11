#!/usr/bin/env node

/**
 * Table-row action buttons that render a decorative icon need an accessible
 * name (or visible label). Native buttons keep standard keyboard focus and
 * activation semantics; this guard prevents silent icon-only regressions in
 * dynamic table rows that static direct-icon matching cannot see.
 */

import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

const require = createRequire(import.meta.url)
const typescriptPath = require.resolve('typescript', {
  paths: [path.resolve('frontend'), path.resolve('admin-dashboard')],
})
const ts = require(typescriptPath)
const roots = [path.resolve('frontend/src'), path.resolve('admin-dashboard/src')]
const extensions = new Set(['.tsx', '.jsx'])
const violations = []

function tagName(node) {
  return node && ts.isIdentifier(node) ? node.text : ''
}

function attribute(opening, name) {
  return opening.attributes.properties.find(
    (property) => ts.isJsxAttribute(property) && property.name.text === name,
  )
}

function staticValue(attributeNode) {
  if (!attributeNode?.initializer) return null
  if (ts.isStringLiteral(attributeNode.initializer)) return attributeNode.initializer.text
  if (!ts.isJsxExpression(attributeNode.initializer) || !attributeNode.initializer.expression) return null
  const expression = attributeNode.initializer.expression
  return ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression) ? expression.text : undefined
}

function isDecorativeIcon(node) {
  if (!ts.isJsxElement(node) && !ts.isJsxSelfClosingElement(node)) return false
  const opening = ts.isJsxElement(node) ? node.openingElement : node
  const name = tagName(opening.tagName)
  return (name === 'svg' || /^[A-Z]/.test(name)) && staticValue(attribute(opening, 'aria-hidden')) === 'true'
}

function hasVisibleOrDynamicText(node) {
  if (ts.isJsxText(node)) return Boolean(node.getText().trim())
  if (ts.isJsxExpression(node)) return Boolean(node.expression)
  if (ts.isJsxSelfClosingElement(node)) return false
  if (!ts.isJsxElement(node) || isDecorativeIcon(node)) return false
  return node.children.some(hasVisibleOrDynamicText)
}

function containsDecorativeIcon(node) {
  let result = false
  function visit(current) {
    if (isDecorativeIcon(current)) result = true
    if (!result) ts.forEachChild(current, visit)
  }
  visit(node)
  return result
}

function hasAccessibleName(button) {
  const opening = button.openingElement
  for (const name of ['aria-label', 'aria-labelledby', 'title']) {
    const value = staticValue(attribute(opening, name))
    if (value === undefined || (typeof value === 'string' && value.trim())) return true
  }
  return button.children.some(hasVisibleOrDynamicText)
}

function checkFile(filePath) {
  const source = fs.readFileSync(filePath, 'utf8')
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)

  function visit(node, rowDepth = 0) {
    if (ts.isJsxElement(node)) {
      const name = tagName(node.openingElement.tagName).toLowerCase()
      const nextRowDepth = rowDepth + (name === 'tr' ? 1 : 0)
      if (nextRowDepth > 0 && name === 'button' && containsDecorativeIcon(node) && !hasAccessibleName(node)) {
        const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1
        violations.push(`${filePath}:${line}: table-row icon action button needs an accessible name or visible label`)
      }
      for (const child of node.children) visit(child, nextRowDepth)
      return
    }
    ts.forEachChild(node, (child) => visit(child, rowDepth))
  }

  visit(sourceFile)
}

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filePath = path.join(directory, entry.name)
    if (entry.isDirectory()) walk(filePath)
    else if (extensions.has(path.extname(entry.name))) checkFile(filePath)
  }
}

for (const root of roots) walk(root)

if (violations.length) {
  console.error('Table-row action semantics guard failed:')
  for (const violation of violations) console.error(`- ${violation}`)
  process.exit(1)
}

console.log(`Table-row action semantics guard passed: ${roots.length} application source roots scanned.`)

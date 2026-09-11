#!/usr/bin/env node

/**
 * Icon-only button elements/components must retain an accessible name even
 * when the icon is nested in a conditional wrapper. This complements the direct-source
 * iconography guard and the table-row guard for dense operational data.
 */

import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

const require = createRequire(import.meta.url)
const typescriptPath = require.resolve('typescript', { paths: [path.resolve('frontend'), path.resolve('admin-dashboard')] })
const ts = require(typescriptPath)
const roots = [path.resolve('frontend/src'), path.resolve('admin-dashboard/src')]
const extensions = new Set(['.tsx', '.jsx'])
const violations = []

function tagName(node) { return node && ts.isIdentifier(node) ? node.text : '' }
function attribute(opening, name) { return opening.attributes.properties.find((property) => ts.isJsxAttribute(property) && property.name.text === name) }
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
  function visit(current) { if (isDecorativeIcon(current)) result = true; if (!result) ts.forEachChild(current, visit) }
  visit(node)
  return result
}
function hasAccessibleName(button) {
  for (const name of ['aria-label', 'aria-labelledby', 'title']) {
    const value = staticValue(attribute(button.openingElement, name))
    if (value === undefined || (typeof value === 'string' && value.trim())) return true
  }
  return button.children.some(hasVisibleOrDynamicText)
}
function checkFile(filePath) {
  const source = fs.readFileSync(filePath, 'utf8')
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  function visit(node) {
    if (ts.isJsxElement(node) && tagName(node.openingElement.tagName).toLowerCase() === 'button' && containsDecorativeIcon(node) && !hasAccessibleName(node)) {
      const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1
      violations.push(`${filePath}:${line}: icon-only button needs an accessible name or visible label`)
    }
    ts.forEachChild(node, visit)
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
  console.error('Icon-button semantics guard failed:')
  for (const violation of violations) console.error(`- ${violation}`)
  process.exit(1)
}
console.log(`Icon-button semantics guard passed: ${roots.length} application source roots scanned.`)

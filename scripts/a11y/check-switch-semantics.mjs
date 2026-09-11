#!/usr/bin/env node

/**
 * Custom switch controls must retain native button keyboard behavior and
 * expose their accessible name plus checked state. Native checkbox/radio
 * controls are covered by the form-control label guard and browser semantics.
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
  return node && ts.isIdentifier(node) ? node.text.toLowerCase() : ''
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

function hasName(opening) {
  return ['aria-label', 'aria-labelledby'].some((name) => {
    const value = staticValue(attribute(opening, name))
    return value === undefined || (typeof value === 'string' && value.trim().length > 0)
  })
}

function checkFile(filePath) {
  const source = fs.readFileSync(filePath, 'utf8')
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)

  function visit(node) {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const opening = ts.isJsxElement(node) ? node.openingElement : node
      if (staticValue(attribute(opening, 'role')) === 'switch') {
        const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1
        if (tagName(opening.tagName) !== 'button') {
          violations.push(`${filePath}:${line}: role="switch" must use a native button`)
        }
        if (staticValue(attribute(opening, 'type')) !== 'button') {
          violations.push(`${filePath}:${line}: switch button must declare type="button"`)
        }
        if (!attribute(opening, 'aria-checked')) {
          violations.push(`${filePath}:${line}: switch button is missing aria-checked`)
        }
        if (!hasName(opening)) {
          violations.push(`${filePath}:${line}: switch button is missing an accessible name`)
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
    if (entry.isDirectory()) walk(filePath)
    else if (extensions.has(path.extname(entry.name))) checkFile(filePath)
  }
}

for (const root of roots) walk(root)

if (violations.length) {
  console.error('Switch semantics guard failed:')
  for (const violation of violations) console.error(`- ${violation}`)
  process.exit(1)
}

console.log(`Switch semantics guard passed: ${roots.length} application source roots scanned.`)

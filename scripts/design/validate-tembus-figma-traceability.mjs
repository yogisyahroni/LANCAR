import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()
const catalogPath = path.join(root, 'docs/design/tembus-component-catalog-2026.json')
const requiredPages = new Set(['Foundations & Components', 'Customer Super-App Patterns', 'Commerce Ads & Merchant'])
const errors = []

let catalog
try {
  catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'))
} catch (error) {
  errors.push(`catalog could not be read: ${error.message}`)
}

if (catalog) {
  if (catalog.catalog_version !== '1.0.0') errors.push('catalog_version must be 1.0.0')
  if (catalog.design_system_version !== '1.0.0') errors.push('design_system_version must be 1.0.0')
  if (catalog.figma_file !== 'https://www.figma.com/design/9JTlREMJNVkLYchQD1QcpV') errors.push('catalog must use the current Figma reference')
  if (!Array.isArray(catalog.required_pages) || ![...requiredPages].every((page) => catalog.required_pages.includes(page))) {
    errors.push('required Figma pages must include Foundations & Components, Customer Super-App Patterns, and Commerce Ads & Merchant')
  }
  if (catalog.code_connect?.status !== 'deferred_until_api_stable') errors.push('Code Connect must remain deferred until APIs stabilize')

  const components = Array.isArray(catalog.components) ? catalog.components : []
  if (components.length === 0) errors.push('components must be a non-empty array')
  const ids = components.map((component) => component?.id).filter(Boolean)
  if (new Set(ids).size !== ids.length) errors.push('component ids must be unique')

  for (const component of components) {
    const prefix = `component ${component?.id || '<missing-id>'}`
    for (const field of ['id', 'figma_page', 'figma_component_ref', 'code_role', 'semantic_props', 'usage', 'do_not_use', 'accessibility', 'code_mapping', 'design_review', 'status']) {
      if (!(field in (component || {}))) errors.push(`${prefix} is missing ${field}`)
    }
    if (!requiredPages.has(component?.figma_page)) errors.push(`${prefix} uses an ungoverned Figma page`)
    if (!String(component?.figma_component_ref || '').startsWith('Tembus/')) errors.push(`${prefix} must use a stable Tembus/ Figma component reference`)
    if (!Array.isArray(component?.semantic_props) || component.semantic_props.length === 0) errors.push(`${prefix} must map variants/props to semantic code props`)
    for (const note of ['usage', 'do_not_use', 'accessibility']) {
      if (typeof component?.[note] !== 'string' || component[note].trim().length < 20) errors.push(`${prefix} needs a meaningful ${note} note`)
    }
    for (const mapping of component?.code_mapping || []) {
      if (!mapping?.path || !mapping?.role) errors.push(`${prefix} has an incomplete code mapping`)
      else if (!fs.existsSync(path.join(root, mapping.path))) errors.push(`${prefix} maps to missing file ${mapping.path}`)
    }
    if (!component?.design_review?.task_id || !Array.isArray(component?.design_review?.implementation_refs) || component.design_review.implementation_refs.length === 0) {
      errors.push(`${prefix} must link its Figma component reference to a task and implementation reference`)
    }
    if (component?.status !== 'stable') errors.push(`${prefix} must be stable before it is a shared catalog entry`)
  }
}

if (errors.length) {
  console.error('TEMBUS Figma traceability catalog: FAIL')
  for (const error of errors) console.error(`- ${error}`)
  process.exitCode = 1
} else {
  console.log(`TEMBUS Figma traceability catalog: PASS (${catalog.components.length} stable components, ${catalog.required_pages.length} governed pages, Code Connect deferred)`)
}

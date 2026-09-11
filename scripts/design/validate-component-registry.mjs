import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()
const registryPath = path.join(root, 'docs/design/component-registry-2026.json')
const contractPath = path.join(root, 'backend/admin-service/src/services/experienceConfig.ts')
const knownSurfaces = new Set(['customer_android', 'customer_web', 'merchant_android', 'courier_android'])
const supportedSurfaces = new Set([...knownSurfaces, 'admin_dashboard'])
const lifecycleStatuses = new Set(['experimental', 'stable', 'deprecated'])
const errors = []

const read = (file) => {
  try {
    return fs.readFileSync(file, 'utf8')
  } catch (error) {
    errors.push(`${path.relative(root, file)} could not be read: ${error.message}`)
    return ''
  }
}

const parseRegistry = () => {
  try {
    return JSON.parse(read(registryPath))
  } catch (error) {
    errors.push(`component registry is not valid JSON: ${error.message}`)
    return null
  }
}

const extractObjectBlock = (source, marker) => {
  const start = source.indexOf(marker)
  if (start < 0) {
    errors.push(`contract marker is missing: ${marker}`)
    return ''
  }
  const end = source.indexOf('\n};', start)
  if (end < 0) {
    errors.push(`contract block is not terminated: ${marker}`)
    return ''
  }
  return source.slice(start, end)
}

const extractTopLevelKeys = (block) => [...block.matchAll(/^\s{2}([a-z][a-z0-9_]*)\s*:/gm)].map((match) => match[1])

const extractSurfaceComponents = (block, surface) => {
  const lines = block.split(/\r?\n/)
  const start = lines.findIndex((line) => new RegExp(`^  ${surface}:`).test(line))
  if (start < 0) {
    errors.push(`surface contract is missing: ${surface}`)
    return []
  }
  const body = []
  for (let index = start; index < lines.length; index += 1) {
    if (index > start && /^  [a-z][a-z0-9_]*\s*:/.test(lines[index])) break
    body.push(lines[index])
  }
  return [...body.join('\n').matchAll(/'([a-z][a-z0-9_]*)'/g)].map((item) => item[1])
}

const sameSet = (left, right) => left.length === right.length && left.every((value) => right.includes(value))

const registry = parseRegistry()
const contract = read(contractPath)

if (registry) {
  if (registry.registry_version !== '1.0.0') errors.push('registry_version must be 1.0.0 for the DS-2026-001 baseline')
  if (registry.design_system_version !== '1.0.0') errors.push('design_system_version must be 1.0.0 for the DS-2026-001 baseline')
  if (registry.control_plane_surface !== 'admin_dashboard') errors.push('control_plane_surface must be admin_dashboard')
  if (!Array.isArray(registry.entries) || registry.entries.length === 0) errors.push('entries must be a non-empty array')

  const entries = Array.isArray(registry.entries) ? registry.entries : []
  const ids = entries.map((entry) => entry?.id).filter(Boolean)
  if (new Set(ids).size !== ids.length) errors.push('registry entry ids must be unique')

  for (const entry of entries) {
    const prefix = `entry ${entry?.id || '<missing-id>'}`
    if (!entry || typeof entry !== 'object') {
      errors.push(`${prefix} must be an object`)
      continue
    }
    for (const field of ['id', 'display_name', 'owner', 'status', 'supported_surfaces', 'runtime_surfaces', 'accessibility_contract', 'code_mapping', 'release']) {
      if (!(field in entry)) errors.push(`${prefix} is missing ${field}`)
    }
    if (!lifecycleStatuses.has(entry.status)) errors.push(`${prefix} has invalid status ${entry.status}`)
    if (entry.remote_app_experience !== true) errors.push(`${prefix} must explicitly declare remote_app_experience=true`)
    if (!Array.isArray(entry.supported_surfaces) || entry.supported_surfaces.some((surface) => !supportedSurfaces.has(surface))) {
      errors.push(`${prefix} has an unknown supported surface`)
    }
    if (!Array.isArray(entry.runtime_surfaces) || entry.runtime_surfaces.some((surface) => !knownSurfaces.has(surface))) {
      errors.push(`${prefix} has an unknown runtime surface`)
    }
    if (Array.isArray(entry.supported_surfaces) && !entry.supported_surfaces.includes('admin_dashboard')) {
      errors.push(`${prefix} must include admin_dashboard as its control-plane preview surface`)
    }
    if (Array.isArray(entry.runtime_surfaces) && Array.isArray(entry.supported_surfaces)) {
      for (const surface of entry.runtime_surfaces) {
        if (!entry.supported_surfaces.includes(surface)) errors.push(`${prefix} runtime surface ${surface} is not in supported_surfaces`)
      }
    }
    const accessibility = entry.accessibility_contract
    for (const field of ['accessible_name_fields', 'media_semantics', 'media_composition', 'static_fallback', 'presentation_only']) {
      if (!accessibility || !(field in accessibility)) errors.push(`${prefix} is missing accessibility_contract.${field}`)
    }
    if (!Array.isArray(entry.code_mapping) || entry.code_mapping.length === 0) errors.push(`${prefix} must have at least one code mapping`)
    for (const mapping of entry.code_mapping || []) {
      if (!mapping?.path || !mapping?.role) errors.push(`${prefix} has an incomplete code mapping`)
      else if (!fs.existsSync(path.join(root, mapping.path))) errors.push(`${prefix} maps to missing file ${mapping.path}`)
    }
  }

  const schemaBlock = extractObjectBlock(contract, 'const componentSchemas:')
  const accessibilityBlock = extractObjectBlock(contract, 'export const EXPERIENCE_COMPONENT_ACCESSIBILITY_CONTRACT:')
  const schemaComponents = extractTopLevelKeys(schemaBlock)
  const accessibilityComponents = extractTopLevelKeys(accessibilityBlock)
  if (!sameSet(ids, schemaComponents)) errors.push(`registry ids ${ids.join(', ')} do not match server schema ${schemaComponents.join(', ')}`)
  if (!sameSet(ids, accessibilityComponents)) errors.push(`registry ids ${ids.join(', ')} do not match server accessibility contract ${accessibilityComponents.join(', ')}`)

  const surfaceBlock = extractObjectBlock(contract, 'export const EXPERIENCE_SURFACE_COMPONENTS:')
  for (const surface of knownSurfaces) {
    const serverComponents = extractSurfaceComponents(surfaceBlock, surface)
    const registryComponents = entries.filter((entry) => entry.runtime_surfaces?.includes(surface)).map((entry) => entry.id)
    if (!sameSet(registryComponents, serverComponents)) {
      errors.push(`registry runtime surface ${surface} does not match server allowlist: registry=[${registryComponents.join(', ')}] server=[${serverComponents.join(', ')}]`)
    }
  }
}

if (errors.length > 0) {
  console.error('LANCAR design-system component registry: FAIL')
  for (const error of errors) console.error(`- ${error}`)
  process.exitCode = 1
} else {
  console.log(`LANCAR design-system component registry: PASS (${registry.entries.length} remote component types, ${knownSurfaces.size} runtime surfaces, admin preview gate)`)
}

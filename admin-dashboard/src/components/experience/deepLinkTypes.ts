import type { ExperienceSurface } from './types'

export type DeepLinkParameter = {
  name: string
  label: string
  required: boolean
  pattern: 'identifier' | 'uuid'
  example: string
}

export type DeepLinkRoute = {
  route_id: string
  label: string
  description: string
  template: string
  parameters: DeepLinkParameter[]
  min_app_version: string
  min_schema_version: number
  supported_surfaces: ExperienceSurface[]
  fallback_route_id: string
  status: 'active' | 'deprecated'
}

export type DeepLinkUsage = {
  deep_link: string
  manifest_id: string
  revision: number
  state: 'draft' | 'published' | 'superseded' | 'rolled_back'
  market_code: string
  surface: ExperienceSurface
  min_app_version: string
  schema_version: number
}

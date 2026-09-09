import type { ExperienceAsset, ExperienceManifest, ExperienceSurface } from './types'

export type AssetLifecycle = 'active' | 'deprecated' | 'scheduled_deletion'

export type AssetUsage = {
  manifest_id: string
  revision: number
  state: ExperienceManifest['state']
  market_code: string
  surface: ExperienceSurface
  starts_at: string
  ends_at: string | null
  placements: string[]
}

export type LibraryAsset = ExperienceAsset & {
  key: string
  usages: AssetUsage[]
  lifecycle: AssetLifecycle
}

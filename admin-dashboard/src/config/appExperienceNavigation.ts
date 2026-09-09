import {
  BarChart3,
  Ban,
  Calendar,
  Eye,
  Flag,
  History,
  Image,
  Link as LinkIcon,
  Palette,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Target,
  Layers,
  type LucideIcon,
} from 'lucide-react'
import { EXPERIENCE_CAPABILITIES, type ExperienceCapability } from '../lib/experiencePermissions'

export const APP_EXPERIENCE_ROLES = ['super_admin', 'ops_admin', 'ops_security'] as const
export type AppExperienceRole = (typeof APP_EXPERIENCE_ROLES)[number]

export type ExperienceNavigationKind =
  | 'manifest'
  | 'feature-flags'
  | 'scheduling'
  | 'version-policy'
  | 'analytics'

export type AppExperienceNavigationItem = {
  id: string
  label: string
  path: string
  icon: LucideIcon
  kind: ExperienceNavigationKind
  allowedRoles: readonly string[]
  requiredCapability: ExperienceCapability
}

const manifestRoles = APP_EXPERIENCE_ROLES

/**
 * This is the single navigation contract for the App Experience control plane.
 * Existing business domains are linked where they remain authoritative:
 * Promo/Pricing owns financial eligibility, Feature Flags owns platform flags,
 * and the manifest API owns presentation/exposure.
 */
export const APP_EXPERIENCE_NAVIGATION: readonly AppExperienceNavigationItem[] = [
  { id: 'overview', label: 'Overview', path: '/app-experience/overview', icon: Sparkles, kind: 'manifest', allowedRoles: manifestRoles, requiredCapability: EXPERIENCE_CAPABILITIES.read },
  { id: 'home-layout', label: 'Home Layout', path: '/app-experience/home-layout', icon: Layers, kind: 'manifest', allowedRoles: manifestRoles, requiredCapability: EXPERIENCE_CAPABILITIES.read },
  { id: 'campaigns', label: 'Banners & Promo Content', path: '/app-experience/campaigns', icon: Image, kind: 'manifest', allowedRoles: manifestRoles, requiredCapability: EXPERIENCE_CAPABILITIES.read },
  { id: 'campaign-intro', label: 'Campaign Intro', path: '/app-experience/campaign-intro', icon: Sparkles, kind: 'manifest', allowedRoles: manifestRoles, requiredCapability: EXPERIENCE_CAPABILITIES.read },
  { id: 'service-visibility', label: 'Service Visibility', path: '/app-experience/service-visibility', icon: Smartphone, kind: 'manifest', allowedRoles: manifestRoles, requiredCapability: EXPERIENCE_CAPABILITIES.read },
  { id: 'feature-flags', label: 'Feature Flags', path: '/app-experience/feature-flags', icon: Flag, kind: 'feature-flags', allowedRoles: manifestRoles, requiredCapability: EXPERIENCE_CAPABILITIES.read },
  { id: 'kill-switches', label: 'Kill Switches', path: '/app-experience/kill-switches', icon: Ban, kind: 'manifest', allowedRoles: manifestRoles, requiredCapability: EXPERIENCE_CAPABILITIES.read },
  { id: 'targeting', label: 'Audience & Targeting', path: '/app-experience/targeting', icon: Target, kind: 'manifest', allowedRoles: manifestRoles, requiredCapability: EXPERIENCE_CAPABILITIES.read },
  { id: 'scheduling', label: 'Scheduling', path: '/app-experience/scheduling', icon: Calendar, kind: 'scheduling', allowedRoles: ['super_admin', 'ops_admin'], requiredCapability: EXPERIENCE_CAPABILITIES.read },
  { id: 'assets', label: 'Asset Library', path: '/app-experience/assets', icon: Image, kind: 'manifest', allowedRoles: manifestRoles, requiredCapability: EXPERIENCE_CAPABILITIES.read },
  { id: 'deep-links', label: 'Deep Links', path: '/app-experience/deep-links', icon: LinkIcon, kind: 'manifest', allowedRoles: manifestRoles, requiredCapability: EXPERIENCE_CAPABILITIES.read },
  { id: 'design-tokens', label: 'Design Tokens', path: '/app-experience/design-tokens', icon: Palette, kind: 'manifest', allowedRoles: manifestRoles, requiredCapability: EXPERIENCE_CAPABILITIES.read },
  { id: 'version-policy', label: 'App Version Policy', path: '/app-experience/version-policy', icon: Smartphone, kind: 'version-policy', allowedRoles: manifestRoles, requiredCapability: EXPERIENCE_CAPABILITIES.read },
  { id: 'preview', label: 'Preview', path: '/app-experience/preview', icon: Eye, kind: 'manifest', allowedRoles: manifestRoles, requiredCapability: EXPERIENCE_CAPABILITIES.read },
  { id: 'approval', label: 'Approval Queue', path: '/app-experience/approval', icon: ShieldCheck, kind: 'manifest', allowedRoles: manifestRoles, requiredCapability: EXPERIENCE_CAPABILITIES.read },
  { id: 'revisions', label: 'Revisions & Rollback', path: '/app-experience/revisions', icon: History, kind: 'manifest', allowedRoles: manifestRoles, requiredCapability: EXPERIENCE_CAPABILITIES.read },
  { id: 'analytics', label: 'Analytics', path: '/app-experience/analytics', icon: BarChart3, kind: 'analytics', allowedRoles: manifestRoles, requiredCapability: EXPERIENCE_CAPABILITIES.read },
]

export const canAccessAppExperience = (role: string | null | undefined) =>
  Boolean(role && APP_EXPERIENCE_ROLES.includes(role as AppExperienceRole))

export const appExperienceNavigationItem = (path: string) =>
  APP_EXPERIENCE_NAVIGATION.find((item) => item.path === path)

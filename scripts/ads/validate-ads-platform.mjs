import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')
const checks = []
const mustContain = (file, patterns, label) => {
  const source = read(file)
  for (const pattern of patterns) checks.push({ label: `${label}: ${pattern}`, pass: source.includes(pattern) })
}
const mustNotContain = (file, patterns, label) => {
  const source = read(file)
  for (const pattern of patterns) checks.push({ label: `${label}: no ${pattern}`, pass: !source.includes(pattern) })
}

for (const file of [
  'backend/ads-service/internal/domain/campaign.go',
  'backend/ads-service/internal/auth/gateway.go',
  'backend/ads-service/internal/domain/placement.go',
  'backend/ads-service/internal/domain/ad_event.go',
  'backend/ads-service/internal/domain/experiment.go',
  'backend/ads-service/internal/service/campaign_service.go',
  'backend/ads-service/internal/service/delivery_service.go',
  'backend/ads-service/internal/service/experiment_service.go',
  'backend/ads-service/internal/service/auction_service.go',
  'backend/ads-service/internal/service/budget_service.go',
  'backend/ads-service/internal/repository/postgres_repository.go',
  'backend/ads-service/internal/handler/ads_handler.go',
  'database/migrations/20260912000001_ads_platform_core.sql',
]) if (!fs.existsSync(path.join(root, file))) checks.push({ label: `file exists: ${file}`, pass: false })

mustContain('backend/ads-service/internal/domain/campaign.go', ['StatusDraft', 'StatusValidating', 'StatusReview', 'StatusScheduled', 'StatusActive', 'StatusPaused', 'StatusEnded', 'StatusBudgetExhausted', 'StatusPaymentHold', 'StatusSuspended', 'StatusArchived'], 'lifecycle')
mustContain('backend/ads-service/internal/domain/placement.go', ['MaxAds', 'MaxDensityPercent', 'MinOrganicVisible', 'ProtectedAdFree', 'PlacementHomeFirstViewport', 'PlacementFoodDiscovery', 'PlacementAdFreeCheckout', 'PlacementTambalActive', 'PlacementTowingActive'], 'inventory')
mustContain('backend/ads-service/internal/domain/ad_event.go', ['AdDeliveryToken', 'SourceType', 'DisclosureLabel', 'OrganicFacts'], 'delivery response')
mustContain('backend/ads-service/internal/domain/experiment.go', ['ExperimentExposure', 'opaque 43-character hash', 'billable impression'], 'experiment separation')
mustContain('backend/ads-service/internal/service/experiment_service.go', ['RecordExperimentExposure', 'exposure.Validate'], 'experiment exposure service')
mustContain('backend/ads-service/internal/service/delivery_service.go', ['hmac.New', 'ExpiresAt', 'SaveDeliveryContext', 'EventImpression', 'EventClick'], 'signed event context')
mustContain('backend/ads-service/internal/handler/ads_handler.go', ['ServerConversion', 'authoritative_order_event', 'VerifyOrderEvent'], 'server conversion boundary')
mustContain('backend/ads-service/internal/repository/postgres_repository.go', ['RecordServerConversion', 'order_id', 'attribution_window_minutes', 'server_order_join'], 'server attribution join')
mustContain('backend/ads-service/internal/auth/gateway.go', ['RequireGatewayAuth', 'X-Internal-Auth', 'VerifyOrderEvent'], 'gateway trust boundary')
mustContain('backend/ads-service/internal/service/auction_service.go', ['RankScore', 'campaign_id_ascending', 'ads-auction-v1'], 'auction guardrails')
mustContain('backend/ads-service/internal/repository/postgres_repository.go', ['FOR UPDATE', 'ON CONFLICT DO NOTHING', 'spent_minor', 'budget_exhausted', 'currency mismatch'], 'atomic billing')
mustContain('backend/ads-service/internal/handler/ads_handler.go', ['X-User-ID', 'X-User-Role', 'merchantActor', 'adminActor', 'organic_fallback'], 'authority/fallback')
mustContain('backend/ads-service/internal/service/delivery_service.go', ['Sponsored / Iklan'], 'disclosure')
mustContain('database/migrations/20260912000001_ads_platform_core.sql', ['ads_campaign_revisions', 'ads_delivery_contexts', 'ads_billing_events', 'ads_invalid_traffic_reviews', 'ads_experiment_exposures', 'ads_policy_audit_events', 'UNIQUE (campaign_id, idempotency_key)'], 'persistence evidence')
mustNotContain('backend/ads-service/internal/domain/campaign.go', ['rating', 'eta', 'availability'], 'organic fact boundary')
mustContain('docs/contracts/commerce-ads-2026.md', ['Experience Service', 'Promo/Pricing', '25%', 'ad-free', 'maker-checker', 'last_touch'], 'contract')
mustContain('admin-dashboard/src/pages/ads/CommerceAds.tsx', ['Creatives & Moderation', 'Inventory & Placements', 'Billing & Credits', 'Invalid Traffic', 'Audit', 'Approve', 'Suspend'], 'admin control plane')
mustContain('admin-dashboard/src/App.tsx', ['/commerce-ads'], 'admin route')
mustContain('admin-dashboard/src/components/DashboardLayout.tsx', ['Commerce Ads (Iklan)'], 'admin navigation')
mustContain('android-app-merchant/app/src/main/java/com/tembus/merchant/ui/screens/ads/AdsZipScreen.kt', ['objective', 'placement', 'branchIds', 'audience', 'daypart', 'Preview Iklan', 'Clone', 'Akhiri', 'Promo adalah penawaran harga'], 'merchant manager')
mustContain('backend/api-gateway/src/index.ts', ['ADS_SERVICE_URL', "path.startsWith('/api/v1/ads')", "path.startsWith('/api/v1/merchant/ads')", 'X-Ads-Context-Resolved'], 'gateway integration')
mustContain('backend/api-gateway/src/routeAuthMatrix.ts', ['commerce-ads-api', "prefix('/api/v1/ads')"], 'ads route auth')
mustContain('android-app-customer/app/src/main/java/com/tembus/customer/data/api/TEMBUSApiService.kt', ['getAdsPlacement', 'recordAdsImpression', 'recordAdsClick'], 'customer ads API')
mustContain('backend/ads-service/cmd/api/main.go', ['/api/v1/ads/experiments/exposures'], 'experiment exposure route')
mustContain('backend/ads-service/internal/repository/postgres_repository.go', ['RecordExperimentExposure', 'ON CONFLICT (experiment_key, assignment_key, placement) DO NOTHING'], 'experiment exposure persistence')

const failed = checks.filter((check) => !check.pass)
if (failed.length) {
  console.error('TEMBUS Ads platform gate: FAIL')
  failed.forEach((check) => console.error(`- ${check.label}`))
  process.exit(1)
}
console.log(`TEMBUS Ads platform gate: PASS (${checks.length} checks)`)

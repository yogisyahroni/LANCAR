import { useState } from 'react'
import { ArrowDown, ArrowUp, GripVertical, Eye, EyeOff, Plus, Save, Trash2 } from 'lucide-react'
import AssetPicker from '../components/experience/AssetPicker'
import TargetingEditor from '../components/experience/TargetingEditor'
import { hasAudienceConstraints, placementForComponent, type ExperienceForm, type ExperienceSection, type ServiceExposureEntry } from '../components/experience/types'
import ServiceExposureEditor from '../components/experience/ServiceExposureEditor'

type Props = {
  value: ExperienceForm
  onChange: (value: ExperienceForm) => void
  onSave: () => void
  onCancel: () => void
  saving?: boolean
  disabled?: boolean
  isRevision?: boolean
  focusAssetId?: string | null
  homeLayoutMode?: boolean
  serviceVisibilityMode?: boolean
}

type SectionProperties = Record<string, unknown>
type ArrayRecord = SectionProperties[]

const inputClass = 'mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-zinc-100 outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/20 disabled:opacity-50'

const HOME_LAYOUT_COMPONENTS = [
  ['hero_banner', 'Hero banner'],
  ['campaign_strip', 'Campaign strip'],
  ['promo_carousel', 'Promo carousel'],
  ['service_grid', 'Service grid'],
  ['quick_actions', 'Quick actions'],
  ['info_card', 'Info card'],
  ['notice', 'Notice'],
  ['spacer', 'Spacer'],
] as const

const EXTENDED_COMPONENTS = [
  ...HOME_LAYOUT_COMPONENTS,
  ['campaign_intro', 'Campaign intro'],
  ['design_tokens', 'Design tokens'],
] as const

const createId = (prefix: string) => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return `${prefix}-${crypto.randomUUID()}`
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

const newSection = (component: string): ExperienceSection => {
  const content = (placement = 'hero'): SectionProperties => ({
    campaign_name: '',
    placement,
    title: '',
    body: '',
    badge: '',
    alt_label: '',
    cta_label: 'Lihat sekarang',
    deep_link: '/food',
  })
  const defaults: Record<string, SectionProperties> = {
    hero_banner: content(),
    campaign_strip: content('campaign_strip'),
    promo_carousel: {
      campaign_name: '',
      placement: 'carousel',
      frequency_cap_hours: 24,
      max_impressions: 1,
      items: [{ ...content(), id: createId('promo-item') }],
    },
    info_card: { title: '', body: '' },
    notice: { title: '', body: '' },
    quick_actions: { actions: [{ id: createId('quick-action'), label: '', deep_link: '/food' }] },
    service_grid: { title: 'Services', service_codes: ['food_delivery'], display_mode: 'cards' },
    spacer: { size: 'medium' },
    campaign_intro: {
      enabled: true,
      campaign_id: 'campaign',
      campaign_name: '',
      title: '',
      body: '',
      media_asset_id: '',
      frequency_cap_hours: 24,
      max_impressions: 1,
      display_duration_seconds: 6,
      max_duration_seconds: 15,
      prefetch_window_hours: 24,
      dismissible: true,
      skippable: true,
    },
    design_tokens: { accent_preset: 'brand', background_preset: 'surface', corner_preset: 'standard', spacing_preset: 'standard', badge_preset: 'pill' },
  }
  return { id: createId(component), component, enabled: true, properties: defaults[component] ?? {} }
}

const csv = (value: unknown) => Array.isArray(value) ? value.join(', ') : ''
const records = (value: unknown): ArrayRecord => Array.isArray(value)
  ? value.filter((entry): entry is SectionProperties => Boolean(entry && typeof entry === 'object' && !Array.isArray(entry)))
  : []

export default function AppExperienceEditor({
  value,
  onChange,
  onSave,
  onCancel,
  saving = false,
  disabled = false,
  isRevision = false,
  focusAssetId = null,
  homeLayoutMode = false,
  serviceVisibilityMode = false,
}: Props) {
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const update = (patch: Partial<ExperienceForm>) => onChange({ ...value, ...patch })
  const updateSection = (index: number, patch: Partial<ExperienceSection>) => update({ sections: value.sections.map((section, sectionIndex) => sectionIndex === index ? { ...section, ...patch } : section) })
  const setProperty = (index: number, key: string, propertyValue: unknown) => updateSection(index, { properties: { ...value.sections[index].properties, [key]: propertyValue } })
  const updateCampaignIntroAssets = (sectionIndex: number, mediaAssetId: string, fallbackAssetId: string) => {
    const mediaId = mediaAssetId.trim()
    const fallbackId = fallbackAssetId.trim()
    const properties = { ...value.sections[sectionIndex].properties }
    if (mediaId) properties.media_asset_id = mediaId
    else delete properties.media_asset_id
    const asset_references = value.asset_references.map((asset) => asset.asset_id === mediaId
      ? { ...asset, fallback_asset_id: fallbackId || null }
      : asset)
    update({
      asset_references,
      sections: value.sections.map((section, index) => index === sectionIndex ? { ...section, properties } : section),
    })
  }
  const setLocalizedReference = (index: number, field: string, reference: string) => {
    const current = value.sections[index].properties.localized_copy
    const references = current && typeof current === 'object' && !Array.isArray(current) ? { ...(current as Record<string, unknown>) } : {}
    if (reference.trim()) references[field] = reference.trim().toLowerCase()
    else delete references[field]
    const properties = { ...value.sections[index].properties }
    if (Object.keys(references).length > 0) properties.localized_copy = references
    else delete properties.localized_copy
    updateSection(index, { properties })
  }
  const setArrayItemLocalizedReference = (sectionIndex: number, key: string, itemIndex: number, field: string, reference: string) => {
    const item = records(value.sections[sectionIndex].properties[key])[itemIndex]
    const current = item.localized_copy
    const references = current && typeof current === 'object' && !Array.isArray(current) ? { ...(current as Record<string, unknown>) } : {}
    if (reference.trim()) references[field] = reference.trim().toLowerCase()
    else delete references[field]
    updateArrayItem(sectionIndex, key, itemIndex, { localized_copy: Object.keys(references).length > 0 ? references : undefined })
  }
  const moveSection = (from: number, to: number) => {
    if (to < 0 || to >= value.sections.length || from === to) return
    const sections = [...value.sections]
    const [moved] = sections.splice(from, 1)
    sections.splice(to, 0, moved)
    update({ sections })
  }
  const removeSection = (index: number) => {
    if (value.sections.length <= 1) return
    update({ sections: value.sections.filter((_, sectionIndex) => sectionIndex !== index) })
  }
  const setEnabled = (index: number, enabled: boolean) => {
    const enabledCount = value.sections.filter((section) => section.enabled !== false).length
    if (!enabled && enabledCount <= 1) return
    updateSection(index, { enabled })
  }
  const updateArrayItem = (sectionIndex: number, key: string, itemIndex: number, patch: SectionProperties) => {
    const items = records(value.sections[sectionIndex].properties[key])
    setProperty(sectionIndex, key, items.map((item, index) => index === itemIndex ? { ...item, ...patch } : item))
  }
  const removeArrayItem = (sectionIndex: number, key: string, itemIndex: number) => {
    const items = records(value.sections[sectionIndex].properties[key])
    if (items.length <= 1) return
    setProperty(sectionIndex, key, items.filter((_, index) => index !== itemIndex))
  }
  const addArrayItem = (sectionIndex: number, key: 'items' | 'actions') => {
    const current = records(value.sections[sectionIndex].properties[key])
    const next = key === 'items'
      ? { id: createId('promo-item'), campaign_name: '', title: '', body: '', badge: '', alt_label: '', cta_label: 'Lihat sekarang', deep_link: '/food' }
      : { id: createId('quick-action'), label: '', deep_link: '/food' }
    setProperty(sectionIndex, key, [...current, next])
  }
  const localizedFieldsFor = (component: string) => component === 'quick_actions' || component === 'promo_carousel' || component === 'campaign_intro'
    ? []
    : ['title', 'body'].filter((field) => component !== 'service_grid' || field === 'title')
  const canaryError = value.rollout_stage === 'canary' && !value.canary_cohort.trim()
  const broadWarning = !hasAudienceConstraints(value.targeting) && value.rollout_stage === 'public'
  const componentOptions = serviceVisibilityMode ? [['service_grid', 'Service visibility']] as const : homeLayoutMode ? HOME_LAYOUT_COMPONENTS : EXTENDED_COMPONENTS
  const enabledCount = value.sections.filter((section) => section.enabled !== false).length

  const renderTextField = (sectionIndex: number, key: string, label = key.replaceAll('_', ' '), placeholder = '') => (
    <label key={key} className="text-xs font-bold capitalize text-zinc-400">
      {label}
      <input className={inputClass} disabled={disabled} value={String(value.sections[sectionIndex].properties[key] ?? '')} onChange={(event) => setProperty(sectionIndex, key, event.target.value)} placeholder={placeholder} />
    </label>
  )

  const renderCampaignIntro = (sectionIndex: number) => {
    const properties = value.sections[sectionIndex].properties
    const mediaAssetId = String(properties.media_asset_id ?? '')
    const fallbackAssetId = value.asset_references.find((asset) => asset.asset_id === mediaAssetId)?.fallback_asset_id ?? ''
    const mediaAssets = value.asset_references.filter((asset) => asset.kind === 'image' || asset.kind === 'animation')
    const displayDuration = Number(properties.display_duration_seconds ?? 6)
    const maxDuration = Number(properties.max_duration_seconds ?? 15)
    return <div className="md:col-span-2 rounded-xl border border-sky-500/20 bg-sky-500/[0.04] p-4">
      <div className="rounded-xl border border-primary/20 bg-primary/10 p-3 text-xs leading-relaxed text-primary-light">
        <strong>Post-native-splash campaign intro.</strong> This preview is shown after the local OS launch splash; it never configures or replaces the OS splash and cannot block the first usable screen with a network request.
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {renderTextField(sectionIndex, 'campaign_id', 'Campaign ID', 'launch-2026')}
        {renderTextField(sectionIndex, 'campaign_name', 'Internal campaign name', 'Ramadan launch intro')}
        <label className="text-xs font-bold text-zinc-400">Primary image / animation asset<select className={inputClass} disabled={disabled} value={mediaAssetId} onChange={(event) => updateCampaignIntroAssets(sectionIndex, event.target.value, '')}><option value="">No media — text-only intro</option>{mediaAssets.map((asset) => <option key={asset.asset_id} value={asset.asset_id}>{asset.asset_id} · {asset.kind}</option>)}</select></label>
        <label className="text-xs font-bold text-zinc-400">Low-bandwidth fallback asset<select className={inputClass} disabled={disabled || !mediaAssetId} value={fallbackAssetId} onChange={(event) => updateCampaignIntroAssets(sectionIndex, mediaAssetId, event.target.value)}><option value="">Skip media if unavailable</option>{mediaAssets.filter((asset) => asset.asset_id !== mediaAssetId).map((asset) => <option key={asset.asset_id} value={asset.asset_id}>{asset.asset_id} · {asset.kind}</option>)}</select></label>
        {renderTextField(sectionIndex, 'title', 'Localized headline fallback', 'Welcome to LANCAR')}
        {renderTextField(sectionIndex, 'body', 'Localized body fallback', 'A short message after startup')}
        <label className="text-xs font-bold text-zinc-400">Target display duration (seconds)<input type="number" min="1" max="60" className={inputClass} disabled={disabled} value={String(properties.display_duration_seconds ?? '')} onChange={(event) => setProperty(sectionIndex, 'display_duration_seconds', event.target.value === '' ? undefined : Number(event.target.value))} /></label>
        <label className="text-xs font-bold text-zinc-400">Hard maximum duration (seconds)<input type="number" min="1" max="120" className={inputClass} disabled={disabled} value={String(properties.max_duration_seconds ?? '')} onChange={(event) => setProperty(sectionIndex, 'max_duration_seconds', event.target.value === '' ? undefined : Number(event.target.value))} /></label>
        <label className="text-xs font-bold text-zinc-400">Frequency cap (hours)<input type="number" min="0" max="720" className={inputClass} disabled={disabled} value={String(properties.frequency_cap_hours ?? '')} onChange={(event) => setProperty(sectionIndex, 'frequency_cap_hours', event.target.value === '' ? undefined : Number(event.target.value))} /></label>
        <label className="text-xs font-bold text-zinc-400">Maximum impressions<input type="number" min="1" max="100" className={inputClass} disabled={disabled} value={String(properties.max_impressions ?? '')} onChange={(event) => setProperty(sectionIndex, 'max_impressions', event.target.value === '' ? undefined : Number(event.target.value))} /></label>
        <label className="text-xs font-bold text-zinc-400">Asset prefetch window (hours)<input type="number" min="1" max="24" className={inputClass} disabled={disabled} value={String(properties.prefetch_window_hours ?? '')} onChange={(event) => setProperty(sectionIndex, 'prefetch_window_hours', event.target.value === '' ? undefined : Number(event.target.value))} /></label>
        <label className="flex items-center gap-2 self-end rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs font-bold text-zinc-400"><input type="checkbox" className="h-4 w-4 accent-primary" disabled={disabled} checked={properties.enabled !== false} onChange={(event) => setProperty(sectionIndex, 'enabled', event.target.checked)} /> Enabled</label>
        <label className="flex items-center gap-2 self-end rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs font-bold text-zinc-400"><input type="checkbox" className="h-4 w-4 accent-primary" disabled={disabled} checked={properties.dismissible !== false} onChange={(event) => setProperty(sectionIndex, 'dismissible', event.target.checked)} /> Dismissible</label>
        <label className="flex items-center gap-2 self-end rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs font-bold text-zinc-400"><input type="checkbox" className="h-4 w-4 accent-primary" disabled={disabled} checked={properties.skippable !== false} onChange={(event) => setProperty(sectionIndex, 'skippable', event.target.checked)} /> Skippable</label>
      </div>
      <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-3">
        <p className="text-[10px] font-black uppercase tracking-wider text-primary-light">Localized headline/body pack keys</p>
        <div className="mt-3 grid gap-3 md:grid-cols-2"><label className="text-xs font-bold text-zinc-400">Headline pack key<input className={inputClass} disabled={disabled} value={String((properties.localized_copy as Record<string, unknown> | undefined)?.title ?? '')} onChange={(event) => setLocalizedReference(sectionIndex, 'title', event.target.value)} placeholder="campaign.intro.headline" /></label><label className="text-xs font-bold text-zinc-400">Body pack key<input className={inputClass} disabled={disabled} value={String((properties.localized_copy as Record<string, unknown> | undefined)?.body ?? '')} onChange={(event) => setLocalizedReference(sectionIndex, 'body', event.target.value)} placeholder="campaign.intro.body" /></label></div>
      </div>
      <div className="mt-4 space-y-2 text-[11px] leading-relaxed text-zinc-500">
        <p>Expired or unavailable media uses the linked fallback asset; if no verified fallback is available, the app skips the intro and continues normally.</p>
        <p>Assets are prefetched only for the audience-scoped manifest on an unmetered connection within the configured window (maximum 24 hours). Network fetch is never a startup prerequisite.</p>
        <p>Pause/kill is controlled by the authorized release controls above and takes effect from the published manifest without an app release.</p>
        {displayDuration > maxDuration ? <p className="font-bold text-red-300">Display duration must not exceed the hard maximum; publish will be blocked until corrected.</p> : null}
      </div>
    </div>
  }

  const renderPromoItems = (sectionIndex: number) => {
    const items = records(value.sections[sectionIndex].properties.items)
    return <div className="md:col-span-2 rounded-xl border border-white/10 bg-black/10 p-3">
      <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold text-zinc-300">Promo items</p><p className="mt-1 text-[11px] text-zinc-500">Presentation only; campaign eligibility is resolved by Promo/Pricing.</p></div><button type="button" disabled={disabled || items.length >= 10} onClick={() => addArrayItem(sectionIndex, 'items')} className="inline-flex items-center gap-1 rounded-lg border border-primary/30 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-primary-light disabled:opacity-50"><Plus size={12} /> Add item</button></div>
      <div className="mt-3 space-y-3">{items.map((item, itemIndex) => <div key={String(item.id ?? itemIndex)} className="rounded-xl border border-white/10 p-3">
        <div className="mb-3 flex items-center justify-between"><span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Item {itemIndex + 1}</span><button type="button" disabled={disabled || items.length <= 1} onClick={() => removeArrayItem(sectionIndex, 'items', itemIndex)} className="rounded-lg p-1 text-zinc-600 hover:bg-red-500/10 hover:text-red-300 disabled:opacity-50" aria-label={`Remove promo item ${itemIndex + 1}`}><Trash2 size={14} /></button></div>
        <div className="grid gap-3 md:grid-cols-2">
          {(['id', 'campaign_id', 'campaign_name', 'title', 'body', 'badge', 'alt_label', 'image_asset_id', 'cta_label', 'deep_link', 'external_url'] as const).map((key) => <label key={key} className="text-xs font-bold capitalize text-zinc-400">{key === 'deep_link' ? 'Deep link (allowlisted)' : key === 'external_url' ? 'External URL (first-party)' : key.replaceAll('_', ' ')}<input className={inputClass} disabled={disabled} value={String(item[key] ?? '')} onChange={(event) => updateArrayItem(sectionIndex, 'items', itemIndex, { [key]: event.target.value })} placeholder={key === 'deep_link' ? '/food' : key === 'external_url' ? 'https://app.bawain.my.id/...' : ''} /></label>)}
          <label className="text-xs font-bold text-zinc-400">Localized title pack key<input className={inputClass} disabled={disabled} value={String((item.localized_copy as Record<string, unknown> | undefined)?.title ?? '')} onChange={(event) => setArrayItemLocalizedReference(sectionIndex, 'items', itemIndex, 'title', event.target.value)} placeholder="home.promo.title" /></label>
          <label className="text-xs font-bold text-zinc-400">Localized subtitle/body pack key<input className={inputClass} disabled={disabled} value={String((item.localized_copy as Record<string, unknown> | undefined)?.body ?? '')} onChange={(event) => setArrayItemLocalizedReference(sectionIndex, 'items', itemIndex, 'body', event.target.value)} placeholder="home.promo.body" /></label>
        </div>
      </div>)}</div>
    </div>
  }

  const renderQuickActions = (sectionIndex: number) => {
    const actions = records(value.sections[sectionIndex].properties.actions)
    return <div className="md:col-span-2 rounded-xl border border-white/10 bg-black/10 p-3">
      <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold text-zinc-300">Quick actions</p><p className="mt-1 text-[11px] text-zinc-500">Each action is a native allowlisted deep link.</p></div><button type="button" disabled={disabled || actions.length >= 8} onClick={() => addArrayItem(sectionIndex, 'actions')} className="inline-flex items-center gap-1 rounded-lg border border-primary/30 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-primary-light disabled:opacity-50"><Plus size={12} /> Add action</button></div>
      <div className="mt-3 space-y-3">{actions.map((action, itemIndex) => <div key={String(action.id ?? itemIndex)} className="rounded-xl border border-white/10 p-3">
        <div className="mb-3 flex items-center justify-between"><span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Action {itemIndex + 1}</span><button type="button" disabled={disabled || actions.length <= 1} onClick={() => removeArrayItem(sectionIndex, 'actions', itemIndex)} className="rounded-lg p-1 text-zinc-600 hover:bg-red-500/10 hover:text-red-300 disabled:opacity-50" aria-label={`Remove quick action ${itemIndex + 1}`}><Trash2 size={14} /></button></div>
        <div className="grid gap-3 md:grid-cols-2">{(['id', 'label', 'icon_asset_id', 'deep_link'] as const).map((key) => <label key={key} className="text-xs font-bold capitalize text-zinc-400">{key.replaceAll('_', ' ')}<input className={inputClass} disabled={disabled} value={String(action[key] ?? '')} onChange={(event) => updateArrayItem(sectionIndex, 'actions', itemIndex, { [key]: event.target.value })} placeholder={key === 'deep_link' ? '/food' : ''} /></label>)}</div>
      </div>)}</div>
    </div>
  }

  return (
    <section className="space-y-5 rounded-3xl border border-white/10 bg-white/[0.03] p-5 shadow-xl shadow-black/10" aria-labelledby="experience-editor-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary-light">Approved component schema</p><h2 id="experience-editor-title" className="mt-1 text-xl font-black text-zinc-100">{isRevision ? 'Create new revision' : homeLayoutMode ? 'Home layout editor' : 'Campaign / experience editor'}</h2><p className="mt-1 text-xs text-zinc-500">Drag or use the arrow controls to change array order; the server validates the ordered schema before publish.</p></div><div className="flex gap-2"><button type="button" onClick={onCancel} className="rounded-xl border border-white/10 px-3 py-2 text-xs font-black uppercase tracking-widest text-zinc-400">Cancel</button><button type="button" disabled={disabled || saving || canaryError} onClick={onSave} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-black uppercase tracking-widest text-white disabled:opacity-50"><Save size={14} />{saving ? 'Saving...' : isRevision ? 'Create revision' : 'Save draft'}</button></div></div>
      {broadWarning ? <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-xs leading-relaxed text-amber-200">Broad public audience: server will require a different authorized operator to approve this campaign before publish.</div> : null}
      {canaryError ? <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-xs text-red-200">Canary rollout requires an explicit internal/test cohort.</div> : null}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4"><label className="text-xs font-bold text-zinc-400">Market code<input className={inputClass} disabled={disabled} value={value.market_code} onChange={(event) => update({ market_code: event.target.value })} placeholder="id-jk" /></label><label className="text-xs font-bold text-zinc-400">Locale<input className={inputClass} disabled={disabled} value={value.locale} onChange={(event) => update({ locale: event.target.value })} placeholder="id-ID" /></label><label className="text-xs font-bold text-zinc-400">Surface<select className={inputClass} disabled={disabled} value={value.surface} onChange={(event) => update({ surface: event.target.value as ExperienceForm['surface'] })}><option value="customer_android">Customer Android</option><option value="customer_web">Customer Web</option><option value="merchant_android">Merchant Android</option><option value="courier_android">Courier Android</option></select></label><label className="text-xs font-bold text-zinc-400">Schema version<input type="number" min="1" max="10" className={inputClass} disabled={disabled} value={value.schema_version} onChange={(event) => update({ schema_version: Number(event.target.value) })} /></label><label className="text-xs font-bold text-zinc-400">Minimum app version<input className={inputClass} disabled={disabled} value={value.min_app_version} onChange={(event) => update({ min_app_version: event.target.value })} placeholder="1.0.0" /></label><label className="text-xs font-bold text-zinc-400">Maximum app version<input className={inputClass} disabled={disabled} value={value.max_app_version} onChange={(event) => update({ max_app_version: event.target.value })} placeholder="Optional" /></label><label className="text-xs font-bold text-zinc-400">Start (local time)<input type="datetime-local" className={inputClass} disabled={disabled} value={value.starts_at} onChange={(event) => update({ starts_at: event.target.value })} /></label><label className="text-xs font-bold text-zinc-400">End (local time)<input type="datetime-local" className={inputClass} disabled={disabled} value={value.ends_at} onChange={(event) => update({ ends_at: event.target.value })} /></label><label className="text-xs font-bold text-zinc-400">Schedule timezone<input className={inputClass} disabled={disabled} value={value.schedule_timezone} onChange={(event) => update({ schedule_timezone: event.target.value })} placeholder="Asia/Jakarta" /></label><label className="text-xs font-bold text-zinc-400">Rollout stage<select className={inputClass} disabled={disabled} value={value.rollout_stage} onChange={(event) => update({ rollout_stage: event.target.value as ExperienceForm['rollout_stage'], canary_cohort: event.target.value === 'canary' ? value.canary_cohort : '' })}><option value="public">Public</option><option value="canary">Canary / internal</option></select></label><label className="text-xs font-bold text-zinc-400">Canary cohort<input className={inputClass} disabled={disabled || value.rollout_stage !== 'canary'} value={value.canary_cohort} onChange={(event) => update({ canary_cohort: event.target.value })} placeholder="internal-test" /></label><label className="text-xs font-bold text-zinc-400">Percentage rollout<input type="number" min="0" max="100" className={inputClass} disabled={disabled} value={value.rollout_percentage} onChange={(event) => update({ rollout_percentage: Math.max(0, Math.min(100, Number(event.target.value))) })} /></label><label className="text-xs font-bold text-zinc-400">Cache policy<select className={inputClass} disabled={disabled} value={value.cache_policy} onChange={(event) => update({ cache_policy: event.target.value as ExperienceForm['cache_policy'] })}><option value="private">Private</option><option value="no-store">No store</option><option value="public">Public</option></select></label></div>
      {value.rollout_percentage < 100 ? <p className="-mt-2 text-[11px] text-sky-200">Percentage rollout uses a stable server-side bucket per authenticated user; users without an identity stay outside the partial rollout.</p> : null}
      <TargetingEditor value={value.targeting} disabled={disabled} onChange={(targeting) => update({ targeting })} />
      <section className="rounded-2xl border border-white/10 bg-black/10 p-5" aria-labelledby="component-builder-title"><div className="flex items-center justify-between gap-3"><div><h3 id="component-builder-title" className="text-sm font-black uppercase tracking-wider text-zinc-200">{homeLayoutMode ? 'Home layout sections' : 'Layout components'}</h3><p className="mt-1 text-xs text-zinc-500">{homeLayoutMode ? 'Only the eight compiled Home Layout components can be added.' : 'Compose banners, campaign cards and experience sections from the registered schema.'}</p></div><button type="button" disabled={disabled} onClick={() => update({ sections: [...value.sections, newSection('hero_banner')] })} className="inline-flex items-center gap-1 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-primary-light disabled:opacity-50"><Plus size={14} /> Add component</button></div>
        <div className="mt-4 space-y-4">{value.sections.map((section, index) => {
          const enabled = section.enabled !== false
          const options = componentOptions.some(([key]) => key === section.component) ? componentOptions : [...componentOptions, [section.component, `${section.component} (existing)`] as const]
          return <article key={section.id} draggable={!disabled} onDragStart={() => setDragIndex(index)} onDragOver={(event) => event.preventDefault()} onDrop={() => { if (dragIndex !== null) moveSection(dragIndex, index); setDragIndex(null) }} onDragEnd={() => setDragIndex(null)} className={`rounded-2xl border p-4 ${enabled ? 'border-white/10 bg-white/[0.03]' : 'border-amber-500/20 bg-amber-500/[0.04]'}`}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-2 text-zinc-600" title="Drag to reorder"><GripVertical size={17} /><span className="text-[10px] font-black uppercase tracking-widest">Position {index + 1}</span></div><label className="flex flex-1 items-center gap-2 text-xs font-bold text-zinc-400"><span className="sr-only">Enabled</span><input type="checkbox" disabled={disabled || (!enabled && enabledCount <= 1)} checked={enabled} onChange={(event) => setEnabled(index, event.target.checked)} className="h-4 w-4 accent-primary" />{enabled ? <Eye size={14} className="text-emerald-300" /> : <EyeOff size={14} className="text-amber-300" />} Enabled</label><div className="flex items-center gap-1"><button type="button" disabled={disabled || index === 0} onClick={() => moveSection(index, index - 1)} className="rounded-lg p-2 text-zinc-500 hover:bg-white/10 hover:text-zinc-200 disabled:opacity-30" aria-label={`Move section ${section.id} up`}><ArrowUp size={15} /></button><button type="button" disabled={disabled || index === value.sections.length - 1} onClick={() => moveSection(index, index + 1)} className="rounded-lg p-2 text-zinc-500 hover:bg-white/10 hover:text-zinc-200 disabled:opacity-30" aria-label={`Move section ${section.id} down`}><ArrowDown size={15} /></button><button type="button" disabled={disabled || value.sections.length <= 1} aria-label={`Remove component ${section.id}`} onClick={() => removeSection(index)} className="rounded-lg p-2 text-zinc-600 transition hover:bg-red-500/10 hover:text-red-300 disabled:opacity-50"><Trash2 size={16} /></button></div></div>
            <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_14rem]"><label className="text-xs font-bold text-zinc-400">Section ID / internal name<input className={inputClass} disabled={disabled} value={section.id} onChange={(event) => updateSection(index, { id: event.target.value })} /></label><label className="text-xs font-bold text-zinc-400">Component type<select className={inputClass} disabled={disabled} value={section.component} onChange={(event) => { const component = event.target.value; updateSection(index, { component, properties: newSection(component).properties }) }}>{options.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label></div>
            {['hero_banner', 'campaign_strip', 'promo_carousel'].includes(section.component) ? <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">{section.component === 'hero_banner' ? <label className="inline-flex items-center gap-2 font-bold text-zinc-400">Placement<select className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-zinc-200" disabled={disabled} value={String(section.properties.placement ?? 'hero')} onChange={(event) => setProperty(index, 'placement', event.target.value)}><option value="hero">Hero</option><option value="header">Header</option></select></label> : <span>Placement: <strong className="text-zinc-300">{String(section.properties.placement ?? placementForComponent(section.component).toLowerCase().replaceAll(' ', '_'))}</strong></span>}<span>· promo copy is presentation-only; discount and eligibility remain in Promo/Pricing.</span></div> : null}
          <div className="mt-4 grid gap-3 md:grid-cols-2">{section.component === 'campaign_intro' ? renderCampaignIntro(index) : section.component === 'spacer' ? <label className="text-xs font-bold text-zinc-400">Size<select className={inputClass} disabled={disabled} value={String(section.properties.size ?? 'medium')} onChange={(event) => setProperty(index, 'size', event.target.value)}><option value="small">Small</option><option value="medium">Medium</option><option value="large">Large</option></select></label> : section.component === 'service_grid' ? <><label className="text-xs font-bold text-zinc-400">Title<input className={inputClass} disabled={disabled} value={String(section.properties.title ?? '')} onChange={(event) => setProperty(index, 'title', event.target.value)} /></label><label className="text-xs font-bold text-zinc-400">Service codes<input className={inputClass} disabled={disabled} value={csv(section.properties.service_codes)} onChange={(event) => setProperty(index, 'service_codes', event.target.value.split(',').map((item) => item.trim().toLowerCase()).filter(Boolean))} placeholder="food_delivery" /></label><label className="text-xs font-bold text-zinc-400">Display mode<select className={inputClass} disabled={disabled} value={String(section.properties.display_mode ?? 'cards')} onChange={(event) => setProperty(index, 'display_mode', event.target.value)}><option value="cards">Cards</option><option value="compact">Compact</option></select></label>{serviceVisibilityMode ? <div className="md:col-span-2"><ServiceExposureEditor entries={(Array.isArray(section.properties.service_entries) ? section.properties.service_entries : []) as ServiceExposureEntry[]} disabled={disabled} onChange={(entries) => setProperty(index, 'service_entries', entries)} /></div> : null}</> : section.component === 'promo_carousel' ? <><label className="text-xs font-bold text-zinc-400">Internal campaign name<input className={inputClass} disabled={disabled} value={String(section.properties.campaign_name ?? '')} onChange={(event) => setProperty(index, 'campaign_name', event.target.value)} placeholder="Ramadan food carousel" /></label><label className="text-xs font-bold text-zinc-400">Frequency cap (hours)<input type="number" min="0" max="720" className={inputClass} disabled={disabled} value={String(section.properties.frequency_cap_hours ?? '')} onChange={(event) => setProperty(index, 'frequency_cap_hours', event.target.value === '' ? undefined : Number(event.target.value))} /></label><label className="text-xs font-bold text-zinc-400">Maximum impressions<input type="number" min="1" max="100" className={inputClass} disabled={disabled} value={String(section.properties.max_impressions ?? '')} onChange={(event) => setProperty(index, 'max_impressions', event.target.value === '' ? undefined : Number(event.target.value))} /></label>{renderPromoItems(index)}</> : section.component === 'quick_actions' ? renderQuickActions(index) : section.component === 'design_tokens' ? <>{(['accent_preset', 'background_preset', 'corner_preset', 'spacing_preset', 'badge_preset'] as const).map((key) => <label key={key} className="text-xs font-bold capitalize text-zinc-400">{key.replaceAll('_', ' ')}<select className={inputClass} disabled={disabled} value={String(section.properties[key] ?? '')} onChange={(event) => setProperty(index, key, event.target.value)}><option value="brand">Brand</option><option value="surface">Surface</option><option value="standard">Standard</option><option value="pill">Pill</option><option value="campaign_orange">Campaign orange</option><option value="campaign_blue">Campaign blue</option><option value="brand_soft">Brand soft</option><option value="accent_soft">Accent soft</option><option value="compact">Compact</option><option value="emphasized">Emphasized</option><option value="relaxed">Relaxed</option><option value="hidden">Hidden</option><option value="label">Label</option></select></label>)}</> : <>{(['title', 'body', 'badge', 'cta_label', 'deep_link', 'external_url', 'image_asset_id', 'media_asset_id', 'icon_asset_id', 'campaign_id', 'campaign_name', 'alt_label', 'frequency_cap_hours', 'max_impressions'].filter((key) => section.component === 'info_card' ? ['title', 'body', 'deep_link', 'icon_asset_id'].includes(key) : section.component === 'notice' ? ['title', 'body', 'cta_label', 'deep_link', 'external_url'].includes(key) : ['campaign_id', 'campaign_name', 'title', 'body', 'badge', 'alt_label', 'cta_label', 'deep_link', 'external_url', 'image_asset_id', 'frequency_cap_hours', 'max_impressions'].includes(key)).map((key) => renderTextField(index, key, key === 'deep_link' ? 'Deep link (allowlisted)' : key === 'external_url' ? 'External URL (first-party)' : key.replaceAll('_', ' '), key === 'deep_link' ? '/food' : key === 'external_url' ? 'https://app.bawain.my.id/...' : '')))}</>}</div>
            {localizedFieldsFor(section.component).length > 0 ? <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-3"><p className="text-[10px] font-black uppercase tracking-wider text-primary-light">Localized copy references</p><p className="mt-1 text-[11px] text-zinc-500">Keys resolve on the server with locale fallback; unresolved keys are omitted and never shown raw.</p><div className="mt-3 grid gap-3 md:grid-cols-2">{localizedFieldsFor(section.component).map((field) => <label key={field} className="text-xs font-bold capitalize text-zinc-400">{field} pack key<input className={inputClass} disabled={disabled} value={String((section.properties.localized_copy as Record<string, unknown> | undefined)?.[field] ?? '')} onChange={(event) => setLocalizedReference(index, field, event.target.value)} placeholder={`home.${section.component}.${field}`} /></label>)}</div></div> : null}
            {!enabled && enabledCount <= 1 ? <p className="mt-3 text-[11px] text-amber-200">At least one enabled section is required by the manifest contract.</p> : null}
          </article>
        })}</div>
      </section>
      <AssetPicker value={value.asset_references} disabled={disabled} focusAssetId={focusAssetId} onChange={(asset_references) => update({ asset_references })} />
    </section>
  )
}

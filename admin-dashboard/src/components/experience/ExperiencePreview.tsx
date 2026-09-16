import {
  CheckCircle2,
  ExternalLink,
  Image as ImageIcon,
  Smartphone,
  Globe2,
  Truck,
  Store,
  XCircle,
  Monitor,
  Moon,
  Sun,
  Search,
  CreditCard,
  ArrowUp,
  Plus,
  MoreHorizontal,
  Bell,
  User,
  Shield,
  Wifi,
  Package,
  UtensilsCrossed,
  Wrench,
  Home,
  Clock,
  Sparkles,
  Layers,
  Eye,
  type LucideIcon
} from 'lucide-react'
import { useState } from 'react'
import { useTheme } from '../../providers/ThemeProvider'
import { adminApiRootUrl } from '../../lib/runtimeConfig'
import type { ExperienceSection, ExperienceSurface } from './types'

type Props = {
  surface: ExperienceSurface
  sections: ExperienceSection[]
  resolvedSections?: ExperienceSection[]
  simulation?: { matched?: boolean; reason?: string; selected_manifest?: { revision?: number } | null }
}

const surfaceLabel: Record<ExperienceSurface, string> = {
  customer_android: 'Customer Android',
  customer_web: 'Customer Web',
  merchant_android: 'Merchant Android',
  courier_android: 'Courier Android',
}

const surfaceIcon: Record<ExperienceSurface, LucideIcon> = {
  customer_android: Smartphone,
  customer_web: Globe2,
  merchant_android: Store,
  courier_android: Truck,
}

const text = (properties: Record<string, unknown>, key: string) => typeof properties[key] === 'string' ? properties[key] as string : ''

export default function ExperiencePreview({ surface, sections, resolvedSections, simulation }: Props) {
  const { resolvedTheme } = useTheme()
  const [previewMode, setPreviewMode] = useState<'light' | 'dark' | 'system'>('system')
  const [viewMode, setViewMode] = useState<'device' | 'responsive'>('device')
  const [showDangerZone, setShowDangerZone] = useState<boolean>(true)
  const effectivePreviewMode = previewMode === 'system' ? resolvedTheme : previewMode
  const SurfaceIcon = surfaceIcon[surface]
  
  const visibleSections = resolvedSections
    ? resolvedSections.filter((section) => section.enabled !== false)
    : sections.filter((section) => section.enabled !== false)

  const heroSection = visibleSections.find((s) => s.component === 'hero_banner')
  const nonHeroSections = visibleSections.filter((s) => s.component !== 'hero_banner')

  // Hero properties
  const heroProperties = heroSection?.properties || {}
  const heroTitle = text(heroProperties, 'title') || 'Kirim Paket Cepat & Hemat'
  const heroBody = text(heroProperties, 'body') || 'Diskon ongkir s.d. 30% untuk pengiriman instan hari ini'
  const heroBadge = text(heroProperties, 'badge') || 'PROMO TEMBUS'
  const heroCta = text(heroProperties, 'cta_label') || 'Pesan Sekarang'
  const heroCustomBg = text(heroProperties, 'background_color') || '#006C47'
  const heroBgImageUrl = text(heroProperties, 'background_image_url')
  const resolvedHeroBgImage = heroBgImageUrl
    ? (heroBgImageUrl.startsWith('/') ? `${adminApiRootUrl}${heroBgImageUrl}` : heroBgImageUrl)
    : null

  const isAndroidCustomer = surface === 'customer_android'
  const isMobileSurface = surface.includes('android')

  return (
    <section className="rounded-3xl border border-border bg-surface-subtle p-5 shadow-2xl shadow-scrim" aria-labelledby="experience-preview-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-primary-light">Safe schema preview</p>
          <h2 id="experience-preview-title" className="mt-1 text-lg font-black text-foreground-muted">
            {surfaceLabel[surface]} surface
          </h2>
        </div>
        <div className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface-subtle px-3 py-2 text-xs font-bold text-foreground-muted">
          <SurfaceIcon size={15} aria-hidden="true" /> Native surface contract
        </div>
      </div>

      {/* Control Bar: Theme, Mode & Guide Toggle */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-y border-border/60 py-3">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Experience preview theme">
          <span className="text-xs font-black uppercase tracking-wide text-foreground-muted">Theme</span>
          {([['light', Sun], ['dark', Moon], ['system', Monitor]] as const).map(([mode, Icon]) => (
            <button
              type="button"
              key={mode}
              onClick={() => setPreviewMode(mode)}
              aria-pressed={previewMode === mode}
              className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-black uppercase tracking-wide ${previewMode === mode ? 'border-primary bg-primary text-on-primary' : 'border-border text-foreground-secondary hover:bg-surface-subtle hover:text-foreground'}`}
            >
              <Icon size={13} aria-hidden="true" /> {mode}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* View Mode Toggle */}
          <div className="inline-flex rounded-lg border border-border bg-surface p-0.5" role="group" aria-label="Mode tampilan">
            <button
              type="button"
              onClick={() => setViewMode('device')}
              aria-pressed={viewMode === 'device'}
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-bold transition ${viewMode === 'device' ? 'bg-primary text-on-primary shadow-xs' : 'text-foreground-secondary hover:text-foreground'}`}
            >
              <Smartphone size={13} aria-hidden="true" /> Simulasi HP
            </button>
            <button
              type="button"
              onClick={() => setViewMode('responsive')}
              aria-pressed={viewMode === 'responsive'}
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-bold transition ${viewMode === 'responsive' ? 'bg-primary text-on-primary shadow-xs' : 'text-foreground-secondary hover:text-foreground'}`}
            >
              <Layers size={13} aria-hidden="true" /> Tampilan Flat
            </button>
          </div>

          {/* Guide Danger Zone Toggle */}
          {heroSection ? (
            <button
              type="button"
              onClick={() => setShowDangerZone((prev) => !prev)}
              aria-pressed={showDangerZone}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-bold transition ${showDangerZone ? 'border-warning/60 bg-warning/10 text-warning' : 'border-border text-foreground-muted hover:bg-surface-subtle'}`}
            >
              <Eye size={13} aria-hidden="true" /> Guide Card Saldo
            </button>
          ) : null}
        </div>
      </div>

      {simulation ? (
        <div role={simulation.matched ? 'status' : 'alert'} aria-live={simulation.matched ? 'polite' : 'assertive'} className={`mt-4 flex items-start gap-2 rounded-xl border p-3 text-xs ${simulation.matched ? 'border-success bg-success-surface text-success' : 'border-warning bg-warning-surface text-warning'}`}>
          {simulation.matched ? <CheckCircle2 size={16} aria-hidden="true" className="mt-0.5 shrink-0" /> : <XCircle size={16} aria-hidden="true" className="mt-0.5 shrink-0" />}
          <span>Audience simulation: <strong>{simulation.matched ? 'matched' : simulation.reason || 'not matched'}</strong>{simulation.selected_manifest?.revision ? ` · revision ${simulation.selected_manifest.revision}` : ''}</span>
        </div>
      ) : null}

      {/* Main Preview Container */}
      <div className={`theme-preview-${effectivePreviewMode} mt-5`} data-preview-theme={effectivePreviewMode}>
        {visibleSections.length === 0 ? (
          <p className="p-8 text-center text-sm text-foreground-muted">Add an enabled approved component to preview it.</p>
        ) : viewMode === 'device' && isMobileSurface ? (
          /* ========================================================================= */
          /* REALISTIC ANDROID SMARTPHONE SIMULATOR (Pixel 8 / Flagship Form Factor)  */
          /* ========================================================================= */
          <div className="mx-auto my-4 w-full max-w-[400px] rounded-[48px] border-[10px] border-slate-900 bg-slate-950 shadow-2xl overflow-hidden ring-1 ring-white/20 select-none">
            {/* Status Bar */}
            <div className="h-10 px-6 flex items-center justify-between text-white text-[12px] font-semibold bg-slate-950/70 backdrop-blur-md relative z-30">
              <div className="flex items-center gap-1.5">
                <span>10:58</span>
                <Shield size={12} className="text-emerald-400" aria-hidden="true" />
              </div>

              {/* Punch-hole camera */}
              <div className="w-3.5 h-3.5 rounded-full bg-black ring-2 ring-slate-800 shrink-0" />

              <div className="flex items-center gap-2">
                {/* 4 signal bars */}
                <div className="flex items-end gap-[1.5px] h-3" aria-hidden="true">
                  <div className="w-[2.5px] h-1 bg-white rounded-xs" />
                  <div className="w-[2.5px] h-1.5 bg-white rounded-xs" />
                  <div className="w-[2.5px] h-2 bg-white rounded-xs" />
                  <div className="w-[2.5px] h-3 bg-white rounded-xs" />
                </div>
                <Wifi size={13} className="text-white" aria-hidden="true" />
                {/* Battery Pill */}
                <div className="w-5 h-2.5 rounded-[3px] border border-white/80 p-[1px] flex items-center" aria-hidden="true">
                  <div className="h-full w-full bg-white rounded-xs" />
                </div>
              </div>
            </div>

            {/* Smartphone Screen Viewport */}
            <div className="bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 min-h-[640px] flex flex-col justify-between overflow-hidden relative">
              {/* Scrollable Mobile Content */}
              <div className="flex-1 overflow-y-auto custom-scrollbar pb-3">
                {/* === HERO & TOPBAR CONTAINER === */}
                <div
                  className="relative overflow-hidden pt-2 pb-6 px-3.5"
                  style={{
                    background: resolvedHeroBgImage
                      ? undefined
                      : `linear-gradient(180deg, ${heroCustomBg} 0%, #00462e 100%)`,
                  }}
                >
                  {resolvedHeroBgImage ? (
                    <div
                      className="absolute inset-0 bg-cover bg-top"
                      style={{ backgroundImage: `url(${resolvedHeroBgImage})` }}
                    >
                      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/20" />
                    </div>
                  ) : null}

                  {/* Top Bar: Search + Notification + Profile */}
                  <div className="relative z-10 flex items-center gap-2 mb-3">
                    <div className="flex-1 h-10 flex items-center gap-2 bg-white/95 rounded-full px-3.5 shadow-sm border border-black/5">
                      <Search size={16} className="text-[#006C47] shrink-0" aria-hidden="true" />
                      <span className="text-[12px] text-gray-500 font-medium truncate">Cari layanan, makanan...</span>
                    </div>
                    <div
                      aria-label="Notifikasi"
                      title="Notifikasi"
                      className="w-10 h-10 rounded-full bg-white/25 backdrop-blur border border-white/40 flex items-center justify-center text-white shrink-0 shadow-sm"
                    >
                      <Bell size={18} aria-hidden="true" />
                    </div>
                    <div
                      aria-label="Profil"
                      title="Profil"
                      className="w-10 h-10 rounded-full bg-white/25 backdrop-blur border border-white/40 flex items-center justify-center text-white shrink-0 shadow-sm"
                    >
                      <User size={18} aria-hidden="true" />
                    </div>
                  </div>

                  {/* Promo Hero Content */}
                  <div className="relative z-10 mt-1 min-h-[110px]">
                    {resolvedHeroBgImage ? (
                      <div className="rounded-2xl overflow-hidden shadow-md border border-white/20 aspect-[16/8] relative">
                        <img src={resolvedHeroBgImage} alt="Hero Banner Promo" className="w-full h-full object-cover" />
                      </div>
                    ) : (
                      <div className="py-2 px-1">
                        <span className="inline-block rounded-full bg-white/20 backdrop-blur px-2.5 py-0.5 text-[10px] font-bold text-white border border-white/30 mb-1.5 shadow-xs">
                          {heroBadge}
                        </span>
                        <h3 className="text-base font-black text-white leading-snug drop-shadow">
                          {heroTitle}
                        </h3>
                        {heroBody ? (
                          <p className="mt-1 text-[11px] text-white/90 leading-tight">
                            {heroBody}
                          </p>
                        ) : null}
                        {heroCta ? (
                          <span className="mt-2.5 inline-flex items-center gap-1 rounded-full bg-[#D4F73C] px-3 py-1 text-[11px] font-black text-slate-900 shadow">
                            {heroCta} →
                          </span>
                        ) : null}
                      </div>
                    )}
                  </div>

                  {/* Guide Card Saldo (Bottom Danger Zone) */}
                  {showDangerZone && heroSection ? (
                    <div
                      className="relative z-10 mt-3 mx-[-6px]"
                      style={{
                        height: 18,
                        background: 'repeating-linear-gradient(135deg, rgba(239,68,68,0.45) 0px, rgba(239,68,68,0.45) 6px, rgba(0,0,0,0.35) 6px, rgba(0,0,0,0.35) 12px)',
                        borderTop: '1.5px dashed rgba(239,68,68,0.85)',
                      }}
                    >
                      <span className="absolute inset-0 flex items-center justify-center text-[8px] font-black text-white drop-shadow">
                        Area Tertutup Card Saldo (Bottom Danger Zone)
                      </span>
                    </div>
                  ) : null}
                </div>

                {/* === FLOATING WALLETCARD (EXACT MATCH DENGAN GAMBAR 2 & ANDROID CLIENT) === */}
                {isAndroidCustomer ? (
                  <div className="relative z-20 mx-3.5 -mt-4 rounded-2xl bg-white shadow-xl border border-gray-100 p-3.5 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-[#E8F5E9] flex items-center justify-center text-[#006C47] shrink-0">
                        <CreditCard size={20} aria-hidden="true" />
                      </div>
                      <div>
                        <p className="text-[11px] text-gray-500 font-semibold leading-tight">Saldo siap dipakai</p>
                        <p className="text-[17px] font-black text-gray-900 leading-tight">Rp50.000</p>
                        <p className="text-[10px] text-gray-400">183 coins reward</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="flex flex-col items-center">
                        <div className="w-8 h-8 rounded-lg bg-[#006C47] text-white flex items-center justify-center shadow-sm">
                          <ArrowUp size={16} aria-hidden="true" />
                        </div>
                        <span className="text-[10px] font-bold text-gray-800 mt-1">Bayar</span>
                      </div>
                      <div className="flex flex-col items-center">
                        <div className="w-8 h-8 rounded-lg bg-[#006C47] text-white flex items-center justify-center shadow-sm">
                          <Plus size={16} aria-hidden="true" />
                        </div>
                        <span className="text-[10px] font-bold text-gray-800 mt-1">Top Up</span>
                      </div>
                      <div className="flex flex-col items-center">
                        <div className="w-8 h-8 rounded-lg bg-[#006C47] text-white flex items-center justify-center shadow-sm">
                          <MoreHorizontal size={16} aria-hidden="true" />
                        </div>
                        <span className="text-[10px] font-bold text-gray-800 mt-1">Lainnya</span>
                      </div>
                    </div>
                  </div>
                ) : null}

                {/* === MAIN SERVICES GRID ("Mau apa hari ini?") === */}
                {isAndroidCustomer ? (
                  <div className="mx-3.5 mt-3 rounded-2xl bg-white p-3.5 border border-gray-100 shadow-sm space-y-2.5">
                    <div>
                      <p className="text-[12px] font-black text-gray-900">Mau apa hari ini?</p>
                      <p className="text-[10px] text-gray-400">Layanan utama TEMBUS, satu tap ke pesanan.</p>
                    </div>
                    <div className="grid grid-cols-4 gap-2 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center shadow-sm border border-emerald-100">
                          <Package size={18} aria-hidden="true" />
                        </div>
                        <span className="text-[10px] font-bold text-gray-800 leading-tight">Paket Instan</span>
                      </div>
                      <div className="flex flex-col items-center gap-1">
                        <div className="w-10 h-10 rounded-2xl bg-orange-50 text-orange-600 flex items-center justify-center shadow-sm border border-orange-100">
                          <UtensilsCrossed size={18} aria-hidden="true" />
                        </div>
                        <span className="text-[10px] font-bold text-gray-800 leading-tight">Food</span>
                      </div>
                      <div className="flex flex-col items-center gap-1">
                        <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shadow-sm border border-blue-100">
                          <Truck size={18} aria-hidden="true" />
                        </div>
                        <span className="text-[10px] font-bold text-gray-800 leading-tight">Ekspedisi</span>
                      </div>
                      <div className="flex flex-col items-center gap-1 relative">
                        <span className="absolute -top-1 right-0 rounded-full bg-red-600 px-1 text-[8px] font-black text-white">SOS</span>
                        <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center shadow-sm border border-amber-100">
                          <Wrench size={18} aria-hidden="true" />
                        </div>
                        <span className="text-[10px] font-bold text-gray-800 leading-tight">Tambal Ban</span>
                      </div>
                    </div>
                  </div>
                ) : null}

                {/* === CMS SUB-SECTIONS (PROMO CAROUSEL, CAMPAIGN CARDS, ETC.) === */}
                {nonHeroSections.length > 0 ? (
                  <div className="mx-3.5 mt-3 space-y-2.5">
                    {nonHeroSections.map((section) => {
                      const properties = section.properties
                      const secTitle = text(properties, 'title') || section.component.replaceAll('_', ' ')
                      const secBody = text(properties, 'body')
                      const secCta = text(properties, 'cta_label')
                      const secImage = text(properties, 'image_asset_id') || text(properties, 'media_asset_id')

                      return (
                        <article key={section.id} className="overflow-hidden rounded-2xl border border-gray-200 bg-white p-3 shadow-xs">
                          {secImage ? (
                            <div className="flex items-center gap-2 border-b border-gray-100 bg-emerald-50/50 px-2.5 py-1.5 text-[10px] text-emerald-800 mb-2 rounded-lg">
                              <ImageIcon size={13} aria-hidden="true" /> Asset: {secImage}
                            </div>
                          ) : null}
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] font-black uppercase tracking-wide text-gray-400">{section.component}</span>
                            {text(properties, 'badge') ? (
                              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-black text-emerald-800">
                                {text(properties, 'badge')}
                              </span>
                            ) : null}
                          </div>
                          <h4 className="mt-1 text-xs font-bold text-gray-900 leading-snug">{secTitle}</h4>
                          {secBody ? <p className="mt-1 text-[11px] text-gray-600 leading-tight">{secBody}</p> : null}
                          {secCta ? (
                            <div className="mt-2 inline-flex items-center gap-1 rounded-lg bg-[#006C47] px-2.5 py-1 text-[10px] font-black text-white">
                              {secCta} <ExternalLink size={10} aria-hidden="true" />
                            </div>
                          ) : null}
                        </article>
                      )
                    })}
                  </div>
                ) : null}
              </div>

              {/* Bottom Navigation Bar */}
              <div className="border-t border-gray-200 bg-white px-4 pt-2 pb-1 flex items-center justify-around text-gray-400">
                <div className="flex flex-col items-center gap-0.5 text-[#006C47]">
                  <Home size={18} aria-hidden="true" />
                  <span className="text-[9px] font-bold">Beranda</span>
                </div>
                <div className="flex flex-col items-center gap-0.5">
                  <Clock size={18} aria-hidden="true" />
                  <span className="text-[9px] font-medium">Aktivitas</span>
                </div>
                <div className="flex flex-col items-center gap-0.5">
                  <Sparkles size={18} aria-hidden="true" />
                  <span className="text-[9px] font-medium">Promo</span>
                </div>
                <div className="flex flex-col items-center gap-0.5">
                  <User size={18} aria-hidden="true" />
                  <span className="text-[9px] font-medium">Profil</span>
                </div>
              </div>

              {/* Android Home Gesture Pill */}
              <div className="w-28 h-1 bg-slate-300 rounded-full mx-auto my-1.5" />
            </div>
          </div>
        ) : (
          /* ========================================================================= */
          /* FLAT / FULL-WIDTH EXPANDED VIEW (Desktop Web or Explicit Flat View)      */
          /* ========================================================================= */
          <div className="space-y-4">
            {visibleSections.map((section) => {
              const properties = section.properties
              const title = text(properties, 'title') || section.component.replaceAll('_', ' ')
              const body = text(properties, 'body')
              const cta = text(properties, 'cta_label')
              const image = text(properties, 'image_asset_id') || text(properties, 'media_asset_id')
              const isHero = section.component === 'hero_banner'
              const customBg = text(properties, 'background_color') || (isHero ? '#006C47' : undefined)

              if (isHero) {
                const bgImageUrl = text(properties, 'background_image_url')
                const resolvedBgImage = bgImageUrl
                  ? (bgImageUrl.startsWith('/') ? `${adminApiRootUrl}${bgImageUrl}` : bgImageUrl)
                  : null

                return (
                  <article
                    key={section.id}
                    className="overflow-hidden rounded-2xl border border-white/10 shadow-xl"
                    style={{ position: 'relative', minHeight: 220 }}
                    data-media-composition="hero-theme"
                  >
                    <div
                      className="absolute inset-0"
                      style={
                        resolvedBgImage
                          ? { backgroundImage: `url(${resolvedBgImage})`, backgroundSize: 'cover', backgroundPosition: 'top center' }
                          : { background: customBg ? `linear-gradient(180deg, ${customBg} 0%, rgba(0,0,0,0.75) 100%)` : '#006C47' }
                      }
                    />

                    {/* Top search */}
                    <div className="relative z-10 mx-4 mt-4 flex items-center gap-2 rounded-full bg-white/90 backdrop-blur px-3 py-1.5 shadow-sm max-w-md">
                      <Search aria-hidden="true" className="w-3.5 h-3.5 text-gray-400" />
                      <span className="text-[11px] text-gray-400 font-medium flex-1">Cari layanan, makanan, paket…</span>
                      <span className="text-[10px] font-black text-emerald-700 bg-emerald-100 rounded-full px-1.5 py-0.5">LANCAR</span>
                    </div>

                    {/* Hero Content */}
                    <div className="relative z-10 px-5 pt-3 pb-0" style={{ minHeight: 80 }}>
                      {text(properties, 'badge') ? (
                        <span className="inline-block rounded-full bg-white/20 backdrop-blur px-2.5 py-0.5 text-[10px] font-bold text-white border border-white/20 mb-1">
                          {text(properties, 'badge')}
                        </span>
                      ) : null}
                      {text(properties, 'title') ? (
                        <h3 className="text-base font-black text-white leading-tight drop-shadow">{text(properties, 'title')}</h3>
                      ) : null}
                      {text(properties, 'cta_label') ? (
                        <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-[#D4F73C] px-3 py-1 text-[10px] font-black text-slate-900 shadow">
                          {text(properties, 'cta_label')} →
                        </span>
                      ) : null}
                    </div>

                    {showDangerZone ? (
                      <div
                        className="relative z-10 mx-0 mt-3"
                        style={{
                          height: 18,
                          background: 'repeating-linear-gradient(135deg, rgba(239,68,68,0.45) 0px, rgba(239,68,68,0.45) 6px, rgba(0,0,0,0.35) 6px, rgba(0,0,0,0.35) 12px)',
                          borderTop: '1.5px dashed rgba(239,68,68,0.8)',
                        }}
                      >
                        <span className="absolute inset-0 flex items-center justify-center text-[8px] font-black text-white drop-shadow">
                          Area Tertutup Card Saldo (Bottom Danger Zone)
                        </span>
                      </div>
                    ) : null}

                    {/* Floating WalletCard */}
                    <div className="relative z-20 mx-4 mb-4 rounded-2xl bg-white shadow-xl border border-gray-100 p-4 flex items-center justify-between max-w-md">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-green-100 flex items-center justify-center shrink-0">
                          <CreditCard aria-hidden="true" className="w-4.5 h-4.5 text-green-600" />
                        </div>
                        <div>
                          <p className="text-[10px] text-gray-500 font-semibold">Saldo siap dipakai</p>
                          <p className="text-[15px] font-black text-gray-900 leading-tight">Rp50.000</p>
                          <p className="text-[9px] text-gray-400">183 coins reward</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex flex-col items-center">
                          <div className="w-7 h-7 rounded-lg bg-[#006C47] text-white flex items-center justify-center">
                            <ArrowUp size={14} aria-hidden="true" />
                          </div>
                          <span className="text-[9px] font-bold text-gray-800 mt-0.5">Bayar</span>
                        </div>
                        <div className="flex flex-col items-center">
                          <div className="w-7 h-7 rounded-lg bg-[#006C47] text-white flex items-center justify-center">
                            <Plus size={14} aria-hidden="true" />
                          </div>
                          <span className="text-[9px] font-bold text-gray-800 mt-0.5">Top Up</span>
                        </div>
                        <div className="flex flex-col items-center">
                          <div className="w-7 h-7 rounded-lg bg-[#006C47] text-white flex items-center justify-center">
                            <MoreHorizontal size={14} aria-hidden="true" />
                          </div>
                          <span className="text-[9px] font-bold text-gray-800 mt-0.5">Lainnya</span>
                        </div>
                      </div>
                    </div>
                  </article>
                )
              }

              return (
                <article key={section.id} className="overflow-hidden rounded-2xl border border-border bg-surface/[0.04]" data-media-composition="separate-content">
                  {image ? (
                    <div className="flex items-center gap-2 border-b border-border bg-primary/10 px-4 py-3 text-xs text-primary-light">
                      <ImageIcon size={15} aria-hidden="true" /> Asset slot: {image}
                    </div>
                  ) : null}
                  <div className="p-4">
                    {section.component === 'campaign_intro' ? (
                      <div className="mb-3 rounded-xl border border-info bg-info-surface px-3 py-2 text-xs font-black uppercase tracking-wide text-info">
                        Post-native-splash campaign intro · not the OS launch splash
                      </div>
                    ) : null}
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <span className="text-xs font-black uppercase tracking-wide text-foreground-muted">{section.component}</span>
                      {text(properties, 'badge') ? (
                        <span className="rounded-full bg-primary/15 px-2 py-1 text-xs font-black text-primary-light">
                          {text(properties, 'badge')}
                        </span>
                      ) : null}
                    </div>
                    <h3 className="text-base font-black text-foreground-muted">{title}</h3>
                    {body ? <p className="mt-2 text-sm leading-relaxed text-foreground-muted">{body}</p> : null}
                    {cta ? (
                      <div className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-xs font-black text-on-primary">
                        {cta}<ExternalLink size={13} aria-hidden="true" />
                      </div>
                    ) : null}
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </div>
      <p className="mt-4 text-xs leading-relaxed text-foreground-muted">
        Preview uses the server-resolved allowlisted component schema. It never executes remote code or records campaign exposure, and transaction screens remain native-owned.
      </p>
    </section>
  )
}

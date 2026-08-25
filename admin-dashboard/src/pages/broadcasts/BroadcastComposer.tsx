import { useMemo, useState } from 'react'
import {
  AlertCircle,
  BellRing,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  Copy,
  Image as ImageIcon,
  Loader2,
  Send,
  Smartphone,
  Users,
  X,
} from 'lucide-react'
import { cn } from '../../../lib/utils'
import { toast } from 'sonner'
import { FocusTrap } from '../../../components/a11y/FocusTrap'
import type { BroadcastRow, BroadcastTargetType } from './hooks/useBroadcasts'
import { useCreateBroadcast, broadcastErrorMessage } from './hooks/useBroadcasts'
import {
  buildTargetFilterPayload,
  useBroadcastTargetEstimate,
  useCourierSearch,
  useZones,
  type TargetFilterDraft,
} from './hooks/useBroadcastTargets'

const TITLE_MAX = 60
const BODY_MAX = 500

const CATEGORIES = [
  { value: 'system', label: 'Sistem' },
  { value: 'promo', label: 'Promo' },
  { value: 'support', label: 'Support' },
  { value: 'activity', label: 'Aktivitas' },
  { value: 'message', label: 'Pesan' },
]

const PRIORITIES = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
]

const TARGET_TYPES: Array<{ value: BroadcastTargetType; label: string; hint: string }> = [
  { value: 'all', label: 'Semua Pengguna', hint: 'Seluruh kurir & pelanggan aktif' },
  { value: 'online', label: 'Online Saja', hint: 'Kurir dengan duty toggle aktif saat ini' },
  { value: 'filter', label: 'Filter Lanjutan', hint: 'Kombinasi zona, role, capability, status akun' },
  { value: 'manual', label: 'Manual', hint: 'Pilih kurir satu per satu dari daftar' },
]

const FILTER_ROLES = [
  { value: 'courier', label: 'Courier' },
  { value: 'customer', label: 'Customer' },
]

// Backend hanya menerima service_code yang terdaftar di delivery_service_products.
const CAPABILITY_OPTIONS = [
  { value: 'food_delivery', label: 'Food Delivery' },
  { value: 'bike_delivery', label: 'Bike Delivery' },
  { value: 'car_delivery', label: 'Car Delivery' },
  { value: 'p2p_instant', label: 'P2P Instant' },
  { value: 'p2p_same_day', label: 'P2P Same Day' },
]

const ACCOUNT_STATUSES = [
  { value: '', label: 'Semua Status Akun' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'pending_verification', label: 'Pending Verification' },
]

type DeepLinkKind = 'none' | 'order' | 'finance' | 'profile' | 'custom'

const deepLinkBase = () =>
  typeof window !== 'undefined' ? window.location.origin : ''

const buildDeepLink = (
  kind: DeepLinkKind,
  customUrl: string,
  orderId: string,
): string => {
  const base = deepLinkBase()
  switch (kind) {
    case 'order':
      return orderId.trim() ? `${base}/orders/${encodeURIComponent(orderId.trim())}` : ''
    case 'finance':
      return `${base}/finance`
    case 'profile':
      return `${base}/customers`
    case 'custom':
      return customUrl.trim()
    default:
      return ''
  }
}

const priorityAccent: Record<string, string> = {
  urgent: 'border-red-500/50',
  high: 'border-amber-500/50',
  normal: 'border-white/10',
  low: 'border-zinc-700/60',
}

const priorityBadge: Record<string, string> = {
  urgent: 'bg-red-500/15 text-red-300 border-red-500/30',
  high: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  normal: 'bg-primary/10 text-primary-light border-primary/20',
  low: 'bg-zinc-800 text-zinc-400 border-white/10',
}

interface ComposerProps {
  initial?: BroadcastRow | null
  onBack: () => void
}

export default function BroadcastComposer({ initial, onBack }: ComposerProps) {
  const isDuplicate = Boolean(initial)

  // Section 1 — Konten
  const [title, setTitle] = useState(initial?.title ?? '')
  const [body, setBody] = useState(initial?.body ?? '')
  const [imageUrl, setImageUrl] = useState(initial?.image_url ?? '')
  const [deepLinkKind, setDeepLinkKind] = useState<DeepLinkKind>(
    initial?.deep_link ? 'custom' : 'none',
  )
  const [deepLinkCustom, setDeepLinkCustom] = useState(
    initial?.deep_link ? String(initial.deep_link) : '',
  )
  const [deepLinkOrderId, setDeepLinkOrderId] = useState('')
  const [category, setCategory] = useState(initial?.category ?? 'system')
  const [priority, setPriority] = useState(initial?.priority ?? 'normal')

  // Section 2 — Target
  const [targetType, setTargetType] = useState<BroadcastTargetType>(
    (initial?.target_type as BroadcastTargetType) ?? 'all',
  )
  const [filter, setFilter] = useState<TargetFilterDraft>({
    zone_ids: initial?.target_filter?.zone_ids ?? [],
    roles: initial?.target_filter?.roles ?? [],
    capabilities: initial?.target_filter?.capabilities ?? [],
    account_status: initial?.target_filter?.account_status ?? '',
  })
  const [manualRecipients, setManualRecipients] = useState<Array<{ id: string; full_name: string }>>(
    initial?.target_filter?.user_ids?.map((id) => ({ id, full_name: id })) ?? [],
  )
  const [manualSearch, setManualSearch] = useState('')

  // Section 3 — Channel & Jadwal
  const [channels, setChannels] = useState<string[]>(
    initial?.channels && initial.channels.length > 0 ? [...initial.channels] : ['push', 'in_app'],
  )
  const [scheduleMode, setScheduleMode] = useState<'now' | 'schedule'>('now')
  const [scheduledAtLocal, setScheduledAtLocal] = useState(() => {
    if (!initial?.scheduled_at) return ''
    try {
      const d = new Date(initial.scheduled_at)
      const pad = (n: number) => String(n).padStart(2, '0')
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
    } catch {
      return ''
    }
  })

  // Section 4 — Konfirmasi
  const [confirmAction, setConfirmAction] = useState<'send_now' | 'schedule' | null>(null)
  const [confirmCount, setConfirmCount] = useState<number | null>(null)

  const manualUserIds = manualRecipients.map((r) => r.id)
  const estimateQuery = useBroadcastTargetEstimate(targetType, filter, manualUserIds)
  const zonesQuery = useZones()
  const courierSearch = useCourierSearch(manualSearch)

  const createMutation = useCreateBroadcast({ onSuccessCreate: onBack })

  const deepLinkValue = useMemo(
    () => buildDeepLink(deepLinkKind, deepLinkCustom, deepLinkOrderId),
    [deepLinkKind, deepLinkCustom, deepLinkOrderId],
  )

  const estimatedCount = estimateQuery.data?.count ?? null

  const channelsLabel =
    channels.length === 0
      ? '-'
      : channels.map((c) => (c === 'push' ? 'Push FCM' : 'In-app')).join(' + ')

  const toggleChannel = (channel: string) => {
    setChannels((prev) =>
      prev.includes(channel) ? prev.filter((c) => c !== channel) : [...prev, channel],
    )
  }

  const toggleArrayItem = (
    key: keyof TargetFilterDraft,
    value: string,
  ) => {
    setFilter((prev) => {
      const list = prev[key] as string[]
      return {
        ...prev,
        [key]: list.includes(value) ? list.filter((v) => v !== value) : [...list, value],
      }
    })
  }

  const validate = (): boolean => {
    if (!title.trim() || title.trim().length > TITLE_MAX) {
      toast.error(`Judul wajib diisi maksimal ${TITLE_MAX} karakter`)
      return false
    }
    if (!body.trim() || body.trim().length > BODY_MAX) {
      toast.error(`Isi pesan wajib diisi maksimal ${BODY_MAX} karakter`)
      return false
    }
    if (imageUrl.trim() && !/^https?:\/\//i.test(imageUrl.trim())) {
      toast.error('Image URL harus dimulai dengan http(s)://')
      return false
    }
    if (deepLinkValue && !/^https?:\/\//i.test(deepLinkValue)) {
      toast.error('Deep link harus berupa URL http(s) yang valid')
      return false
    }
    if (targetType === 'manual' && manualUserIds.length === 0) {
      toast.error('Target manual membutuhkan minimal 1 penerima')
      return false
    }
    if (channels.length === 0) {
      toast.error('Pilih minimal satu channel pengiriman')
      return false
    }
    return true
  }

  const buildPayload = (status: 'draft' | 'scheduled') => ({
    title: title.trim(),
    body: body.trim(),
    image_url: imageUrl.trim() || null,
    deep_link: deepLinkValue || null,
    category,
    priority,
    channels,
    target_type: targetType,
    target_filter: buildTargetFilterPayload(targetType, filter, manualUserIds),
    status,
    scheduled_at:
      status === 'scheduled' && scheduledAtLocal
        ? new Date(scheduledAtLocal).toISOString()
        : null,
  })

  const handleSaveDraft = () => {
    if (!validate()) return
    if (createMutation.isPending) return
    createMutation.mutate({ payload: buildPayload('draft'), sendNow: false })
  }

  const handleSchedule = () => {
    if (!validate()) return
    if (!scheduledAtLocal || Number.isNaN(new Date(scheduledAtLocal).getTime())) {
      toast.error('Pilih tanggal & jam penjadwalan yang valid')
      return
    }
    if (new Date(scheduledAtLocal).getTime() <= Date.now()) {
      toast.error('Waktu jadwal harus di masa depan')
      return
    }
    setConfirmCount(estimatedCount)
    setConfirmAction('schedule')
  }

  const handleSendNow = () => {
    if (!validate()) return
    setConfirmCount(estimatedCount)
    setConfirmAction('send_now')
  }

  const confirmAndSubmit = () => {
    if (!confirmAction || createMutation.isPending) return
    createMutation.mutate({
      payload: confirmAction === 'schedule' ? buildPayload('scheduled') : buildPayload('draft'),
      sendNow: confirmAction === 'send_now',
    })
    setConfirmAction(null)
  }

  const addManualRecipient = (courier: { id: string; full_name: string }) => {
    if (manualRecipients.some((r) => r.id === courier.id)) return
    setManualRecipients((prev) => [...prev, courier])
    setManualSearch('')
  }

  const inputClass =
    'w-full bg-white/5 border border-white/10 rounded-2xl py-3 px-4 text-sm font-bold text-zinc-100 focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all placeholder:text-zinc-600 placeholder:font-medium'

  const sectionLabelClass = 'text-xs font-black uppercase tracking-[0.22em] text-zinc-600'

  return (
    <div className="space-y-8 animate-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={onBack}
            aria-label="Kembali ke daftar broadcast"
            className="p-3 rounded-2xl bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10 transition-all"
          >
            <ChevronLeft size={20} />
          </button>
          <div>
            <h1 className="text-3xl font-black text-zinc-100 tracking-tight">
              {isDuplicate ? 'Duplikat Broadcast' : 'Broadcast Baru'}
            </h1>
            <p className="text-zinc-500 mt-1 text-sm">
              Susun konten, target audiens, channel, dan jadwal pengiriman.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.6fr_1fr] gap-8 items-start">
        {/* ================= FORM SECTIONS ================= */}
        <div className="space-y-8">
          {/* SECTION 1 — KONTEN */}
          <section aria-labelledby="bc-section-konten" className="glass-card rounded-[32px] border-white/5 p-8 space-y-6">
            <h2 id="bc-section-konten" className={cn(sectionLabelClass, 'flex items-center gap-2')}>
              <BellRing size={14} /> 1. Konten
            </h2>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label htmlFor="bc-title" className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Judul</label>
                <span className={cn('text-[10px] font-black tabular-nums', title.length > TITLE_MAX ? 'text-red-400' : 'text-zinc-600')}>
                  {title.length}/{TITLE_MAX}
                </span>
              </div>
              <input
                id="bc-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={TITLE_MAX}
                placeholder="Contoh: Maintenance Sistem Malam Ini"
                className={inputClass}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label htmlFor="bc-body" className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Isi Pesan</label>
                <span className={cn('text-[10px] font-black tabular-nums', body.length > BODY_MAX ? 'text-red-400' : 'text-zinc-600')}>
                  {body.length}/{BODY_MAX}
                </span>
              </div>
              <textarea
                id="bc-body"
                rows={5}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                maxLength={BODY_MAX}
                placeholder="Tulis isi broadcast yang akan diterima kurir..."
                className={cn(inputClass, 'resize-none leading-relaxed')}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="bc-image-url" className="text-[10px] font-black uppercase tracking-widest text-zinc-500 flex items-center gap-2">
                <ImageIcon size={12} /> Gambar (Opsional — URL)
              </label>
              <input
                id="bc-image-url"
                type="url"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://cdn.contoh.com/banner.jpg"
                className={inputClass}
              />
              {imageUrl.trim() && /^https?:\/\//i.test(imageUrl.trim()) && (
                <img
                  src={imageUrl}
                  alt="Preview gambar broadcast"
                  className="mt-2 max-h-40 rounded-2xl border border-white/10 object-cover"
                  onError={(e) => {
                    ;(e.target as HTMLImageElement).style.display = 'none'
                  }}
                />
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label htmlFor="bc-deeplink-kind" className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Deep Link</label>
                <select
                  id="bc-deeplink-kind"
                  value={deepLinkKind}
                  onChange={(e) => setDeepLinkKind(e.target.value as DeepLinkKind)}
                  className={cn(inputClass, 'appearance-none')}
                >
                  <option value="none">None</option>
                  <option value="order">Order Detail</option>
                  <option value="finance">Payout / Finance</option>
                  <option value="profile">Profile</option>
                  <option value="custom">Custom URL</option>
                </select>
              </div>

              {deepLinkKind === 'order' && (
                <div className="space-y-2">
                  <label htmlFor="bc-deeplink-order" className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Order ID</label>
                  <input
                    id="bc-deeplink-order"
                    type="text"
                    value={deepLinkOrderId}
                    onChange={(e) => setDeepLinkOrderId(e.target.value)}
                    placeholder="UUID order tujuan"
                    className={inputClass}
                  />
                </div>
              )}

              {deepLinkKind === 'custom' && (
                <div className="space-y-2">
                  <label htmlFor="bc-deeplink-custom" className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Custom Deep Link URL</label>
                  <input
                    id="bc-deeplink-custom"
                    type="url"
                    value={deepLinkCustom}
                    onChange={(e) => setDeepLinkCustom(e.target.value)}
                    placeholder="https://..."
                    className={inputClass}
                  />
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label htmlFor="bc-category" className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Kategori</label>
                <select
                  id="bc-category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className={cn(inputClass, 'appearance-none')}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>
              <fieldset className="space-y-2">
                <legend className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-2">Prioritas</legend>
                <div className="flex flex-wrap gap-2">
                  {PRIORITIES.map((p) => (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => setPriority(p.value)}
                      aria-pressed={priority === p.value}
                      className={cn(
                        'px-4 py-2 rounded-xl text-xs font-black transition-all border',
                        priority === p.value
                          ? priorityBadge[p.value]
                          : 'bg-white/5 text-zinc-500 border-transparent hover:text-zinc-300',
                      )}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </fieldset>
            </div>
          </section>

          {/* SECTION 2 — TARGET */}
          <section aria-labelledby="bc-section-target" className="glass-card rounded-[32px] border-white/5 p-8 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <h2 id="bc-section-target" className={cn(sectionLabelClass, 'flex items-center gap-2')}>
                <Users size={14} /> 2. Target Audiens
              </h2>
              <div
                role="status"
                aria-live="polite"
                className="flex items-center gap-2 rounded-xl bg-primary/10 border border-primary/20 px-4 py-2"
              >
                {estimateQuery.isFetching ? (
                  <>
                    <Loader2 size={14} className="animate-spin text-primary-light" />
                    <span className="text-[11px] font-black text-primary-light uppercase tracking-widest">Menghitung...</span>
                  </>
                ) : estimateQuery.isError ? (
                  <>
                    <AlertCircle size={14} className="text-red-400" />
                    <span className="text-[11px] font-bold text-red-300">Estimasi gagal dimuat</span>
                  </>
                ) : (
                  <>
                    <Users size={14} className="text-primary-light" />
                    <span className="text-[13px] font-black text-primary-light tabular-nums">
                      Akan dikirim ke ±{estimatedCount?.toLocaleString('id-ID') ?? '—'} penerima
                    </span>
                  </>
                )}
              </div>
            </div>

            <fieldset className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <legend className="sr-only">Tipe target audiens</legend>
              {TARGET_TYPES.map((t) => (
                <label
                  key={t.value}
                  className={cn(
                    'cursor-pointer rounded-2xl border p-4 transition-all',
                    targetType === t.value
                      ? 'border-primary/40 bg-primary/10'
                      : 'border-white/10 bg-white/[0.02] hover:border-white/20',
                  )}
                >
                  <input
                    type="radio"
                    name="bc-target-type"
                    value={t.value}
                    checked={targetType === t.value}
                    onChange={() => setTargetType(t.value)}
                    className="sr-only"
                  />
                  <span className="block text-sm font-black text-zinc-100">{t.label}</span>
                  <span className="block text-[11px] text-zinc-500 mt-1">{t.hint}</span>
                </label>
              ))}
            </fieldset>

            {targetType === 'filter' && (
              <div className="space-y-6 rounded-3xl border border-white/10 bg-white/[0.02] p-6">
                <div className="space-y-2">
                  <label htmlFor="bc-filter-zone" className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Zona</label>
                  {zonesQuery.isLoading ? (
                    <p className="text-xs text-zinc-600 italic">Memuat zona...</p>
                  ) : zonesQuery.isError ? (
                    <p className="text-xs text-red-300 italic">Gagal memuat daftar zona.</p>
                  ) : (zonesQuery.data?.length ?? 0) === 0 ? (
                    <p className="text-xs text-zinc-600 italic">Belum ada zona terdaftar.</p>
                  ) : (
                    <div id="bc-filter-zone" role="group" aria-label="Filter zona" className="flex flex-wrap gap-2">
                      {zonesQuery.data!.map((zone) => (
                        <button
                          key={zone.id}
                          type="button"
                          onClick={() => toggleArrayItem('zone_ids', zone.id)}
                          aria-pressed={filter.zone_ids.includes(zone.id)}
                          className={cn(
                            'px-3 py-1.5 rounded-lg text-xs font-bold border transition-all',
                            filter.zone_ids.includes(zone.id)
                              ? 'bg-primary/20 text-primary-light border-primary/30'
                              : 'bg-white/5 text-zinc-400 border-transparent hover:text-white',
                          )}
                        >
                          {zone.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <fieldset className="space-y-2">
                  <legend className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-2">Role</legend>
                  <div className="flex flex-wrap gap-2">
                    {FILTER_ROLES.map((role) => (
                      <label
                        key={role.value}
                        className={cn(
                          'flex cursor-pointer items-center gap-2 rounded-xl border px-4 py-2 text-xs font-bold transition-all',
                          filter.roles.includes(role.value)
                            ? 'border-primary/30 bg-primary/10 text-primary-light'
                            : 'border-white/10 bg-white/5 text-zinc-400 hover:text-white',
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={filter.roles.includes(role.value)}
                          onChange={() => toggleArrayItem('roles', role.value)}
                          className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-primary focus:ring-primary/50"
                        />
                        {role.label}
                      </label>
                    ))}
                  </div>
                </fieldset>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 block">Capabilities (service)</label>
                  <div className="flex flex-wrap gap-2">
                    {CAPABILITY_OPTIONS.map((cap) => (
                      <button
                        key={cap.value}
                        type="button"
                        onClick={() => toggleArrayItem('capabilities', cap.value)}
                        aria-pressed={filter.capabilities.includes(cap.value)}
                        className={cn(
                          'px-3 py-1.5 rounded-lg text-xs font-bold border transition-all',
                          filter.capabilities.includes(cap.value)
                            ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                            : 'bg-white/5 text-zinc-400 border-transparent hover:text-white',
                        )}
                      >
                        {cap.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2 max-w-xs">
                  <label htmlFor="bc-filter-status" className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Status Akun</label>
                  <select
                    id="bc-filter-status"
                    value={filter.account_status}
                    onChange={(e) => setFilter((prev) => ({ ...prev, account_status: e.target.value }))}
                    className={cn(inputClass, 'appearance-none')}
                  >
                    {ACCOUNT_STATUSES.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {targetType === 'manual' && (
              <div className="space-y-4 rounded-3xl border border-white/10 bg-white/[0.02] p-6">
                <div className="relative">
                  <label htmlFor="bc-manual-search" className="text-[10px] font-black uppercase tracking-widest text-zinc-500 block mb-2">Cari Kurir</label>
                  <input
                    id="bc-manual-search"
                    type="search"
                    role="combobox"
                    aria-expanded={courierSearch.data && courierSearch.data.length > 0}
                    value={manualSearch}
                    onChange={(e) => setManualSearch(e.target.value)}
                    placeholder="Nama / nomor telepon / plat..."
                    className={inputClass}
                  />
                  {manualSearch.trim().length >= 2 && (
                    <ul
                      role="listbox"
                      aria-label="Hasil pencarian kurir"
                      className="absolute z-20 mt-2 w-full max-h-56 overflow-y-auto rounded-2xl border border-white/10 bg-zinc-950 shadow-2xl shadow-black/60 divide-y divide-white/5"
                    >
                      {courierSearch.isFetching && (
                        <li className="px-4 py-3 text-xs text-zinc-500 flex items-center gap-2">
                          <Loader2 size={14} className="animate-spin" /> Mencari...
                        </li>
                      )}
                      {!courierSearch.isFetching && (courierSearch.data?.length ?? 0) === 0 && (
                        <li className="px-4 py-3 text-xs text-zinc-600 italic">Tidak ada hasil.</li>
                      )}
                      {courierSearch.data?.map((courier) => (
                        <li key={courier.id}>
                          <button
                            type="button"
                            role="option"
                            aria-selected={false}
                            onClick={() => addManualRecipient(courier)}
                            className="w-full text-left px-4 py-3 hover:bg-white/5 transition-colors"
                          >
                            <span className="block text-sm font-bold text-zinc-100">{courier.full_name}</span>
                            <span className="block text-[11px] text-zinc-500">
                              {courier.phone_number || '—'} • {courier.plate_number || 'No plate'}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {manualRecipients.length > 0 ? (
                  <ul className="space-y-2" aria-label="Penerima manual terpilih">
                    {manualRecipients.map((recipient) => (
                      <li key={recipient.id} className="flex items-center justify-between rounded-xl bg-white/5 border border-white/5 px-4 py-2">
                        <span className="text-xs font-bold text-zinc-200 truncate">
                          {recipient.full_name === recipient.id ? recipient.id : recipient.full_name}
                          {recipient.full_name !== recipient.id && (
                            <span className="ml-2 text-[10px] text-zinc-500 font-mono">{recipient.id}</span>
                          )}
                        </span>
                        <button
                          type="button"
                          onClick={() => setManualRecipients((prev) => prev.filter((r) => r.id !== recipient.id))}
                          aria-label={`Hapus penerima ${recipient.full_name}`}
                          className="p-1 rounded-lg text-zinc-500 hover:text-red-400 transition-colors"
                        >
                          <X size={14} />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-zinc-600 italic">Belum ada penerima manual dipilih.</p>
                )}
              </div>
            )}
          </section>

          {/* SECTION 3 — CHANNEL & JADWAL */}
          <section aria-labelledby="bc-section-channel" className="glass-card rounded-[32px] border-white/5 p-8 space-y-6">
            <h2 id="bc-section-channel" className={sectionLabelClass}>3. Channel &amp; Jadwal</h2>

            <fieldset>
              <legend className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-3">Channel Pengiriman</legend>
              <div className="flex flex-wrap gap-3">
                {[
                  { id: 'push', label: 'Push (FCM)', icon: Send },
                  { id: 'in_app', label: 'In-app', icon: Smartphone },
                ].map((ch) => (
                  <label
                    key={ch.id}
                    className={cn(
                      'flex cursor-pointer items-center gap-3 rounded-2xl border px-5 py-3 transition-all',
                      channels.includes(ch.id)
                        ? 'border-primary/30 bg-primary/10 text-primary-light'
                        : 'border-white/10 bg-white/5 text-zinc-500 hover:text-zinc-300',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={channels.includes(ch.id)}
                      onChange={() => toggleChannel(ch.id)}
                      className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-primary focus:ring-primary/50"
                    />
                    <ch.icon size={16} />
                    <span className="text-xs font-black uppercase tracking-widest">{ch.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="space-y-4">
              <legend className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-3">Waktu Kirim</legend>
              <div className="flex flex-wrap gap-3">
                {[
                  { value: 'now', label: 'Kirim Sekarang' },
                  { value: 'schedule', label: 'Jadwalkan' },
                ].map((mode) => (
                  <label
                    key={mode.value}
                    className={cn(
                      'flex cursor-pointer items-center gap-2 rounded-xl border px-4 py-2 text-xs font-black uppercase tracking-widest transition-all',
                      scheduleMode === mode.value
                        ? 'border-primary/30 bg-primary/10 text-primary-light'
                        : 'border-white/10 bg-white/5 text-zinc-500 hover:text-zinc-300',
                    )}
                  >
                    <input
                      type="radio"
                      name="bc-schedule-mode"
                      value={mode.value}
                      checked={scheduleMode === mode.value}
                      onChange={() => setScheduleMode(mode.value as 'now' | 'schedule')}
                      className="sr-only"
                    />
                    {mode.label}
                  </label>
                ))}
              </div>
              {scheduleMode === 'schedule' && (
                <div className="flex flex-wrap items-end gap-3 max-w-md">
                  <div className="flex-1 min-w-[240px] space-y-2">
                    <label htmlFor="bc-schedule-at" className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Tanggal &amp; Jam</label>
                    <input
                      id="bc-schedule-at"
                      type="datetime-local"
                      value={scheduledAtLocal}
                      onChange={(e) => setScheduledAtLocal(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                  <span className="pb-3 text-[10px] font-black uppercase tracking-widest text-zinc-600 flex items-center gap-1">
                    <CalendarClock size={12} /> WIB
                  </span>
                </div>
              )}
            </fieldset>
          </section>

          {/* SECTION 4 — PREVIEW & KONFIRMASI */}
          <section aria-labelledby="bc-section-preview" className="glass-card rounded-[32px] border-white/5 p-8 space-y-6">
            <h2 id="bc-section-preview" className={sectionLabelClass}>4. Ringkasan &amp; Kirim</h2>

            <dl className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
              {[
                ['Kategori', CATEGORIES.find((c) => c.value === category)?.label ?? category],
                ['Prioritas', PRIORITIES.find((p) => p.value === priority)?.label ?? priority],
                ['Target', TARGET_TYPES.find((t) => t.value === targetType)?.label ?? targetType],
                [
                  'Jadwal',
                  scheduleMode === 'now'
                    ? 'Segera'
                    : scheduledAtLocal
                      ? new Date(scheduledAtLocal).toLocaleString('id-ID')
                      : 'Belum dipilih',
                ],
              ].map(([term, value]) => (
                <div key={term} className="rounded-2xl bg-white/[0.03] border border-white/5 p-4">
                  <dt className="text-[9px] font-black uppercase tracking-widest text-zinc-600">{term}</dt>
                  <dd className="mt-1 font-bold text-zinc-200 truncate">{value}</dd>
                </div>
              ))}
            </dl>

            <div className="flex flex-wrap gap-3 pt-2">
              <button
                type="button"
                onClick={handleSaveDraft}
                disabled={createMutation.isPending}
                className="inline-flex items-center gap-2 px-6 py-3.5 rounded-2xl bg-white/5 border border-white/10 text-zinc-300 text-xs font-black uppercase tracking-widest hover:bg-white/10 transition-all disabled:opacity-50"
              >
                <Copy size={15} />
                Simpan Draft
              </button>
              {scheduleMode === 'schedule' ? (
                <button
                  type="button"
                  onClick={handleSchedule}
                  disabled={createMutation.isPending}
                  className="inline-flex items-center gap-2 px-6 py-3.5 rounded-2xl bg-amber-500 text-zinc-950 text-xs font-black uppercase tracking-widest shadow-lg shadow-amber-500/20 hover:bg-amber-400 transition-all disabled:opacity-50"
                >
                  <CalendarClock size={15} />
                  Jadwalkan
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSendNow}
                  disabled={createMutation.isPending}
                  className="inline-flex items-center gap-2 px-6 py-3.5 rounded-2xl bg-primary text-white text-xs font-black uppercase tracking-widest shadow-lg shadow-primary/20 hover:bg-primary-light hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
                >
                  <Send size={15} />
                  Kirim Sekarang
                </button>
              )}
            </div>
          </section>
        </div>

        {/* ================= LIVE PREVIEW ================= */}
        <aside aria-label="Preview notifikasi" className="xl:sticky xl:top-4 space-y-6">
          <div className="rounded-[36px] border border-white/10 bg-gradient-to-b from-zinc-900 to-zinc-950 p-6 shadow-2xl shadow-black/50">
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-zinc-600 mb-4 flex items-center gap-2">
              <Smartphone size={12} /> Preview Push Notification
            </p>
            <div className={cn('rounded-2xl border bg-zinc-900 p-4 shadow-lg', priorityAccent[priority])}>
              <div className="flex items-start gap-3">
                <div className="shrink-0 h-10 w-10 rounded-xl bg-primary/20 border border-primary/20 flex items-center justify-center text-primary-light">
                  <BellRing size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">TEM BUS</p>
                    <span className="text-[9px] text-zinc-600">sekarang</span>
                  </div>
                  <p className="mt-1 text-sm font-black text-zinc-100 truncate">
                    {title || 'Judul notifikasi'}
                  </p>
                  <p className="mt-1 text-xs text-zinc-400 line-clamp-3 leading-relaxed break-words">
                    {body || 'Isi pesan akan tampil di sini...'}
                  </p>
                </div>
              </div>
              {imageUrl.trim() && /^https?:\/\//i.test(imageUrl.trim()) && (
                <img
                  src={imageUrl}
                  alt=""
                  className="mt-3 h-28 w-full rounded-xl object-cover border border-white/10"
                />
              )}
            </div>
          </div>

          <div className="rounded-[36px] border border-white/10 bg-zinc-900/60 p-6">
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-zinc-600 mb-4">Preview In-app Card</p>
            <div className="rounded-2xl bg-white/5 border border-white/10 p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-black text-zinc-100">{title || 'Judul notifikasi'}</p>
                  <p className="mt-1.5 text-xs text-zinc-400 leading-relaxed break-words">
                    {body || 'Isi pesan in-app akan tampil di sini.'}
                  </p>
                </div>
                <span className={cn('shrink-0 px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border', priorityBadge[priority])}>
                  {priority}
                </span>
              </div>
              {deepLinkValue && (
                <p className="mt-3 text-[10px] font-black uppercase tracking-widest text-primary-light truncate">
                  Buka detail →
                </p>
              )}
            </div>
            <p className="mt-4 text-[10px] text-zinc-600 leading-relaxed">
              Channel aktif: <span className="font-black text-zinc-400">{channelsLabel}</span>. Notifikasi push muncul di system tray, card in-app muncul di inbox aplikasi.
            </p>
          </div>
        </aside>
      </div>

      {/* CONFIRM MODAL */}
      {confirmAction && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-6">
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => setConfirmAction(null)}
            aria-hidden="true"
          />
          <FocusTrap className="relative z-10 outline-none">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="bc-confirm-title"
              className="glass-card w-full max-w-md p-8 rounded-[32px] border-white/10"
            >
              <div className="flex items-start gap-4">
                <div className="p-3 rounded-2xl bg-primary/10 text-primary-light shrink-0">
                  <Send size={22} />
                </div>
                <div>
                  <h2 id="bc-confirm-title" className="text-xl font-black text-zinc-100">
                    {confirmAction === 'schedule' ? 'Jadwalkan Broadcast?' : 'Kirim Broadcast?'}
                  </h2>
                  <p className="text-sm text-zinc-400 mt-2 leading-relaxed">
                    Kirim ke ±{(confirmCount ?? 0).toLocaleString('id-ID')} penerima via{' '}
                    <span className="font-black text-zinc-200">{channelsLabel}</span>
                    {confirmAction === 'schedule' && scheduledAtLocal && (
                      <> pada {new Date(scheduledAtLocal).toLocaleString('id-ID')}</>
                    )}
                    ?
                  </p>
                  <p className="text-[11px] text-zinc-600 mt-2">
                    Aksi ini masuk rate limit kirim per jam admin dan tidak dapat dibatalkan setelah status menjadi sending.
                  </p>
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-8">
                <button
                  type="button"
                  onClick={() => setConfirmAction(null)}
                  className="px-5 py-2.5 rounded-xl font-bold text-sm text-zinc-400 hover:text-white transition-colors"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={confirmAndSubmit}
                  disabled={createMutation.isPending}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-primary text-white font-black text-xs uppercase tracking-widest hover:bg-primary-light transition-colors disabled:opacity-50"
                >
                  {createMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                  Ya, Lanjutkan
                </button>
              </div>
            </div>
          </FocusTrap>
        </div>
      )}

      {createMutation.isError && (
        <p role="alert" className="text-xs font-bold text-red-400">
          {broadcastErrorMessage(createMutation.error, 'Gagal menyimpan broadcast')}
        </p>
      )}
    </div>
  )
}

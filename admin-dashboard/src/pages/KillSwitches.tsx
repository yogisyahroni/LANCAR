import { useMemo, useState } from 'react'
import { Ban, Bell, Clock3, RefreshCw, ShieldAlert } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '../lib/api'
import { useAuthStore } from '../store/useAuthStore'
import { EXPERIENCE_CAPABILITIES, hasExperiencePermission } from '../lib/experiencePermissions'
import KillSwitchConfirmation from '../components/experience/KillSwitchConfirmation'

type KillSwitchType = 'marketing_hide' | 'new_order_gate' | 'provider_gate' | 'checkout_gate'
type Control = {
  id: string
  key: string
  name: string
  description: string
  kill_switch_type: KillSwitchType
  service_code: string
  service_category: string | null
  market_codes: string[]
  city_codes: string[]
  zone_codes: string[]
  surface: string | null
  fallback_behavior: string
  starts_at: string | null
  expires_at: string | null
  review_at: string | null
  preserve_active_orders: boolean
  active: boolean
  is_enabled: boolean
  last_reason: string | null
}

type Form = {
  key: string
  name: string
  description: string
  kill_switch_type: KillSwitchType
  service_code: string
  service_category: string
  market_codes: string
  city_codes: string
  zone_codes: string
  surface: string
  starts_at: string
  expires_at: string
  review_at: string
  preserve_active_orders: boolean
  active: boolean
  reason: string
  rollback_plan: string
}

const emptyForm = (): Form => ({
  key: '',
  name: 'Service operational control',
  description: 'Controlled service availability action',
  kill_switch_type: 'marketing_hide',
  service_code: 'food_delivery',
  service_category: 'food',
  market_codes: 'id-jk',
  city_codes: '',
  zone_codes: '',
  surface: '',
  starts_at: '',
  expires_at: '',
  review_at: '',
  preserve_active_orders: true,
  active: false,
  reason: '',
  rollback_plan: 'Review provider health, then restore this control after the incident is resolved and the scope is verified.',
})

const listValue = (value: string) => value.split(',').map((item) => item.trim().toLowerCase()).filter(Boolean)
const dateValue = (value: string) => value ? new Date(value).toISOString() : undefined
const requestKey = () => `admin.experience_service_control.upsert.${crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`
const errorMessage = (error: any) => error?.response?.data?.message || error?.response?.data?.error || error?.message || 'Service control gagal disimpan'

const typeLabel: Record<KillSwitchType, string> = {
  marketing_hide: 'Marketing hide',
  new_order_gate: 'New order gate',
  provider_gate: 'Provider gate',
  checkout_gate: 'Checkout gate',
}

const impactText: Record<KillSwitchType, string> = {
  marketing_hide: 'Entry/promo disembunyikan saja; transaksi tidak diubah.',
  new_order_gate: 'Order baru ditolak; active order dan support tetap reachable.',
  provider_gate: 'Capability provider tertentu dihentikan tanpa menghapus service.',
  checkout_gate: 'Checkout/payment initiation baru dihentikan.',
}

const formFromControl = (control: Control): Form => ({
  ...emptyForm(),
  key: control.key,
  name: control.name,
  description: control.description,
  kill_switch_type: control.kill_switch_type,
  service_code: control.service_code,
  service_category: control.service_category || '',
  market_codes: control.market_codes.join(', '),
  city_codes: control.city_codes.join(', '),
  zone_codes: control.zone_codes.join(', '),
  surface: control.surface || '',
  starts_at: control.starts_at?.slice(0, 16) || '',
  expires_at: control.expires_at?.slice(0, 16) || '',
  review_at: control.review_at?.slice(0, 16) || '',
  preserve_active_orders: control.preserve_active_orders,
  active: control.is_enabled,
  reason: '',
})

export default function KillSwitches() {
  const { user } = useAuthStore()
  const canMutate = hasExperiencePermission(user, EXPERIENCE_CAPABILITIES.killSwitchExecute)
  const queryClient = useQueryClient()
  const [form, setForm] = useState<Form>(() => emptyForm())
  const [confirmOpen, setConfirmOpen] = useState(false)
  const controlsQuery = useQuery({
    queryKey: ['experience-service-controls'],
    queryFn: async (): Promise<Control[]> => (await api.get('/admin/experience/service-controls')).data?.data ?? [],
  })
  const controls = controlsQuery.data ?? []
  const selectedImpact = useMemo(() => impactText[form.kill_switch_type], [form.kill_switch_type])
  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((previous) => ({ ...previous, [key]: value }))

  const saveMutation = useMutation({
    mutationFn: async () => api.post('/admin/experience/service-controls', {
      ...(form.key ? { key: form.key } : {}),
      name: form.name,
      description: form.description,
      kill_switch_type: form.kill_switch_type,
      service_code: form.service_code,
      service_category: form.service_category || undefined,
      market_codes: listValue(form.market_codes),
      city_codes: listValue(form.city_codes),
      zone_codes: listValue(form.zone_codes),
      surface: form.surface || undefined,
      starts_at: dateValue(form.starts_at),
      expires_at: dateValue(form.expires_at),
      review_at: dateValue(form.review_at),
      preserve_active_orders: form.preserve_active_orders,
      active: form.active,
      reason: form.reason.trim(),
      rollback_plan: form.rollback_plan.trim(),
    }, { headers: { 'X-Idempotency-Key': requestKey() } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['experience-service-controls'] })
      setConfirmOpen(false)
      setForm((previous) => ({ ...previous, reason: '' }))
      toast.success('Service control tersimpan dan notifikasi ops dikirim')
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const submit = () => {
    if (!canMutate) return toast.error('Anda tidak memiliki izin menjalankan service control')
    if (!form.service_code.trim() || form.reason.trim().length < 3) return toast.error('Service code dan alasan wajib diisi')
    if (form.rollback_plan.trim().length < 20) return toast.error('Rollback plan minimal 20 karakter')
    setConfirmOpen(true)
  }

  return (
    <div className="space-y-8 animate-in">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div><h1 className="flex items-center gap-3 text-3xl font-black tracking-tight text-foreground-muted"><Ban className="text-error" size={26}  aria-hidden="true"/>Kill Switches</h1><p className="mt-2 max-w-3xl text-sm leading-relaxed text-foreground-muted">Kontrol service operational yang semantisnya dibedakan dari marketing visibility. Semua perubahan memakai source of truth feature flags yang sama dengan backend.</p></div>
        <button type="button" onClick={() => controlsQuery.refetch()} className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-3 text-xs font-black uppercase tracking-widest text-foreground-muted"><RefreshCw size={14} aria-hidden="true" /> Refresh</button>
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <section className="space-y-4 rounded-3xl border border-border bg-surface/[0.03] p-5" aria-labelledby="kill-switch-list-title">
          <div className="flex items-center justify-between"><h2 id="kill-switch-list-title" className="text-sm font-black uppercase tracking-wider text-foreground-muted">Service controls</h2><Bell size={16} className="text-foreground-muted" aria-hidden="true" /></div>
          {controlsQuery.isError ? <p className="rounded-2xl bg-error-surface p-4 text-sm text-error">Control list gagal dimuat.</p> : null}
          <div className="space-y-3">{controls.map((control) => <button type="button" key={control.key} onClick={() => setForm(formFromControl(control))} className={`w-full rounded-2xl border p-4 text-left transition ${form.key === control.key ? 'border-primary/50 bg-primary/10' : 'border-border bg-surface-subtle hover:border-border'}`}><div className="flex flex-wrap items-center justify-between gap-2"><span className="font-black text-foreground-muted">{control.name}</span><span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-widest ${control.active ? 'bg-error-surface text-error' : 'bg-surface-raised text-foreground-muted'}`}>{control.active ? 'active' : 'off'}</span></div><p className="mt-2 text-xs text-primary-light">{typeLabel[control.kill_switch_type]} · {control.service_code}</p><p className="mt-1 text-xs text-foreground-muted">{control.market_codes.join(', ') || 'global'}{control.city_codes.length ? ` · ${control.city_codes.join(', ')}` : ''}</p><p className="mt-2 text-xs text-foreground-muted">{control.last_reason || 'Belum ada alasan terakhir'}</p></button>)}</div>
          {!controlsQuery.isLoading && controls.length === 0 ? <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-foreground-muted">Belum ada typed service control.</p> : null}
        </section>
        <section className="space-y-4 rounded-3xl border border-border bg-surface/[0.03] p-5" aria-labelledby="kill-switch-editor-title">
          <div><h2 id="kill-switch-editor-title" className="text-sm font-black uppercase tracking-wider text-foreground-muted">Control editor</h2><p className="mt-1 text-xs leading-relaxed text-foreground-muted">Scope kosong berarti global. Untuk high-impact control, backend tetap mewajibkan role elevated dan TOTP.</p></div>
          <div className="grid gap-3 md:grid-cols-2">
            {([['name', 'Name'], ['service_code', 'Service code'], ['service_category', 'Category'], ['market_codes', 'Market codes'], ['city_codes', 'City codes'], ['zone_codes', 'Zone codes'], ['surface', 'Surface']] as const).map(([key, label]) => <label key={key} className="text-xs font-bold text-foreground-muted">{label}<input className="mt-1 w-full rounded-xl border border-border bg-surface-subtle px-3 py-2.5 text-sm text-foreground-muted" value={form[key]} onChange={(event) => set(key, event.target.value)} placeholder={key === 'market_codes' ? 'id-jk' : ''} /></label>)}
            <label className="text-xs font-bold text-foreground-muted">Control type<select className="mt-1 w-full rounded-xl border border-border bg-surface-subtle px-3 py-2.5 text-sm text-foreground-muted" value={form.kill_switch_type} onChange={(event) => set('kill_switch_type', event.target.value as KillSwitchType)}>{Object.entries(typeLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            {([['starts_at', 'Starts at'], ['expires_at', 'Expires at'], ['review_at', 'Review at']] as const).map(([key, label]) => <label key={key} className="text-xs font-bold text-foreground-muted">{label}<input type="datetime-local" className="mt-1 w-full rounded-xl border border-border bg-surface-subtle px-3 py-2.5 text-sm text-foreground-muted" value={form[key]} onChange={(event) => set(key, event.target.value)} /></label>)}
          </div>
          <div className="rounded-2xl border border-info bg-info/[0.06] p-4 text-xs leading-relaxed text-info"><div className="flex items-center gap-2 font-black"><ShieldAlert size={15} aria-hidden="true" />Blast radius sebelum eksekusi</div><p className="mt-2 text-info">{selectedImpact}</p><p className="mt-2 text-info">Expiry atau review time dapat diisi untuk mencegah control tertinggal aktif.</p></div>
          <label className="flex items-center gap-3 text-xs font-bold text-foreground-muted"><input type="checkbox" checked={form.active} onChange={(event) => set('active', event.target.checked)} /> Control aktif setelah disimpan</label>
          <label className="flex items-center gap-3 text-xs font-bold text-foreground-muted"><input type="checkbox" checked={form.preserve_active_orders} onChange={(event) => set('preserve_active_orders', event.target.checked)} /> Pertahankan akses active orders/tracking/support</label>
          <label className="text-xs font-bold text-foreground-muted">Description<textarea className="mt-1 min-h-20 w-full rounded-xl border border-border bg-surface-subtle px-3 py-2.5 text-sm text-foreground-muted" value={form.description} onChange={(event) => set('description', event.target.value)} /></label>
          <label className="text-xs font-bold text-foreground-muted">Reason (wajib)<textarea className="mt-1 min-h-20 w-full rounded-xl border border-border bg-surface-subtle px-3 py-2.5 text-sm text-foreground-muted" value={form.reason} onChange={(event) => set('reason', event.target.value)} placeholder="Contoh: provider food timeout meningkat di id-jk" /></label>
          <label className="text-xs font-bold text-foreground-muted">Rollback plan (wajib untuk high impact)<textarea className="mt-1 min-h-24 w-full rounded-xl border border-border bg-surface-subtle px-3 py-2.5 text-sm text-foreground-muted" value={form.rollback_plan} onChange={(event) => set('rollback_plan', event.target.value)} /></label>
          <div className="flex items-start gap-2 rounded-2xl border border-border bg-surface-subtle p-3 text-xs text-foreground-muted"><Clock3 size={15} className="mt-0.5 shrink-0" aria-hidden="true" />Marketing hide hanya memengaruhi discovery. New-order/provider/checkout gate akan divalidasi ulang oleh backend sesuai tipe control.</div>
          <button type="button" onClick={submit} disabled={!canMutate || saveMutation.isPending} className="w-full rounded-xl bg-primary px-4 py-3 text-xs font-black uppercase tracking-widest text-on-primary disabled:opacity-50">{saveMutation.isPending ? 'Saving...' : 'Review & save control'}</button>
        </section>
      </div>
      <KillSwitchConfirmation open={confirmOpen} busy={saveMutation.isPending} serviceCode={form.service_code} switchType={form.kill_switch_type} active={form.active} reason={form.reason} preserveActiveOrders={form.preserve_active_orders} onCancel={() => setConfirmOpen(false)} onConfirm={() => saveMutation.mutate()} />
    </div>
  )
}

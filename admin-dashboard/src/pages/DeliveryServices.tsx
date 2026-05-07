import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Save, Truck, Loader2, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '../lib/api'
import { cn } from '../lib/utils'

type DeliveryService = {
  code: string
  name: string
  description: string
  service_family: string
  route_model: 'p2p' | 'two_legs' | 'three_legs'
  is_enabled: boolean
  display_order: number
  vehicle_types: string[]
  exclusive_driver: boolean
  batching_allowed: boolean
  max_eta_minutes: number
  max_distance_km: number | null
  max_weight_kg: number | null
  uses_size_tier: boolean
  requires_dimension_scan: boolean
  allows_manual_dimension: boolean
  requires_pickup_verification: boolean
  price_mode: 'final' | 'estimated_then_adjusted'
  base_fare_idr: number
  included_distance_km: number
  per_km_idr: number
  service_multiplier: number
  platform_commission_percent: number
  courier_payout_percent: number
  courier_min_payout_idr: number
  mdr_percent: number
  ppn_percent: number
  show_customer_price_to_courier: boolean
  size_tiers: any[]
  dimension_rules: Record<string, any>
  availability_rules: Record<string, any>
  metadata: Record<string, any>
}

const emptyService: DeliveryService = {
  code: '',
  name: '',
  description: '',
  service_family: 'p2p',
  route_model: 'p2p',
  is_enabled: true,
  display_order: 100,
  vehicle_types: ['motor'],
  exclusive_driver: true,
  batching_allowed: false,
  max_eta_minutes: 240,
  max_distance_km: 70,
  max_weight_kg: 20,
  uses_size_tier: true,
  requires_dimension_scan: false,
  allows_manual_dimension: true,
  requires_pickup_verification: true,
  price_mode: 'final',
  base_fare_idr: 10000,
  included_distance_km: 1,
  per_km_idr: 4000,
  service_multiplier: 1,
  platform_commission_percent: 20,
  courier_payout_percent: 75,
  courier_min_payout_idr: 8000,
  mdr_percent: 0.7,
  ppn_percent: 11,
  show_customer_price_to_courier: false,
  size_tiers: [],
  dimension_rules: { volumetric_divisor: 6000, surcharge_threshold_kg: 20, surcharge_per_kg_idr: 2000 },
  availability_rules: {},
  metadata: {}
}

const parseJson = (value: string, fallback: any) => {
  try {
    return value.trim() ? JSON.parse(value) : fallback
  } catch {
    return fallback
  }
}

export default function DeliveryServices({ embedded = false }: { embedded?: boolean }) {
  const queryClient = useQueryClient()
  const [selectedCode, setSelectedCode] = useState('')
  const [form, setForm] = useState<DeliveryService>(emptyService)
  const [jsonText, setJsonText] = useState({
    size_tiers: '[]',
    dimension_rules: '{}',
    availability_rules: '{}',
    metadata: '{}'
  })

  const { data, isLoading } = useQuery({
    queryKey: ['delivery-services'],
    queryFn: async () => {
      const res = await api.get('/admin/delivery-services')
      return res.data.services as DeliveryService[]
    }
  })

  const services = data || []
  const selected = useMemo(
    () => services.find((service) => service.code === selectedCode) || services[0],
    [selectedCode, services]
  )

  useEffect(() => {
    if (!selected) return
    setForm(selected)
    setJsonText({
      size_tiers: JSON.stringify(selected.size_tiers || [], null, 2),
      dimension_rules: JSON.stringify(selected.dimension_rules || {}, null, 2),
      availability_rules: JSON.stringify(selected.availability_rules || {}, null, 2),
      metadata: JSON.stringify(selected.metadata || {}, null, 2)
    })
    if (!selectedCode) setSelectedCode(selected.code)
  }, [selected, selectedCode])

  const mutation = useMutation({
    mutationFn: async (payload: DeliveryService) => {
      const res = await api.put(`/admin/delivery-services/${payload.code}`, payload)
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['delivery-services'] })
      toast.success('Delivery service updated')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || error.message)
    }
  })

  const updateField = (key: keyof DeliveryService, value: any) => {
    setForm((current) => ({ ...current, [key]: value }))
  }

  const save = () => {
    mutation.mutate({
      ...form,
      size_tiers: parseJson(jsonText.size_tiers, []),
      dimension_rules: parseJson(jsonText.dimension_rules, {}),
      availability_rules: parseJson(jsonText.availability_rules, {}),
      metadata: parseJson(jsonText.metadata, {})
    })
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-zinc-400">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading delivery services...
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {!embedded && (
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Delivery Services</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Atur product catalog, tarif, limit, dan aturan scan dimensi yang dipakai customer app.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[360px_1fr]">
        <div className="space-y-3">
          {services.map((service) => (
            <button
              key={service.code}
              type="button"
              onClick={() => setSelectedCode(service.code)}
              className={cn(
                'w-full rounded-2xl border p-4 text-left transition-all',
                selectedCode === service.code
                  ? 'border-primary bg-primary/10 shadow-lg shadow-primary/10'
                  : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'
              )}
            >
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-white/5 p-2 text-primary-light">
                  <Truck size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-bold text-zinc-100">{service.name}</p>
                    <span className={cn(
                      'rounded-full px-2 py-0.5 text-[10px] font-bold uppercase',
                      service.is_enabled ? 'bg-emerald-500/10 text-emerald-300' : 'bg-red-500/10 text-red-300'
                    )}>
                      {service.is_enabled ? 'Active' : 'Off'}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-zinc-500">{service.description}</p>
                  <div className="mt-3 flex flex-wrap gap-2 text-[10px] text-zinc-400">
                    <span className="rounded-full border border-white/10 px-2 py-1">{service.route_model}</span>
                    <span className="rounded-full border border-white/10 px-2 py-1">{service.max_eta_minutes} min</span>
                    <span className="rounded-full border border-white/10 px-2 py-1">{service.requires_dimension_scan ? 'scan' : 'tier'}</span>
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-500">{form.code}</p>
              <h2 className="mt-1 text-2xl font-bold">{form.name}</h2>
            </div>
            <button
              type="button"
              onClick={save}
              disabled={mutation.isPending}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-white transition hover:bg-primary/90 disabled:opacity-60"
            >
              {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Config
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <TextInput label="Name" value={form.name} onChange={(v) => updateField('name', v)} />
            <TextInput label="Description" value={form.description} onChange={(v) => updateField('description', v)} />
            <SelectInput label="Route Model" value={form.route_model} onChange={(v) => updateField('route_model', v)} options={['p2p', 'two_legs', 'three_legs']} />
            <SelectInput label="Price Mode" value={form.price_mode} onChange={(v) => updateField('price_mode', v)} options={['final', 'estimated_then_adjusted']} />
            <NumberInput label="Display Order" value={form.display_order} onChange={(v) => updateField('display_order', v)} />
            <NumberInput label="Max ETA (minutes)" value={form.max_eta_minutes} onChange={(v) => updateField('max_eta_minutes', v)} />
            <NumberInput label="Max Distance (km)" value={form.max_distance_km || 0} onChange={(v) => updateField('max_distance_km', v)} />
            <NumberInput label="Max Weight (kg)" value={form.max_weight_kg || 0} onChange={(v) => updateField('max_weight_kg', v)} />
            <NumberInput label="Base Fare (Rp)" value={form.base_fare_idr} onChange={(v) => updateField('base_fare_idr', v)} />
            <NumberInput label="Included Distance (km)" value={form.included_distance_km} onChange={(v) => updateField('included_distance_km', v)} />
            <NumberInput label="Per KM (Rp)" value={form.per_km_idr} onChange={(v) => updateField('per_km_idr', v)} />
            <NumberInput label="Service Multiplier" value={form.service_multiplier} onChange={(v) => updateField('service_multiplier', v)} step="0.01" />
          </div>

          <div className="mt-6 rounded-2xl border border-white/10 bg-zinc-950/70 p-5">
            <div className="mb-4">
              <p className="text-sm font-bold text-zinc-100">Settlement & Courier Payout</p>
              <p className="mt-1 text-xs text-zinc-500">
                Customer tetap melihat total tagihan. Kurir melihat estimasi pendapatan dari konfigurasi ini.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <NumberInput label="Platform Commission (%)" value={form.platform_commission_percent} onChange={(v) => updateField('platform_commission_percent', v)} step="0.01" />
              <NumberInput label="Courier Payout (%)" value={form.courier_payout_percent} onChange={(v) => updateField('courier_payout_percent', v)} step="0.01" />
              <NumberInput label="Courier Min Payout (Rp)" value={form.courier_min_payout_idr} onChange={(v) => updateField('courier_min_payout_idr', v)} />
              <NumberInput label="MDR Payment (%)" value={form.mdr_percent} onChange={(v) => updateField('mdr_percent', v)} step="0.01" />
              <NumberInput label="PPN (%)" value={form.ppn_percent} onChange={(v) => updateField('ppn_percent', v)} step="0.01" />
              <Toggle label="Show Customer Price to Courier" checked={form.show_customer_price_to_courier} onChange={(v) => updateField('show_customer_price_to_courier', v)} />
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-3 lg:grid-cols-3">
            <Toggle label="Enabled" checked={form.is_enabled} onChange={(v) => updateField('is_enabled', v)} />
            <Toggle label="Exclusive Driver" checked={form.exclusive_driver} onChange={(v) => updateField('exclusive_driver', v)} />
            <Toggle label="Batching Allowed" checked={form.batching_allowed} onChange={(v) => updateField('batching_allowed', v)} />
            <Toggle label="Use Size Tier" checked={form.uses_size_tier} onChange={(v) => updateField('uses_size_tier', v)} />
            <Toggle label="Require Dimension Scan" checked={form.requires_dimension_scan} onChange={(v) => updateField('requires_dimension_scan', v)} />
            <Toggle label="Allow Manual Dimension" checked={form.allows_manual_dimension} onChange={(v) => updateField('allows_manual_dimension', v)} />
          </div>

          <div className="mt-6 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-100">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
              <p>
                Semua angka tarif dan aturan operasional di bawah ini langsung dipakai endpoint customer. Untuk P2P ringan,
                matikan wajib scan dan pakai size tier. Untuk Mobil/Cargo, aktifkan wajib scan.
              </p>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-2">
            <JsonInput label="Size Tiers JSON" value={jsonText.size_tiers} onChange={(v) => setJsonText((current) => ({ ...current, size_tiers: v }))} />
            <JsonInput label="Dimension Rules JSON" value={jsonText.dimension_rules} onChange={(v) => setJsonText((current) => ({ ...current, dimension_rules: v }))} />
            <JsonInput label="Availability Rules JSON" value={jsonText.availability_rules} onChange={(v) => setJsonText((current) => ({ ...current, availability_rules: v }))} />
            <JsonInput label="Metadata JSON" value={jsonText.metadata} onChange={(v) => setJsonText((current) => ({ ...current, metadata: v }))} />
          </div>
        </div>
      </div>
    </div>
  )
}

function TextInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-zinc-500">{label}</span>
      <input value={value || ''} onChange={(e) => onChange(e.target.value)} className="w-full rounded-xl border border-white/10 bg-zinc-950 px-4 py-3 text-sm outline-none focus:border-primary" />
    </label>
  )
}

function NumberInput({ label, value, onChange, step = '1' }: { label: string; value: number; onChange: (value: number) => void; step?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-zinc-500">{label}</span>
      <input type="number" step={step} value={value ?? 0} onChange={(e) => onChange(Number(e.target.value))} className="w-full rounded-xl border border-white/10 bg-zinc-950 px-4 py-3 text-sm outline-none focus:border-primary" />
    </label>
  )
}

function SelectInput({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[] }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-zinc-500">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-xl border border-white/10 bg-zinc-950 px-4 py-3 text-sm outline-none focus:border-primary">
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex items-center justify-between rounded-xl border border-white/10 bg-zinc-950 px-4 py-3">
      <span className="text-sm font-medium text-zinc-300">{label}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-primary" />
    </label>
  )
}

function JsonInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-zinc-500">{label}</span>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={10} className="w-full resize-y rounded-xl border border-white/10 bg-zinc-950 px-4 py-3 font-mono text-xs outline-none focus:border-primary" />
    </label>
  )
}

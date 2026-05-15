import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, Loader2, Plus, Save, Tags, Truck } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '../lib/api'
import { cn } from '../lib/utils'

type RouteModel = 'p2p' | 'two_legs' | 'three_legs' | 'hub_and_spoke'
type PriceMode = 'final' | 'estimated_then_adjusted'

type DeliveryService = {
  code: string
  name: string
  description: string
  service_family: string
  service_category: string
  route_model: RouteModel
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
  price_mode: PriceMode
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

const serviceCategories = [
  {
    code: 'on_demand',
    label: 'On Demand',
    description: 'Produk ala GoSend: LANCAR Prioritas, Instant, Hemat, Same Day, dan Mobil.',
    defaultRoute: 'p2p' as RouteModel
  },
  {
    code: 'network',
    label: 'Network Parcel',
    description: 'Alur seperti JNE: pickup, hub origin, hub destination, courier delivery, POD.',
    defaultRoute: 'hub_and_spoke' as RouteModel
  },
  {
    code: 'pickup_only',
    label: 'Pickup Only',
    description: 'Kurir hanya menjalankan pickup dari customer ke origin facility.',
    defaultRoute: 'two_legs' as RouteModel
  },
  {
    code: 'delivery_only',
    label: 'Delivery Only',
    description: 'Kurir hanya menjalankan last-mile dari destination facility ke penerima.',
    defaultRoute: 'two_legs' as RouteModel
  }
]

const serviceFamilies = [
  {
    code: 'regular',
    label: 'Regular',
    description: 'Service ekonomis atau standar seperti REG.'
  },
  {
    code: 'cargo',
    label: 'Cargo',
    description: 'Barang besar, mobil, atau wajib dimensi.'
  },
  {
    code: 'express',
    label: 'Express',
    description: 'Service cepat atau prioritas seperti YES.'
  }
]

const emptyService: DeliveryService = {
  code: '',
  name: '',
  description: '',
  service_family: 'regular',
  service_category: 'on_demand',
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

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

const displayLabel = (code: string, source: Array<{ code: string; label: string }> = [...serviceCategories, ...serviceFamilies]) =>
  source.find((item) => item.code === code)?.label ||
  code
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')

const serviceDefaultsForCategory = (categoryCode: string, familyCode = 'regular'): Partial<DeliveryService> => {
  if (categoryCode === 'network') {
    return {
      route_model: 'hub_and_spoke',
      exclusive_driver: false,
      batching_allowed: true,
      max_eta_minutes: 1440,
      base_fare_idr: familyCode === 'express' ? 15000 : 9000,
      per_km_idr: familyCode === 'express' ? 3500 : 2500,
      service_multiplier: familyCode === 'express' ? 1.25 : familyCode === 'cargo' ? 1.4 : 1,
      requires_pickup_verification: true
    }
  }

  if (categoryCode === 'pickup_only' || categoryCode === 'delivery_only') {
    return {
      route_model: 'two_legs',
      exclusive_driver: false,
      batching_allowed: true,
      max_eta_minutes: 480,
      base_fare_idr: 8000,
      per_km_idr: 2000,
      service_multiplier: 1,
      requires_pickup_verification: true
    }
  }

  if (familyCode === 'cargo') {
    return {
      route_model: categoryCode === 'on_demand' ? 'p2p' : 'hub_and_spoke',
      vehicle_types: ['car'],
      exclusive_driver: true,
      batching_allowed: false,
      max_eta_minutes: 240,
      max_weight_kg: 100,
      uses_size_tier: false,
      requires_dimension_scan: true,
      base_fare_idr: 35000,
      per_km_idr: 6500,
      service_multiplier: 1.4,
      requires_pickup_verification: true
    }
  }

  return {
    route_model: 'p2p',
    exclusive_driver: true,
    batching_allowed: false,
    max_eta_minutes: 180,
    base_fare_idr: 12000,
    per_km_idr: 4500,
    service_multiplier: 1.1,
    requires_pickup_verification: true
  }
}

const makeDraftService = (categoryCode: string, services: DeliveryService[]): DeliveryService => {
  const normalizedCategory = slugify(categoryCode || 'on_demand') || 'on_demand'
  const categoryCount = services.filter((service) => (service.service_category || 'on_demand') === normalizedCategory).length + 1
  const category = serviceCategories.find((item) => item.code === normalizedCategory)

  return {
    ...emptyService,
    ...serviceDefaultsForCategory(normalizedCategory, 'regular'),
    code: `lancar_${normalizedCategory}_${categoryCount}`,
    name: `LANCAR ${category?.label || displayLabel(normalizedCategory, serviceCategories)}`,
    description: category?.description || `Service ${displayLabel(normalizedCategory, serviceCategories)}.`,
    service_family: 'regular',
    service_category: normalizedCategory,
    display_order: Math.max(100, categoryCount * 10)
  }
}

export default function DeliveryServices({ embedded = false }: { embedded?: boolean }) {
  const queryClient = useQueryClient()
  const [selectedCategory, setSelectedCategory] = useState('on_demand')
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
  const dynamicCategories = useMemo(() => {
    const known = new Set(serviceCategories.map((category) => category.code))
    return Array.from(new Set(services.map((service) => (service.service_category || 'on_demand')).filter(Boolean)))
      .filter((code) => !known.has(code))
      .map((code) => ({ code, label: displayLabel(code, serviceCategories), description: 'Custom operational category.', defaultRoute: 'p2p' as RouteModel }))
  }, [services])
  const categories = useMemo(() => [...serviceCategories, ...dynamicCategories], [dynamicCategories])
  const visibleServices = useMemo(
    () => services.filter((service) => (service.service_category || 'on_demand') === selectedCategory),
    [services, selectedCategory]
  )
  const selected = useMemo(
    () => services.find((service) => service.code === selectedCode),
    [selectedCode, services]
  )
  const isNewService = !services.some((service) => service.code === form.code)

  useEffect(() => {
    if (selected && (selected.service_category || 'on_demand') === selectedCategory) {
      setForm(selected)
      setJsonText({
        size_tiers: JSON.stringify(selected.size_tiers || [], null, 2),
        dimension_rules: JSON.stringify(selected.dimension_rules || {}, null, 2),
        availability_rules: JSON.stringify(selected.availability_rules || {}, null, 2),
        metadata: JSON.stringify(selected.metadata || {}, null, 2)
      })
      return
    }

    if (visibleServices[0]) {
      setSelectedCode(visibleServices[0].code)
      return
    }

    const draft = makeDraftService(selectedCategory, services)
    setSelectedCode('__new__')
    setForm(draft)
    setJsonText({
      size_tiers: JSON.stringify(draft.size_tiers || [], null, 2),
      dimension_rules: JSON.stringify(draft.dimension_rules || {}, null, 2),
      availability_rules: JSON.stringify(draft.availability_rules || {}, null, 2),
      metadata: JSON.stringify(draft.metadata || {}, null, 2)
    })
  }, [selected, selectedCategory, services, visibleServices])

  const mutation = useMutation({
    mutationFn: async (payload: DeliveryService) => {
      const exists = services.some((service) => service.code === payload.code)
      const res = exists
        ? await api.put(`/admin/delivery-services/${payload.code}`, payload)
        : await api.post('/admin/delivery-services', payload)
      return res.data
    },
    onSuccess: (_data, payload) => {
      queryClient.invalidateQueries({ queryKey: ['delivery-services'] })
      setSelectedCategory(payload.service_category)
      setSelectedCode(payload.code)
      toast.success(isNewService ? 'Delivery service created' : 'Delivery service updated')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || error.message)
    }
  })

  const updateField = (key: keyof DeliveryService, value: any) => {
    setForm((current) => ({ ...current, [key]: value }))
  }

  const startNewService = () => {
    const draft = makeDraftService(selectedCategory, services)
    setSelectedCode('__new__')
    setForm(draft)
    setJsonText({
      size_tiers: JSON.stringify(draft.size_tiers || [], null, 2),
      dimension_rules: JSON.stringify(draft.dimension_rules || {}, null, 2),
      availability_rules: JSON.stringify(draft.availability_rules || {}, null, 2),
      metadata: JSON.stringify(draft.metadata || {}, null, 2)
    })
  }

  const save = () => {
    const normalizedCode = slugify(form.code)
    const normalizedFamily = slugify(form.service_family)
    const normalizedCategory = slugify(form.service_category)

    if (!normalizedCode || !form.name.trim()) {
      toast.error('Code dan name wajib diisi')
      return
    }

    mutation.mutate({
      ...form,
      code: normalizedCode,
      service_family: normalizedFamily || 'regular',
      service_category: normalizedCategory || 'on_demand',
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
            Atur product catalog, kategori layanan, tarif, limit, dan aturan scan yang dipakai customer app.
          </p>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {categories.map((category) => {
          const count = services.filter((service) => (service.service_category || 'on_demand') === category.code).length
          return (
            <button
              key={category.code}
              type="button"
              onClick={() => setSelectedCategory(category.code)}
              className={cn(
                'rounded-2xl border p-4 text-left transition',
                selectedCategory === category.code
                  ? 'border-primary bg-primary/10 text-zinc-100'
                  : 'border-white/10 bg-white/[0.03] text-zinc-400 hover:bg-white/[0.06]'
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <Tags className="h-4 w-4 text-primary-light" />
                <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] font-bold">{count}</span>
              </div>
              <p className="mt-3 text-sm font-bold">{category.label}</p>
              <p className="mt-1 line-clamp-2 text-xs text-zinc-500">{category.description}</p>
            </button>
          )
        })}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[360px_1fr]">
        <div className="space-y-3">
          <button
            type="button"
            onClick={startNewService}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-primary/40 bg-primary/10 px-4 py-3 text-sm font-bold text-primary-light transition hover:bg-primary/15"
          >
            <Plus className="h-4 w-4" />
            Tambah Service {displayLabel(selectedCategory, serviceCategories)}
          </button>

          {visibleServices.length === 0 && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-zinc-500">
              Belum ada service di kategori ini. Buat service baru lalu simpan.
            </div>
          )}

          {visibleServices.map((service) => (
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
                    <span className="rounded-full border border-white/10 px-2 py-1">{displayLabel(service.service_category || 'on_demand', serviceCategories)}</span>
                    <span className="rounded-full border border-white/10 px-2 py-1">{displayLabel(service.service_family, serviceFamilies)}</span>
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
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-500">{form.code || 'new_service'}</p>
              <h2 className="mt-1 text-2xl font-bold">{form.name || 'New Delivery Service'}</h2>
            </div>
            <button
              type="button"
              onClick={save}
              disabled={mutation.isPending}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-white transition hover:bg-primary/90 disabled:opacity-60"
            >
              {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {isNewService ? 'Create Service' : 'Save Config'}
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <TextInput label="Code" value={form.code} onChange={(v) => updateField('code', slugify(v))} disabled={!isNewService} />
            <TextInput label="Operational Category" value={form.service_category} onChange={(v) => updateField('service_category', slugify(v))} />
            <SelectInput label="Service Family" value={form.service_family} onChange={(v) => {
              setForm((current) => ({ ...current, ...serviceDefaultsForCategory(current.service_category || selectedCategory, v), service_family: v }))
            }} options={serviceFamilies.map((family) => family.code)} labels={serviceFamilies} />
            <TextInput label="Name" value={form.name} onChange={(v) => updateField('name', v)} />
            <TextInput label="Description" value={form.description} onChange={(v) => updateField('description', v)} />
            <SelectInput label="Operational Template" value={form.service_category} onChange={(v) => {
              setSelectedCategory(v)
              setForm((current) => ({ ...current, ...serviceDefaultsForCategory(v, current.service_family), service_category: v }))
            }} options={categories.map((category) => category.code)} labels={categories} />
            <SelectInput label="Route Model" value={form.route_model} onChange={(v) => updateField('route_model', v as RouteModel)} options={['p2p', 'two_legs', 'three_legs', 'hub_and_spoke']} />
            <SelectInput label="Price Mode" value={form.price_mode} onChange={(v) => updateField('price_mode', v as PriceMode)} options={['final', 'estimated_then_adjusted']} />
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
            <Toggle label="Pickup Verification" checked={form.requires_pickup_verification} onChange={(v) => updateField('requires_pickup_verification', v)} />
          </div>

          <div className="mt-6 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-100">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
              <p>
                On Demand adalah operational category untuk offer terima/tolak ala GoSend. REG dan YES masuk Network
                Parcel dengan route model hub_and_spoke untuk alur pickup, hub origin, hub destination, courier delivery, dan POD.
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

function TextInput({ label, value, onChange, disabled = false }: { label: string; value: string; onChange: (value: string) => void; disabled?: boolean }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-zinc-500">{label}</span>
      <input
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full rounded-xl border border-white/10 bg-zinc-950 px-4 py-3 text-sm outline-none focus:border-primary disabled:cursor-not-allowed disabled:opacity-60"
      />
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

function SelectInput({
  label,
  value,
  onChange,
  options,
  labels = []
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: string[]
  labels?: Array<{ code: string; label: string }>
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-zinc-500">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-xl border border-white/10 bg-zinc-950 px-4 py-3 text-sm outline-none focus:border-primary">
        {options.map((option) => <option key={option} value={option}>{displayLabel(option, labels)}</option>)}
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

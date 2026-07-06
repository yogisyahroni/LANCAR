import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, Loader2, Save, Percent, Truck } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '../lib/api'
import { cn } from '../lib/utils'

type LogisticsProvider = {
  code: string
  name: string
  is_active: boolean
  priority: number
  discount_pct: number
  markup_pct: number
  discount_notes: string
  updated_at: string
}

export default function LogisticsDiscount() {
  const queryClient = useQueryClient()
  const [editingProvider, setEditingProvider] = useState<LogisticsProvider | null>(null)
  
  // States for the edit form
  const [discountPct, setDiscountPct] = useState<number>(0)
  const [markupPct, setMarkupPct] = useState<number>(0)
  const [discountNotes, setDiscountNotes] = useState<string>('')
  const [isActive, setIsActive] = useState<boolean>(true)
  const [priority, setPriority] = useState<number>(0)
  
  // State for calculation preview
  const [previewGross] = useState<number>(10000)

  const { data: providers, isLoading } = useQuery({
    queryKey: ['logistics-providers'],
    queryFn: async () => {
      const res = await api.get('/admin/logistics-providers')
      return res.data as LogisticsProvider[]
    }
  })

  const mutation = useMutation({
    mutationFn: async (payload: Partial<LogisticsProvider> & { code: string }) => {
      const res = await api.put(`/admin/logistics-providers/${payload.code}`, payload)
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['logistics-providers'] })
      toast.success('Provider configuration updated')
      setEditingProvider(null)
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || error.message)
    }
  })

  const handleEdit = (provider: LogisticsProvider) => {
    setEditingProvider(provider)
    setDiscountPct(provider.discount_pct || 0)
    setMarkupPct(provider.markup_pct || 0)
    setDiscountNotes(provider.discount_notes || '')
    setIsActive(provider.is_active ?? true)
    setPriority(provider.priority || 0)
  }

  const handleSave = () => {
    if (!editingProvider) return
    mutation.mutate({
      code: editingProvider.code,
      discount_pct: discountPct,
      markup_pct: markupPct,
      discount_notes: discountNotes,
      is_active: isActive,
      priority
    })
  }

  const netCost = previewGross * (1 - (discountPct / 100))
  const userPrice = netCost * (1 + (markupPct / 100))
  const margin = userPrice - netCost

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-zinc-400">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading logistics providers...
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Logistics Discounts & Margins</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Atur diskon volume dari JNE/J&T dan margin platform (markup) yang dikenakan ke customer.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_400px]">
        {/* Provider List */}
        <div className="space-y-4">
          {providers?.map((provider) => (
            <div
              key={provider.code}
              className={cn(
                'rounded-2xl border p-5 transition-all',
                editingProvider?.code === provider.code
                  ? 'border-primary bg-primary/5 shadow-lg shadow-primary/10'
                  : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'
              )}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="rounded-xl bg-white/5 p-3 text-primary-light">
                    <Truck size={24} />
                  </div>
                  <div>
                    <div className="flex items-center gap-3">
                      <h3 className="font-bold text-zinc-100 text-lg">{provider.name}</h3>
                      <span className={cn(
                        'rounded-full px-2 py-0.5 text-[10px] font-bold uppercase',
                        provider.is_active ? 'bg-emerald-500/10 text-emerald-300' : 'bg-red-500/10 text-red-300'
                      )}>
                        {provider.is_active ? 'Active' : 'Off'}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-500 uppercase tracking-wider mt-1">{provider.code}</p>
                  </div>
                </div>
                <button
                  onClick={() => handleEdit(provider)}
                  className="rounded-xl bg-white/5 px-4 py-2 text-sm font-bold text-zinc-300 transition hover:bg-white/10"
                >
                  Edit Config
                </button>
              </div>

              <div className="mt-5 grid grid-cols-3 gap-4 border-t border-white/5 pt-5">
                <div>
                  <p className="text-xs text-zinc-500 font-bold uppercase">Discount from 3PL</p>
                  <p className="mt-1 text-xl font-bold text-emerald-400">{provider.discount_pct}%</p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500 font-bold uppercase">Platform Markup</p>
                  <p className="mt-1 text-xl font-bold text-blue-400">{provider.markup_pct}%</p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500 font-bold uppercase">Priority Level</p>
                  <p className="mt-1 text-xl font-bold text-zinc-300">{provider.priority}</p>
                </div>
              </div>
              {provider.discount_notes && (
                <div className="mt-4 rounded-xl bg-zinc-950 px-4 py-3 text-sm text-zinc-400">
                  <span className="font-bold text-zinc-300">Notes: </span> {provider.discount_notes}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Editor Sidebar */}
        <div>
          {editingProvider ? (
            <div className="sticky top-6 rounded-3xl border border-white/10 bg-white/[0.03] p-6">
              <div className="mb-6">
                <h2 className="text-xl font-bold">Edit {editingProvider.name}</h2>
                <p className="text-xs text-zinc-400 mt-1">Konfigurasi diskon & markup</p>
              </div>

              <div className="space-y-4">
                <label className="block">
                  <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-zinc-500">Discount from 3PL (%)</span>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.1"
                      value={discountPct}
                      onChange={(e) => setDiscountPct(Number(e.target.value))}
                      className="w-full rounded-xl border border-white/10 bg-zinc-950 px-4 py-3 text-sm outline-none focus:border-primary pl-10"
                    />
                    <Percent className="absolute left-3 top-3 h-4 w-4 text-zinc-500" />
                  </div>
                  <p className="text-[10px] text-zinc-500 mt-1">Diskon dari harga publish JNE/JNT</p>
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-zinc-500">Platform Markup (%)</span>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.1"
                      value={markupPct}
                      onChange={(e) => setMarkupPct(Number(e.target.value))}
                      className="w-full rounded-xl border border-white/10 bg-zinc-950 px-4 py-3 text-sm outline-none focus:border-primary pl-10"
                    />
                    <Percent className="absolute left-3 top-3 h-4 w-4 text-zinc-500" />
                  </div>
                  <p className="text-[10px] text-zinc-500 mt-1">Margin yang dikenakan dari harga nett</p>
                </label>
                
                <label className="block">
                  <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-zinc-500">Priority</span>
                  <input
                    type="number"
                    value={priority}
                    onChange={(e) => setPriority(Number(e.target.value))}
                    className="w-full rounded-xl border border-white/10 bg-zinc-950 px-4 py-3 text-sm outline-none focus:border-primary"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-zinc-500">Discount Notes (Optional)</span>
                  <textarea
                    value={discountNotes}
                    onChange={(e) => setDiscountNotes(e.target.value)}
                    rows={2}
                    className="w-full resize-none rounded-xl border border-white/10 bg-zinc-950 px-4 py-3 text-sm outline-none focus:border-primary"
                    placeholder="e.g. Contract vol 2026"
                  />
                </label>

                <label className="flex items-center justify-between rounded-xl border border-white/10 bg-zinc-950 px-4 py-3">
                  <span className="text-sm font-medium text-zinc-300">Active</span>
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="h-4 w-4 accent-primary"
                  />
                </label>
              </div>

              {/* Preview Kalkulasi */}
              <div className="mt-6 rounded-2xl border border-white/10 bg-zinc-950 p-4">
                <p className="text-xs font-bold uppercase text-zinc-500 mb-3">Live Calculation Preview</p>
                
                <div className="flex justify-between items-center text-sm mb-2 text-zinc-400">
                  <span>Gross Tariff (3PL Publish)</span>
                  <span>Rp {previewGross.toLocaleString('id-ID')}</span>
                </div>
                
                <div className="flex justify-between items-center text-sm mb-2 text-emerald-400">
                  <span>Discount ({discountPct}%)</span>
                  <span>- Rp {(previewGross * (discountPct/100)).toLocaleString('id-ID')}</span>
                </div>

                <div className="flex justify-between items-center text-sm font-bold border-t border-white/10 pt-2 mb-2">
                  <span>TEMBUS Net Cost</span>
                  <span>Rp {netCost.toLocaleString('id-ID')}</span>
                </div>

                <div className="flex justify-between items-center text-sm mb-2 text-blue-400">
                  <span>Markup ({markupPct}%)</span>
                  <span>+ Rp {(netCost * (markupPct/100)).toLocaleString('id-ID')}</span>
                </div>

                <div className="flex justify-between items-center text-base font-bold border-t border-white/10 pt-2 text-primary-light">
                  <span>Final Price to User</span>
                  <span>Rp {userPrice.toLocaleString('id-ID')}</span>
                </div>

                <div className="mt-3 bg-emerald-500/10 text-emerald-400 text-xs px-3 py-2 rounded-lg text-center font-bold border border-emerald-500/20">
                  TEMBUS Margin: Rp {margin.toLocaleString('id-ID')}
                </div>
              </div>

              <div className="mt-6 flex gap-3">
                <button
                  type="button"
                  onClick={() => setEditingProvider(null)}
                  className="flex-1 rounded-xl bg-white/5 px-4 py-3 text-sm font-bold text-zinc-300 transition hover:bg-white/10"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={mutation.isPending}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-white transition hover:bg-primary/90 disabled:opacity-60"
                >
                  {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save Settings
                </button>
              </div>
            </div>
          ) : (
            <div className="flex h-[400px] items-center justify-center rounded-3xl border border-white/10 border-dashed bg-white/[0.02]">
              <div className="text-center px-6">
                <AlertCircle className="mx-auto h-8 w-8 text-zinc-500 mb-3" />
                <p className="text-sm font-bold text-zinc-300">No Provider Selected</p>
                <p className="mt-1 text-xs text-zinc-500">Pilih provider di samping untuk mengatur diskon dan margin.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

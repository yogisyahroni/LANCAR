import { useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Settings, Save, Loader2, Info, Percent, DollarSign } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '../lib/api'
import { cn } from '../lib/utils'

type SettlementConfig = {
  id: string
  service_code: string
  service_category: string
  commission_basis: 'pool' | 'per_km'
  platform_commission_pct: number
  mdr_pct: number
  tax_pct: number
  courier_keeps_service_fee: boolean
  courier_keeps_base_fee: boolean
  courier_keeps_toll: boolean
}

export default function SettlementConfig() {
  const queryClient = useQueryClient()
  const [configs, setConfigs] = useState<SettlementConfig[]>([])

  const { data, isLoading } = useQuery({
    queryKey: ['settlement-configs'],
    queryFn: async () => {
      const res = await api.get('/admin/settlement-configs')
      return res.data
    }
  })

  useEffect(() => {
    if (data) {
      setConfigs(data)
    }
  }, [data])

  const updateMutation = useMutation({
    mutationFn: async (config: SettlementConfig) => {
      const res = await api.put(`/admin/settlement-configs/${config.id}`, config)
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settlement-configs'] })
      toast.success('Settlement config updated successfully')
    },
    onError: (err: any) => {
      toast.error(`Update failed: ${err.message}`)
    }
  })

  const handleUpdate = (index: number, field: keyof SettlementConfig, value: any) => {
    const updated = [...configs]
    updated[index] = { ...updated[index], [field]: value }
    setConfigs(updated)
    updateMutation.mutate(updated[index])
  }

  if (isLoading) {
    return (
      <div className="h-[80vh] flex items-center justify-center">
        <Loader2 className="w-12 h-12 text-primary animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-8 animate-in">
      <div>
        <h1 className="text-3xl font-bold text-zinc-100 tracking-tight">Settlement Configuration</h1>
        <p className="text-zinc-500 mt-1">Configure commission basis and settlement rules per service.</p>
      </div>

      <div className="glass-card p-8 rounded-[40px] border-white/5 space-y-6">
        <div className="flex items-center gap-3">
          <Settings className="text-primary-light" size={24} />
          <h2 className="text-xl font-black text-zinc-100">Service Settlement Rules</h2>
        </div>

        <div className="space-y-4">
          {configs.map((config, index) => (
            <div key={config.id} className="p-6 rounded-3xl bg-white/[0.02] border border-white/5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-zinc-100">{config.service_code}</h3>
                  <p className="text-sm text-zinc-500">{config.service_category}</p>
                </div>
                <span className={cn(
                  "px-3 py-1 rounded-full text-xs font-bold",
                  config.commission_basis === 'per_km' 
                    ? "bg-emerald-500/20 text-emerald-400" 
                    : "bg-amber-500/20 text-amber-400"
                )}>
                  {config.commission_basis === 'per_km' ? 'Model B (Per KM)' : 'Model A (Pool)'}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-black text-zinc-600 uppercase">Commission Basis</label>
                  <select
                    value={config.commission_basis}
                    onChange={(e) => handleUpdate(index, 'commission_basis', e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-zinc-100 font-bold focus:outline-none focus:ring-2 focus:ring-primary/40"
                  >
                    <option value="pool">Pool (20% from entire pool)</option>
                    <option value="per_km">Per KM (20% from base_fare + per_km only)</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-black text-zinc-600 uppercase">Commission %</label>
                  <div className="relative">
                    <input
                      type="number"
                      value={config.platform_commission_pct}
                      onChange={(e) => handleUpdate(index, 'platform_commission_pct', parseFloat(e.target.value))}
                      className="w-full bg-white/5 border border-white/10 rounded-xl p-3 pl-10 text-zinc-100 font-bold focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                    <Percent size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-black text-zinc-600 uppercase">MDR %</label>
                  <div className="relative">
                    <input
                      type="number"
                      value={config.mdr_pct}
                      onChange={(e) => handleUpdate(index, 'mdr_pct', parseFloat(e.target.value))}
                      className="w-full bg-white/5 border border-white/10 rounded-xl p-3 pl-10 text-zinc-100 font-bold focus:outline-none focus:ring-2 focus:ring-primary/40"
                      step="0.1"
                    />
                    <Percent size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                  </div>
                </div>
              </div>

              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm text-zinc-400">
                  <input
                    type="checkbox"
                    checked={config.courier_keeps_service_fee}
                    onChange={(e) => handleUpdate(index, 'courier_keeps_service_fee', e.target.checked)}
                    className="rounded border-white/20 bg-white/5 text-primary focus:ring-primary"
                  />
                  Courier keeps 100% service fee
                </label>
                <label className="flex items-center gap-2 text-sm text-zinc-400">
                  <input
                    type="checkbox"
                    checked={config.courier_keeps_toll}
                    onChange={(e) => handleUpdate(index, 'courier_keeps_toll', e.target.checked)}
                    className="rounded border-white/20 bg-white/5 text-primary focus:ring-primary"
                  />
                  Courier keeps 100% toll
                </label>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="glass-card p-6 rounded-[32px] border-white/5">
        <div className="flex items-start gap-3">
          <Info className="text-primary-light mt-0.5" size={18} />
          <div className="text-sm text-zinc-400 leading-relaxed">
            <p className="font-bold text-zinc-200 mb-2">Settlement Model Reference:</p>
            <ul className="space-y-1 list-disc list-inside">
              <li><strong className="text-zinc-200">Model A (Pool):</strong> Commission 20% dari seluruh Operational Pool (untuk ondemand/regular)</li>
              <li><strong className="text-zinc-200">Model B (Per KM):</strong> Commission 20% hanya dari (BaseFare + PerKM × Jarak) — untuk tambal ban & towing</li>
              <li>MDR & PPN selalu dibayar oleh customer (bukan dari uang kurir)</li>
              <li>Harga Jasa (yang kurir set sendiri) = 100% masuk ke kurir</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}

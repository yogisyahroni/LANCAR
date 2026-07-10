import { useState } from 'react'
import { 
  DollarSign, 
  Plus,
  Loader2,
  FileText,
  Map,
  CheckCircle2,
  XCircle,
  Settings,
  TrendingUp
} from 'lucide-react'
import { cn } from '../lib/utils'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { toast } from 'sonner'
import { format } from 'date-fns'

interface TariffCard {
  id: string
  provider_name: string
  service_code: string
  effective_from: string
  effective_to: string | null
  volumetric_divisor: number
  min_weight_kg: string
  fuel_surcharge_pct: string
  remote_area_surcharge_idr: string
  insurance_fee_pct: string
  insurance_min_fee_idr: string
  return_fee_pct: string
  is_active: boolean
}

export default function TariffEngine() {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<'cards' | 'lanes' | 'audit'>('cards')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null)
  
  const [formData, setFormData] = useState<Partial<TariffCard>>({
    provider_name: 'JNE',
    service_code: 'REG',
    effective_from: new Date().toISOString().split('T')[0],
    effective_to: '',
    volumetric_divisor: 6000,
    min_weight_kg: '1.0',
    fuel_surcharge_pct: '0',
    remote_area_surcharge_idr: '0',
    insurance_fee_pct: '0.2',
    insurance_min_fee_idr: '5000',
    return_fee_pct: '100'
  })

  const { data: cards, isLoading: isLoadingCards } = useQuery({
    queryKey: ['tariff-cards'],
    queryFn: async () => {
      const res = await api.get('/admin/finance/tariff-cards')
      return res.data?.data || []
    }
  })

  const { data: lanes, isLoading: isLoadingLanes } = useQuery({
    queryKey: ['tariff-lanes', selectedCardId],
    enabled: !!selectedCardId && activeTab === 'lanes',
    queryFn: async () => {
      const res = await api.get(`/admin/finance/tariff-lanes?cardId=${selectedCardId}`)
      return res.data?.data || []
    }
  })

  const { data: auditOrders = [], isLoading: isLoadingAudit } = useQuery({
    queryKey: ['tariff-audit-orders'],
    enabled: activeTab === 'audit',
    queryFn: async () => {
      const res = await api.get('/admin/finance/tariff-audit/orders?limit=100')
      return res.data?.data || []
    }
  })

  const saveCardMutation = useMutation({
    mutationFn: async (card: Partial<TariffCard>) => {
      const res = await api.post('/admin/finance/tariff-cards', card)
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tariff-cards'] })
      toast.success('Tariff Card created successfully')
      setIsModalOpen(false)
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || `Failed to save card: ${err.message}`)
    }
  })

  const handleOpenModal = () => {
    setFormData({
      provider_name: 'JNE',
      service_code: 'REG',
      effective_from: new Date().toISOString().split('T')[0],
      effective_to: '',
      volumetric_divisor: 6000,
      min_weight_kg: '1.0',
      fuel_surcharge_pct: '0',
      remote_area_surcharge_idr: '0',
      insurance_fee_pct: '0.2',
      insurance_min_fee_idr: '5000',
      return_fee_pct: '100'
    })
    setIsModalOpen(true)
  }

  const handleSaveCard = () => {
    if (!formData.provider_name || !formData.service_code || !formData.effective_from) {
      toast.error('Provider, Service, and Effective Date are required.')
      return
    }
    saveCardMutation.mutate(formData)
  }

  if (isLoadingCards) {
    return (
      <div className="h-[80vh] flex items-center justify-center">
        <Loader2 className="w-12 h-12 text-primary animate-spin" />
      </div>
    )
  }

  const formatCurrency = (val: number | string) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(Number(val))

  return (
    <div className="space-y-8 animate-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold text-zinc-100 tracking-tight flex items-center gap-3">
            <DollarSign className="text-primary" /> Aggregator Tariff Engine
          </h1>
          <p className="text-zinc-500 mt-1">Manage rate cards, surcharges, and origin-destination lane pricing for 3PL providers.</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={handleOpenModal}
            className="px-6 py-3 rounded-2xl bg-primary text-white font-black text-sm uppercase tracking-widest shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center gap-2"
          >
            <Plus size={18} /> New Rate Card
          </button>
        </div>
      </div>

      <div className="flex items-center gap-1 p-1 rounded-2xl bg-white/[0.03] border border-white/5 w-fit">
        {[
          { id: 'cards', label: 'Rate Cards', icon: FileText },
          { id: 'lanes', label: 'Lane Pricing', icon: Map },
          { id: 'audit', label: 'Order Tariff Audit', icon: TrendingUp },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id as any)}
            className={cn(
              'flex items-center gap-2 px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all',
              activeTab === id
                ? 'bg-zinc-800 text-white shadow-lg'
                : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5'
            )}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'cards' && (
        <div className="glass-card p-8 rounded-[36px] border-white/5 space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-black text-zinc-100 italic uppercase">Active & Scheduled Rate Cards</h3>
            <span className="px-3 py-1 bg-blue-500/10 text-blue-400 text-[10px] font-black uppercase tracking-widest rounded-full">
              Surcharges & Insurance
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[1000px]">
              <thead>
                <tr className="border-b border-white/5">
                  {['Provider', 'Service', 'Vol Div', 'Min Wt', 'Fuel SC', 'Remote SC', 'Ins. Rate', 'Ret. Rate', 'Period', 'Status'].map(h => (
                    <th key={h} className="pb-4 text-left text-[10px] font-black text-zinc-600 uppercase tracking-widest">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(cards || []).map((card: TariffCard) => {
                  const isActive = !card.effective_to || new Date(card.effective_to) > new Date();
                  return (
                    <tr key={card.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                      <td className="py-4 font-bold text-zinc-200">{card.provider_name}</td>
                      <td className="py-4">
                        <span className="font-mono text-xs text-zinc-300 bg-white/5 px-2 py-1 rounded">{card.service_code}</span>
                      </td>
                      <td className="py-4 font-mono text-xs text-zinc-400">{card.volumetric_divisor}</td>
                      <td className="py-4 text-zinc-400">{card.min_weight_kg} kg</td>
                      <td className="py-4 text-zinc-400">{card.fuel_surcharge_pct}%</td>
                      <td className="py-4 text-zinc-400">{formatCurrency(card.remote_area_surcharge_idr)}</td>
                      <td className="py-4 text-zinc-400">{card.insurance_fee_pct}% <span className="text-[10px] text-zinc-600 block">(min {formatCurrency(card.insurance_min_fee_idr)})</span></td>
                      <td className="py-4 text-zinc-400">{card.return_fee_pct}%</td>
                      <td className="py-4 text-zinc-500 text-xs">
                        {format(new Date(card.effective_from), 'MMM d, yyyy')} - {card.effective_to ? format(new Date(card.effective_to), 'MMM d, yyyy') : '...'}
                      </td>
                      <td className="py-4">
                        <span className={cn(
                          "px-2 py-1 rounded-md text-[10px] font-black uppercase",
                          isActive ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
                        )}>
                          {isActive ? 'Active' : 'Expired'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
                {cards?.length === 0 && (
                  <tr>
                    <td colSpan={10} className="py-12 text-center text-zinc-500">No rate cards configured.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'lanes' && (
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <div className="flex-1 max-w-sm">
              <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest block mb-2">Select Rate Card to View Lanes</label>
              <select 
                value={selectedCardId || ''} 
                onChange={e => setSelectedCardId(e.target.value)}
                className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-primary"
              >
                <option value="" disabled>-- Select a card --</option>
                {(cards || []).map((c: TariffCard) => (
                  <option key={c.id} value={c.id}>{c.provider_name} - {c.service_code} (From {c.effective_from})</option>
                ))}
              </select>
            </div>
            {selectedCardId && (
              <button 
                className="mt-6 px-6 py-2.5 rounded-xl bg-white/5 text-zinc-300 font-black text-xs uppercase tracking-widest hover:bg-white/10 transition-all flex items-center gap-2"
              >
                <Settings size={14} /> Upload Lanes CSV
              </button>
            )}
          </div>

          {selectedCardId && (
            <div className="glass-card p-8 rounded-[36px] border-white/5 space-y-6">
              {isLoadingLanes ? (
                <div className="flex justify-center py-10"><Loader2 className="animate-spin text-zinc-500" /></div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[800px]">
                    <thead>
                      <tr className="border-b border-white/5">
                        {['Origin', 'Destination', 'Base Rate / Kg', 'SLA (Days)', 'Active'].map(h => (
                          <th key={h} className="pb-4 text-left text-[10px] font-black text-zinc-600 uppercase tracking-widest">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(lanes || []).map((lane: any) => (
                        <tr key={lane.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                          <td className="py-4 font-bold text-zinc-200">{lane.origin_zone}</td>
                          <td className="py-4 font-bold text-zinc-200">{lane.destination_zone}</td>
                          <td className="py-4 font-black text-primary-light">{formatCurrency(lane.base_rate_idr)}</td>
                          <td className="py-4 text-zinc-400">{lane.sla_days_min} - {lane.sla_days_max}</td>
                          <td className="py-4">
                            {lane.is_active ? <CheckCircle2 size={16} className="text-emerald-400" /> : <XCircle size={16} className="text-red-400" />}
                          </td>
                        </tr>
                      ))}
                      {lanes?.length === 0 && (
                        <tr>
                          <td colSpan={5} className="py-12 text-center text-zinc-500">No lanes found for this card. Please upload CSV.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === 'audit' && (
        <div className="glass-card p-8 rounded-[36px] border-white/5 space-y-6 animate-in">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xl font-black text-zinc-100 italic uppercase">Audit Margin & Tarif Per Pesanan</h3>
              <p className="text-sm text-zinc-500 mt-1">Perbandingan real-time quote biaya dari provider kurir vs tagihan pelanggan & margin platform.</p>
            </div>
            <span className="px-3 py-1 bg-emerald-500/10 text-emerald-400 text-xs font-black uppercase tracking-widest rounded-full">
              Live Audit Log
            </span>
          </div>

          {isLoadingAudit ? (
            <div className="flex items-center justify-center py-20"><Loader2 size={32} className="animate-spin text-zinc-600" /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[1000px]">
                <thead>
                  <tr className="border-b border-white/5">
                    {['Order ID / No Resi', 'Kurir / Layanan', 'Rute (Asal → Tujuan)', 'Berat', 'Biaya Pelanggan', 'Provider Quote', 'Margin Platform', 'Margin %', 'Waktu Transaksi'].map(h => (
                      <th key={h} className="pb-4 text-left text-[10px] font-black text-zinc-500 uppercase tracking-widest">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {auditOrders.map((ord: any) => {
                    const custPrice = Number(ord.customer_price_idr || 0);
                    const provQuote = Number(ord.provider_quote_idr || 0);
                    const marginIdr = Number(ord.platform_margin_idr || (custPrice - provQuote));
                    const marginPct = custPrice > 0 ? ((marginIdr / custPrice) * 100).toFixed(1) : '0';
                    return (
                      <tr key={ord.order_id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                        <td className="py-4">
                          <p className="font-bold text-zinc-200 font-mono text-xs">{ord.tracking_number || ord.order_id.slice(0, 8)}</p>
                          <p className="text-[10px] text-zinc-500 font-mono">{ord.order_id.slice(0, 8)}</p>
                        </td>
                        <td className="py-4">
                          <span className="px-2 py-1 rounded bg-white/5 text-xs font-bold text-zinc-300 uppercase">{ord.courier_provider} - {ord.service_type}</span>
                        </td>
                        <td className="py-4 text-zinc-300 text-xs">{ord.origin_city} → {ord.destination_city}</td>
                        <td className="py-4 text-zinc-400">{ord.weight_kg} kg</td>
                        <td className="py-4 font-bold text-white">{formatCurrency(custPrice)}</td>
                        <td className="py-4 font-medium text-zinc-400">{formatCurrency(provQuote)}</td>
                        <td className="py-4 font-bold text-emerald-400">{formatCurrency(marginIdr)}</td>
                        <td className="py-4">
                          <span className={cn(
                            "px-2 py-0.5 rounded text-xs font-black",
                            Number(marginPct) >= 15 ? "bg-emerald-500/10 text-emerald-400" : Number(marginPct) >= 5 ? "bg-amber-500/10 text-amber-400" : "bg-red-500/10 text-red-400"
                          )}>
                            {marginPct}%
                          </span>
                        </td>
                        <td className="py-4 text-zinc-500 text-xs">{ord.created_at ? format(new Date(ord.created_at), 'dd MMM yyyy, HH:mm') : '-'}</td>
                      </tr>
                    );
                  })}
                  {auditOrders.length === 0 && (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-zinc-500">Belum ada pesanan tercatat untuk audit tarif.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modal for Create Card */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-white/10 p-8 rounded-[36px] w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-black text-white italic uppercase tracking-tight mb-6">Create Rate Card</h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Provider Name</label>
                  <input type="text" value={formData.provider_name} onChange={e => setFormData({...formData, provider_name: e.target.value})} className="mt-1 w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-primary" placeholder="e.g. JNE" />
                </div>
                <div>
                  <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Service Code</label>
                  <input type="text" value={formData.service_code} onChange={e => setFormData({...formData, service_code: e.target.value})} className="mt-1 w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-primary" placeholder="e.g. REG" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Volumetric Divisor</label>
                  <input type="number" value={formData.volumetric_divisor} onChange={e => setFormData({...formData, volumetric_divisor: Number(e.target.value)})} className="mt-1 w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-primary" />
                </div>
                <div>
                  <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Min Weight (Kg)</label>
                  <input type="number" step="0.1" value={formData.min_weight_kg} onChange={e => setFormData({...formData, min_weight_kg: e.target.value})} className="mt-1 w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-primary" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Fuel Surcharge (%)</label>
                  <input type="number" step="0.1" value={formData.fuel_surcharge_pct} onChange={e => setFormData({...formData, fuel_surcharge_pct: e.target.value})} className="mt-1 w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-primary" />
                </div>
                <div>
                  <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Remote Area Surcharge (IDR)</label>
                  <input type="number" value={formData.remote_area_surcharge_idr} onChange={e => setFormData({...formData, remote_area_surcharge_idr: e.target.value})} className="mt-1 w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-primary" />
                </div>
              </div>
              
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Insurance Rate (%)</label>
                  <input type="number" step="0.1" value={formData.insurance_fee_pct} onChange={e => setFormData({...formData, insurance_fee_pct: e.target.value})} className="mt-1 w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-primary" />
                </div>
                <div>
                  <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Ins. Min Fee (IDR)</label>
                  <input type="number" value={formData.insurance_min_fee_idr} onChange={e => setFormData({...formData, insurance_min_fee_idr: e.target.value})} className="mt-1 w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-primary" />
                </div>
                <div>
                  <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Return Fee (%)</label>
                  <input type="number" value={formData.return_fee_pct} onChange={e => setFormData({...formData, return_fee_pct: e.target.value})} className="mt-1 w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-primary" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Effective From</label>
                  <input type="date" value={formData.effective_from} onChange={e => setFormData({...formData, effective_from: e.target.value})} className="mt-1 w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-primary" />
                </div>
                <div>
                  <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Effective To (Optional)</label>
                  <input type="date" value={formData.effective_to || ''} onChange={e => setFormData({...formData, effective_to: e.target.value})} className="mt-1 w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-primary" />
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-8 pt-4 border-t border-white/10">
                <button 
                  onClick={() => setIsModalOpen(false)}
                  className="px-6 py-2 rounded-xl text-zinc-400 font-bold hover:text-white hover:bg-white/5 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleSaveCard}
                  disabled={saveCardMutation.isPending}
                  className="px-6 py-2 rounded-xl bg-primary text-white font-black uppercase tracking-widest hover:bg-primary-light transition-colors flex items-center gap-2"
                >
                  {saveCardMutation.isPending && <Loader2 size={16} className="animate-spin" />}
                  Create Rate Card
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

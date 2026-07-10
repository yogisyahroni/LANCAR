import { useState, useEffect } from 'react'
import { 
  Receipt, 
  TrendingUp, 
  Save, 
  Plus,
  Loader2,
  AlertTriangle,
  Download,
  Calendar,
  Percent,
  CheckCircle2,
  XCircle,
  FileText
} from 'lucide-react'
import { 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar
} from 'recharts'
import { cn } from '../lib/utils'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { toast } from 'sonner'
import { format } from 'date-fns'

interface TaxRule {
  id: string
  code: string
  name: string
  tax_type: 'PPN' | 'PPh'
  effective_rate_pct: string
  statutory_rate_pct: string
  dpp_formula: string
  invoice_required: boolean
  effective_from: string
  effective_to: string | null
}

export default function TaxCenter() {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<'dashboard' | 'rules' | 'efaktur'>('dashboard')
  const [isRuleModalOpen, setIsRuleModalOpen] = useState(false)
  const [editingRule, setEditingRule] = useState<TaxRule | null>(null)
  
  const [formData, setFormData] = useState<Partial<TaxRule>>({
    code: '',
    name: '',
    tax_type: 'PPN',
    effective_rate_pct: '',
    statutory_rate_pct: '',
    dpp_formula: '',
    invoice_required: true,
    effective_from: new Date().toISOString().split('T')[0],
    effective_to: ''
  })

  const { data: dashboardRawData, isLoading: isLoadingDashboard } = useQuery({
    queryKey: ['tax-dashboard'],
    queryFn: async () => {
      const res = await api.get('/admin/finance/tax-dashboard')
      return res.data?.data || {}
    }
  })

  const { data: rulesData, isLoading: isLoadingRules } = useQuery({
    queryKey: ['tax-rules'],
    queryFn: async () => {
      const res = await api.get('/admin/finance/tax-rules')
      return res.data?.data || []
    }
  })

  const saveRuleMutation = useMutation({
    mutationFn: async (rule: Partial<TaxRule>) => {
      if (editingRule?.id) {
        const res = await api.patch(`/admin/finance/tax-rules/${editingRule.id}`, rule)
        return res.data
      } else {
        const res = await api.post('/admin/finance/tax-rules', rule)
        return res.data
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tax-rules'] })
      toast.success(editingRule ? 'Tax Rule updated successfully' : 'Tax Rule created successfully')
      setIsRuleModalOpen(false)
      setEditingRule(null)
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || `Failed to save rule: ${err.message}`)
    }
  })

  const handleOpenModal = (rule?: TaxRule) => {
    if (rule) {
      setEditingRule(rule)
      setFormData({
        ...rule,
        effective_from: rule.effective_from ? new Date(rule.effective_from).toISOString().split('T')[0] : '',
        effective_to: rule.effective_to ? new Date(rule.effective_to).toISOString().split('T')[0] : ''
      })
    } else {
      setEditingRule(null)
      setFormData({
        code: '',
        name: '',
        tax_type: 'PPN',
        effective_rate_pct: '',
        statutory_rate_pct: '',
        dpp_formula: '',
        invoice_required: true,
        effective_from: new Date().toISOString().split('T')[0],
        effective_to: ''
      })
    }
    setIsRuleModalOpen(true)
  }

  const handleSaveRule = () => {
    if (!formData.code || !formData.name || !formData.effective_rate_pct || !formData.dpp_formula || !formData.effective_from) {
      toast.error('Code, Name, Rate, Formula, and Effective Date are required.')
      return
    }
    saveRuleMutation.mutate(formData)
  }

  if (isLoadingDashboard || isLoadingRules) {
    return (
      <div className="h-[80vh] flex items-center justify-center">
        <Loader2 className="w-12 h-12 text-primary animate-spin" />
      </div>
    )
  }

  // Extract data sections whether backend returns array or structured object
  const summaryList = Array.isArray(dashboardRawData) ? dashboardRawData : (dashboardRawData?.summary || []);
  const efakturList = Array.isArray(dashboardRawData) ? [] : (dashboardRawData?.efakturs || []);
  const withholdingList = Array.isArray(dashboardRawData) ? [] : (dashboardRawData?.withholdings || []);
  const mismatchList = Array.isArray(dashboardRawData) ? [] : (dashboardRawData?.mismatches || []);

  // Format chart data (reverse to show chronological order)
  const chartData = [...summaryList].reverse().map((d: any) => ({
    name: d.month,
    DPP: Number(d.total_dpp_idr || 0),
    PPN: Number(d.total_ppn_idr || 0)
  }))

  const formatCurrency = (val: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(val)

  return (
    <div className="space-y-8 animate-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold text-zinc-100 tracking-tight flex items-center gap-3">
            <Receipt className="text-primary" /> Tax Center
          </h1>
          <p className="text-zinc-500 mt-1">Manage PPN, PPh, and track historical tax snapshots securely.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={async () => {
              try {
                const res = await api.get('/admin/finance/tax-pack/export', { responseType: 'blob' })
                const url = window.URL.createObjectURL(new Blob([res.data]))
                const link = document.createElement('a')
                link.href = url
                link.setAttribute('download', `tax_pack_${new Date().toISOString().slice(0, 10)}.csv`)
                document.body.appendChild(link)
                link.click()
                link.remove()
                toast.success('Tax pack CSV exported successfully')
              } catch (err) {
                toast.error('Gagal export tax pack')
              }
            }}
            className="px-5 py-3 rounded-2xl bg-white/5 border border-white/10 text-zinc-200 font-black text-xs uppercase tracking-widest hover:bg-white/10 transition-all flex items-center gap-2"
          >
            <Download size={16} /> Export Tax Pack
          </button>
          {activeTab === 'rules' && (
            <button 
              onClick={() => handleOpenModal()}
              className="px-6 py-3 rounded-2xl bg-primary text-white font-black text-sm uppercase tracking-widest shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center gap-2"
            >
              <Plus size={18} /> New Rule
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 p-1 rounded-2xl bg-white/[0.03] border border-white/5 w-fit">
        {[
          { id: 'dashboard', label: 'Overview', icon: TrendingUp },
          { id: 'efaktur', label: 'e-Faktur & Withholding', icon: FileText },
          { id: 'rules', label: 'Tax Rules', icon: Percent },
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

      {activeTab === 'dashboard' && (
        <div className="space-y-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 glass-card p-8 rounded-[36px] border-white/5 space-y-6">
              <h3 className="text-xl font-black text-zinc-100 italic uppercase">Tax Revenue Trend (12 Months)</h3>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="colorPpn" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#006437" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#006437" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis dataKey="name" stroke="rgba(255,255,255,0.2)" fontSize={12} tickMargin={10} />
                    <YAxis stroke="rgba(255,255,255,0.2)" fontSize={12} tickFormatter={(value) => `Rp${value/1000000}M`} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#18181b', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '16px' }}
                      formatter={(value: any) => formatCurrency(value)}
                    />
                    <Area type="monotone" dataKey="PPN" stroke="#006437" strokeWidth={3} fillOpacity={1} fill="url(#colorPpn)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="glass-card p-8 rounded-[36px] border-white/5 space-y-6">
               <h3 className="text-xl font-black text-zinc-100 italic uppercase">Recent Months Summary</h3>
               <div className="space-y-4">
                 {summaryList.slice(0, 5).map((d: any) => (
                   <div key={d.month} className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 flex items-center justify-between">
                     <div>
                       <p className="font-bold text-zinc-200">{d.month}</p>
                       <p className="text-xs text-zinc-500">{d.transaction_count} transactions</p>
                     </div>
                     <div className="text-right">
                       <p className="font-black text-primary-light">{formatCurrency(Number(d.total_ppn_idr || 0))}</p>
                       <p className="text-[10px] text-zinc-500 uppercase tracking-widest">PPN Collected</p>
                     </div>
                   </div>
                 ))}
               </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'efaktur' && (
        <div className="space-y-8 animate-in">
          <div className="glass-card p-8 rounded-[36px] border-white/5 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-black text-zinc-100 italic uppercase">Daftar e-Faktur Pajak (PPN Keluaran)</h3>
                <p className="text-sm text-zinc-500 mt-1">Snapshot faktur pajak untuk ekspor e-Faktur DJP dan audit rekonsiliasi.</p>
              </div>
              {mismatchList.length > 0 && (
                <span className="px-3 py-1 bg-red-500/10 text-red-400 text-xs font-black uppercase tracking-widest rounded-full flex items-center gap-1.5">
                  <AlertTriangle size={14} /> {mismatchList.length} Mismatches Terdeteksi
                </span>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[800px]">
                <thead>
                  <tr className="border-b border-white/5">
                    {['No Faktur', 'Order ID', 'NPWP / Pelanggan', 'DPP (IDR)', 'PPN (IDR)', 'Tarif %', 'Tanggal', 'Status'].map(h => (
                      <th key={h} className="pb-4 text-left text-[10px] font-black text-zinc-500 uppercase tracking-widest">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {efakturList.map((row: any) => (
                    <tr key={row.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                      <td className="py-4 font-mono text-xs text-primary-light">{row.faktur_number || row.id.slice(0, 8)}</td>
                      <td className="py-4 font-mono text-xs text-zinc-400">{row.order_id?.slice(0, 8) || '-'}</td>
                      <td className="py-4 font-bold text-zinc-200">{row.npwp || row.customer_name || 'Pelanggan Umum'}</td>
                      <td className="py-4 text-zinc-300">{formatCurrency(Number(row.dpp_idr || 0))}</td>
                      <td className="py-4 font-bold text-emerald-400">{formatCurrency(Number(row.ppn_idr || 0))}</td>
                      <td className="py-4 text-zinc-400">{row.rate_pct || 11}%</td>
                      <td className="py-4 text-zinc-500 text-xs">{row.created_at ? format(new Date(row.created_at), 'dd MMM yyyy') : '-'}</td>
                      <td className="py-4">
                        <span className="px-2.5 py-1 rounded-md bg-emerald-500/10 text-emerald-400 text-[10px] font-black uppercase">
                          {row.status || 'READY'}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {efakturList.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-zinc-500">Belum ada snapshot e-Faktur tercatat.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="glass-card p-8 rounded-[36px] border-white/5 space-y-6">
            <div>
              <h3 className="text-xl font-black text-zinc-100 italic uppercase">PPh Withholding Summary (PPh 21 / PPh 23)</h3>
              <p className="text-sm text-zinc-500 mt-1">Pemotongan pajak penghasilan atas pencairan mitra kurir dan merchant.</p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[700px]">
                <thead>
                  <tr className="border-b border-white/5">
                    {['Bulan / Periode', 'Tipe Pajak', 'Mitra / Kategori', 'Total DPP', 'Total PPh Dipotong', 'Status Bukti Potong'].map(h => (
                      <th key={h} className="pb-4 text-left text-[10px] font-black text-zinc-500 uppercase tracking-widest">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {withholdingList.map((w: any, i: number) => (
                    <tr key={i} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                      <td className="py-4 font-bold text-zinc-200">{w.period || w.month || '-'}</td>
                      <td className="py-4">
                        <span className="px-2.5 py-1 rounded-md bg-blue-500/10 text-blue-400 text-[10px] font-black uppercase">
                          {w.tax_type || 'PPh 23'}
                        </span>
                      </td>
                      <td className="py-4 text-zinc-300">{w.category || 'Mitra Kurir & Merchant'}</td>
                      <td className="py-4 text-zinc-400">{formatCurrency(Number(w.total_dpp || 0))}</td>
                      <td className="py-4 font-bold text-amber-400">{formatCurrency(Number(w.total_pph || 0))}</td>
                      <td className="py-4">
                        <span className="px-2.5 py-1 rounded-md bg-emerald-500/10 text-emerald-400 text-[10px] font-black uppercase">
                          TERBIT
                        </span>
                      </td>
                    </tr>
                  ))}
                  {withholdingList.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-zinc-500">Belum ada data potong PPh tercatat.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'rules' && (
        <div className="glass-card p-8 rounded-[36px] border-white/5 space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-black text-zinc-100 italic uppercase">Tax Config Engine</h3>
            <span className="px-3 py-1 bg-amber-500/10 text-amber-400 text-[10px] font-black uppercase tracking-widest rounded-full">
              Rules apply to new orders only
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[800px]">
              <thead>
                <tr className="border-b border-white/5">
                  {['Code', 'Name', 'Type', 'Effective %', 'Statutory %', 'Formula', 'Invoice Req', 'Period', 'Actions'].map(h => (
                    <th key={h} className="pb-4 text-left text-[10px] font-black text-zinc-600 uppercase tracking-widest">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(rulesData || []).map((rule: TaxRule) => (
                  <tr key={rule.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                    <td className="py-4">
                      <span className="font-mono text-xs text-zinc-300 bg-white/5 px-2 py-1 rounded">{rule.code}</span>
                    </td>
                    <td className="py-4 font-bold text-zinc-200">{rule.name}</td>
                    <td className="py-4">
                      <span className={cn(
                        "px-2 py-1 rounded-md text-[10px] font-black uppercase",
                        rule.tax_type === 'PPN' ? "bg-emerald-500/10 text-emerald-400" : "bg-blue-500/10 text-blue-400"
                      )}>
                        {rule.tax_type}
                      </span>
                    </td>
                    <td className="py-4 font-black text-primary-light">{rule.effective_rate_pct}%</td>
                    <td className="py-4 text-zinc-400">{rule.statutory_rate_pct}%</td>
                    <td className="py-4 text-zinc-400 font-mono text-xs">{rule.dpp_formula}</td>
                    <td className="py-4">
                      {rule.invoice_required ? <CheckCircle2 size={16} className="text-emerald-400" /> : <XCircle size={16} className="text-zinc-600" />}
                    </td>
                    <td className="py-4 text-zinc-500 text-xs">
                      {format(new Date(rule.effective_from), 'MMM d, yyyy')} - {rule.effective_to ? format(new Date(rule.effective_to), 'MMM d, yyyy') : 'Present'}
                    </td>
                    <td className="py-4">
                      <button 
                        onClick={() => handleOpenModal(rule)}
                        className="text-[10px] font-bold text-primary hover:text-primary-light uppercase tracking-widest transition-colors"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
                {rulesData?.length === 0 && (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-zinc-500">No tax rules configured.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal for Edit/Create */}
      {isRuleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-white/10 p-8 rounded-[36px] w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-black text-white italic uppercase tracking-tight mb-6">
              {editingRule ? 'Edit Tax Rule' : 'Create Tax Rule'}
            </h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Rule Code</label>
                  <input type="text" value={formData.code} onChange={e => setFormData({...formData, code: e.target.value})} disabled={!!editingRule} className="mt-1 w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-primary disabled:opacity-50" placeholder="e.g. PPN_RETAIL_1" />
                </div>
                <div>
                  <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Name</label>
                  <input type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="mt-1 w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-primary" placeholder="e.g. PPN Retail Standard" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Tax Type</label>
                  <select value={formData.tax_type} onChange={e => setFormData({...formData, tax_type: e.target.value as any})} className="mt-1 w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-primary">
                    <option value="PPN">PPN (VAT)</option>
                    <option value="PPh">PPh (Income Tax)</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">DPP Formula</label>
                  <input type="text" value={formData.dpp_formula} onChange={e => setFormData({...formData, dpp_formula: e.target.value})} className="mt-1 w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-primary font-mono text-sm" placeholder="e.g. (100/100) * total_amount" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Effective Rate (%)</label>
                  <input type="number" step="0.01" value={formData.effective_rate_pct} onChange={e => setFormData({...formData, effective_rate_pct: e.target.value})} className="mt-1 w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-primary" placeholder="e.g. 1.1" />
                </div>
                <div>
                  <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Statutory Rate (%)</label>
                  <input type="number" step="0.01" value={formData.statutory_rate_pct} onChange={e => setFormData({...formData, statutory_rate_pct: e.target.value})} className="mt-1 w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-primary" placeholder="e.g. 11.0" />
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

              <div className="flex items-center gap-2 mt-4">
                <input type="checkbox" id="inv_req" checked={formData.invoice_required} onChange={e => setFormData({...formData, invoice_required: e.target.checked})} className="rounded bg-black/20 border-white/10 text-primary" />
                <label htmlFor="inv_req" className="text-sm text-zinc-300">Requires Tax Invoice (Faktur Pajak)</label>
              </div>

              <div className="flex justify-end gap-3 mt-8 pt-4 border-t border-white/10">
                <button 
                  onClick={() => setIsRuleModalOpen(false)}
                  className="px-6 py-2 rounded-xl text-zinc-400 font-bold hover:text-white hover:bg-white/5 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleSaveRule}
                  disabled={saveRuleMutation.isPending}
                  className="px-6 py-2 rounded-xl bg-primary text-white font-black uppercase tracking-widest hover:bg-primary-light transition-colors flex items-center gap-2"
                >
                  {saveRuleMutation.isPending && <Loader2 size={16} className="animate-spin" />}
                  Save Rule
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

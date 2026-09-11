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
import { StatusBadge } from '../components/StatusBadge'
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
import { AdminPageSkeleton } from '../components/ui/Skeleton'
import { FocusTrap } from '../components/a11y/FocusTrap'
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
    return <AdminPageSkeleton />
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
          <h1 className="text-3xl font-bold text-foreground-muted tracking-tight flex items-center gap-3">
            <Receipt className="text-primary"  aria-hidden="true"/> Tax Center
          </h1>
          <p className="text-foreground-muted mt-1">Manage PPN, PPh, and track historical tax snapshots securely.</p>
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
            className="px-5 py-3 rounded-2xl bg-surface-subtle border border-border text-foreground-muted font-black text-xs uppercase tracking-wide hover:bg-surface-subtle transition-all flex items-center gap-2"
          >
            <Download size={16} aria-hidden="true" /> Export Tax Pack
          </button>
          {activeTab === 'rules' && (
            <button 
              onClick={() => handleOpenModal()}
              className="px-6 py-3 rounded-2xl bg-primary text-on-primary font-black text-sm uppercase tracking-wide shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center gap-2"
            >
              <Plus size={18} aria-hidden="true" /> New Rule
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 p-1 rounded-2xl bg-surface/[0.03] border border-border w-fit">
        {[
          { id: 'dashboard', label: 'Overview', icon: TrendingUp },
          { id: 'efaktur', label: 'e-Faktur & Withholding', icon: FileText },
          { id: 'rules', label: 'Tax Rules', icon: Percent },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id as any)}
            className={cn(
              'flex items-center gap-2 px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-wide transition-all',
              activeTab === id
                ? 'bg-surface-raised text-foreground shadow-lg'
                : 'text-foreground-muted hover:text-foreground-muted hover:bg-surface-subtle'
            )}
          >
            <Icon size={14} aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'dashboard' && (
        <div className="space-y-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 glass-card p-8 rounded-[36px] border-border space-y-6">
              <h2 className="text-xl font-black text-foreground-muted italic uppercase">Tax Revenue Trend (12 Months)</h2>
              <div
                className="h-[300px] w-full"
                role="img"
                aria-label="Tax revenue trend chart"
                aria-describedby="tax-revenue-trend-summary"
              >
                <p id="tax-revenue-trend-summary" className="sr-only">
                  Tax revenue by month:{' '}
                  {chartData.length > 0
                    ? chartData.map((item: any) => `${item.name}: ${item.PPN ?? 0}`).join('; ')
                    : 'Belum ada data.'}
                  .
                </p>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="colorPpn" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" strokeOpacity={0.5} vertical={false} />
                    <XAxis dataKey="name" stroke="var(--color-foreground-muted)" fontSize={12} tickMargin={10} />
                    <YAxis stroke="var(--color-foreground-muted)" fontSize={12} tickFormatter={(value) => `Rp${value/1000000}M`} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: 'var(--color-surface-raised)', borderColor: 'var(--color-border)', borderRadius: '16px', color: 'var(--color-foreground)' }}
                      formatter={(value: any) => formatCurrency(value)}
                    />
                    <Area type="monotone" dataKey="PPN" stroke="var(--color-primary)" strokeWidth={3} fillOpacity={1} fill="url(#colorPpn)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="glass-card p-8 rounded-[36px] border-border space-y-6">
               <h2 className="text-xl font-black text-foreground-muted italic uppercase">Recent Months Summary</h2>
               <div className="space-y-4">
                 {summaryList.slice(0, 5).map((d: any) => (
                   <div key={d.month} className="p-4 rounded-2xl bg-surface/[0.02] border border-border flex items-center justify-between">
                     <div>
                       <p className="font-bold text-foreground-muted">{d.month}</p>
                       <p className="text-xs text-foreground-muted">{d.transaction_count} transactions</p>
                     </div>
                     <div className="text-right">
                       <p className="font-black text-primary-light">{formatCurrency(Number(d.total_ppn_idr || 0))}</p>
                       <p className="text-xs text-foreground-muted uppercase tracking-wide">PPN Collected</p>
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
          <div className="glass-card p-8 rounded-[36px] border-border space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-black text-foreground-muted italic uppercase">Daftar e-Faktur Pajak (PPN Keluaran)</h2>
                <p className="text-sm text-foreground-muted mt-1">Snapshot faktur pajak untuk ekspor e-Faktur DJP dan audit rekonsiliasi.</p>
              </div>
              {mismatchList.length > 0 && (
                <StatusBadge status="critical" label={`${mismatchList.length} mismatch terdeteksi`} labelPrefix="Tax reconciliation" className="border-error bg-error-surface" />
              )}
            </div>

            <div role="region" aria-label="Tax center obligations table" tabIndex={0} className="overflow-x-auto">
              <table className="w-full text-sm min-w-[800px]">
                <thead>
                  <tr className="border-b border-border">
                    {['No Faktur', 'Order ID', 'NPWP / Pelanggan', 'DPP (IDR)', 'PPN (IDR)', 'Tarif %', 'Tanggal', 'Status'].map(h => (
                      <th scope="col" key={h} className="pb-4 text-left text-xs font-black text-foreground-muted uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {efakturList.map((row: any) => (
                    <tr key={row.id} className="border-b border-border/[0.03] hover:bg-surface/[0.02] transition-colors">
                      <td className="py-4 font-mono text-xs text-primary-light">{row.faktur_number || row.id.slice(0, 8)}</td>
                      <td className="py-4 font-mono text-xs text-foreground-muted">{row.order_id?.slice(0, 8) || '-'}</td>
                      <td className="py-4 font-bold text-foreground-muted">{row.npwp || row.customer_name || 'Pelanggan Umum'}</td>
                      <td className="py-4 text-foreground-muted">{formatCurrency(Number(row.dpp_idr || 0))}</td>
                      <td className="py-4 font-bold text-success">{formatCurrency(Number(row.ppn_idr || 0))}</td>
                      <td className="py-4 text-foreground-muted">{row.rate_pct || 11}%</td>
                      <td className="py-4 text-foreground-muted text-xs">{row.created_at ? format(new Date(row.created_at), 'dd MMM yyyy') : '-'}</td>
                      <td className="py-4">
                        <StatusBadge status={row.status || 'ready'} labelPrefix="Tax document status" className="rounded-md" />
                      </td>
                    </tr>
                  ))}
                  {efakturList.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-foreground-muted">Belum ada snapshot e-Faktur tercatat.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="glass-card p-8 rounded-[36px] border-border space-y-6">
            <div>
              <h2 className="text-xl font-black text-foreground-muted italic uppercase">PPh Withholding Summary (PPh 21 / PPh 23)</h2>
              <p className="text-sm text-foreground-muted mt-1">Pemotongan pajak penghasilan atas pencairan mitra kurir dan merchant.</p>
            </div>

            <div role="region" aria-label="Tax center certificates table" tabIndex={0} className="overflow-x-auto">
              <table className="w-full text-sm min-w-[700px]">
                <thead>
                  <tr className="border-b border-border">
                    {['Bulan / Periode', 'Tipe Pajak', 'Mitra / Kategori', 'Total DPP', 'Total PPh Dipotong', 'Status Bukti Potong'].map(h => (
                      <th scope="col" key={h} className="pb-4 text-left text-xs font-black text-foreground-muted uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {withholdingList.map((w: any, i: number) => (
                    <tr key={i} className="border-b border-border/[0.03] hover:bg-surface/[0.02] transition-colors">
                      <td className="py-4 font-bold text-foreground-muted">{w.period || w.month || '-'}</td>
                      <td className="py-4">
                        <span className="px-2.5 py-1 rounded-md bg-info-surface text-info text-xs font-bold tracking-wide">
                          {w.tax_type || 'PPh 23'}
                        </span>
                      </td>
                      <td className="py-4 text-foreground-muted">{w.category || 'Mitra Kurir & Merchant'}</td>
                      <td className="py-4 text-foreground-muted">{formatCurrency(Number(w.total_dpp || 0))}</td>
                      <td className="py-4 font-bold text-warning">{formatCurrency(Number(w.total_pph || 0))}</td>
                      <td className="py-4">
                        <StatusBadge status="published" label="Terbit" labelPrefix="Withholding certificate status" className="rounded-md" />
                      </td>
                    </tr>
                  ))}
                  {withholdingList.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-foreground-muted">Belum ada data potong PPh tercatat.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'rules' && (
        <div className="glass-card p-8 rounded-[36px] border-border space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-black text-foreground-muted italic uppercase">Tax Config Engine</h2>
            <span className="px-3 py-1 bg-warning-surface text-warning text-xs font-black uppercase tracking-wide rounded-full">
              Rules apply to new orders only
            </span>
          </div>

          <div role="region" aria-label="Tax center audit table" tabIndex={0} className="overflow-x-auto">
            <table className="w-full text-sm min-w-[800px]">
              <thead>
                <tr className="border-b border-border">
                  {['Code', 'Name', 'Type', 'Effective %', 'Statutory %', 'Formula', 'Invoice Req', 'Period', 'Actions'].map(h => (
                    <th scope="col" key={h} className="pb-4 text-left text-xs font-black text-foreground-muted uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(rulesData || []).map((rule: TaxRule) => (
                  <tr key={rule.id} className="border-b border-border/[0.03] hover:bg-surface/[0.02] transition-colors">
                    <td className="py-4">
                      <span className="font-mono text-xs text-foreground-muted bg-surface-subtle px-2 py-1 rounded">{rule.code}</span>
                    </td>
                    <td className="py-4 font-bold text-foreground-muted">{rule.name}</td>
                    <td className="py-4">
                      <span className={cn(
                        "px-2.5 py-1 rounded-md text-xs font-bold tracking-wide",
                        rule.tax_type === 'PPN' ? "bg-success-surface text-success" : "bg-info-surface text-info"
                      )}>
                        {rule.tax_type}
                      </span>
                    </td>
                    <td className="py-4 font-black text-primary-light">{rule.effective_rate_pct}%</td>
                    <td className="py-4 text-foreground-muted">{rule.statutory_rate_pct}%</td>
                    <td className="py-4 text-foreground-muted font-mono text-xs">{rule.dpp_formula}</td>
                    <td className="py-4">
                      {rule.invoice_required ? <CheckCircle2 size={16} className="text-success" aria-hidden="true" /> : <XCircle size={16} className="text-foreground-muted" aria-hidden="true" />}
                    </td>
                    <td className="py-4 text-foreground-muted text-xs">
                      {format(new Date(rule.effective_from), 'MMM d, yyyy')} - {rule.effective_to ? format(new Date(rule.effective_to), 'MMM d, yyyy') : 'Present'}
                    </td>
                    <td className="py-4">
                      <button 
                        onClick={() => handleOpenModal(rule)}
                        type="button"
                        className="text-xs font-bold tracking-wide text-primary hover:text-primary-light transition-colors"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
                {rulesData?.length === 0 && (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-foreground-muted">No tax rules configured.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal for Edit/Create */}
      {isRuleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-scrim/60 backdrop-blur-sm">
          <FocusTrap active={isRuleModalOpen} className="w-full max-w-2xl max-h-[90vh]">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="tax-rule-title"
            onKeyDown={(event) => {
              if (event.key === 'Escape') setIsRuleModalOpen(false)
            }}
            className="bg-surface border border-border p-8 rounded-[36px] w-full max-w-2xl max-h-[90vh] overflow-y-auto"
          >
            <h2 id="tax-rule-title" className="text-2xl font-black text-foreground italic uppercase tracking-tight mb-6">
              {editingRule ? 'Edit Tax Rule' : 'Create Tax Rule'}
            </h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-foreground-muted tracking-wide">Rule Code</label>
                  <input type="text" value={formData.code} onChange={e => setFormData({...formData, code: e.target.value})} disabled={!!editingRule} className="mt-1 w-full bg-surface-subtle border border-border rounded-xl px-4 py-2 text-foreground focus:outline-none focus:border-primary disabled:opacity-60" placeholder="e.g. PPN_RETAIL_1" />
                </div>
                <div>
                  <label className="text-xs font-bold text-foreground-muted tracking-wide">Name</label>
                  <input type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="mt-1 w-full bg-surface-subtle border border-border rounded-xl px-4 py-2 text-foreground focus:outline-none focus:border-primary" placeholder="e.g. PPN Retail Standard" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-foreground-muted tracking-wide">Tax Type</label>
                  <select value={formData.tax_type} onChange={e => setFormData({...formData, tax_type: e.target.value as any})} className="mt-1 w-full bg-surface-subtle border border-border rounded-xl px-4 py-2 text-foreground focus:outline-none focus:border-primary">
                    <option value="PPN">PPN (VAT)</option>
                    <option value="PPh">PPh (Income Tax)</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-foreground-muted tracking-wide">DPP Formula</label>
                  <input type="text" value={formData.dpp_formula} onChange={e => setFormData({...formData, dpp_formula: e.target.value})} className="mt-1 w-full bg-surface-subtle border border-border rounded-xl px-4 py-2 text-foreground focus:outline-none focus:border-primary font-mono text-sm" placeholder="e.g. (100/100) * total_amount" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-foreground-muted tracking-wide">Effective Rate (%)</label>
                  <input type="number" step="0.01" value={formData.effective_rate_pct} onChange={e => setFormData({...formData, effective_rate_pct: e.target.value})} className="mt-1 w-full bg-surface-subtle border border-border rounded-xl px-4 py-2 text-foreground focus:outline-none focus:border-primary" placeholder="e.g. 1.1" />
                </div>
                <div>
                  <label className="text-xs font-bold text-foreground-muted tracking-wide">Statutory Rate (%)</label>
                  <input type="number" step="0.01" value={formData.statutory_rate_pct} onChange={e => setFormData({...formData, statutory_rate_pct: e.target.value})} className="mt-1 w-full bg-surface-subtle border border-border rounded-xl px-4 py-2 text-foreground focus:outline-none focus:border-primary" placeholder="e.g. 11.0" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-foreground-muted tracking-wide">Effective From</label>
                  <input type="date" value={formData.effective_from} onChange={e => setFormData({...formData, effective_from: e.target.value})} className="mt-1 w-full bg-surface-subtle border border-border rounded-xl px-4 py-2 text-foreground focus:outline-none focus:border-primary" />
                </div>
                <div>
                  <label className="text-xs font-bold text-foreground-muted tracking-wide">Effective To (Optional)</label>
                  <input type="date" value={formData.effective_to || ''} onChange={e => setFormData({...formData, effective_to: e.target.value})} className="mt-1 w-full bg-surface-subtle border border-border rounded-xl px-4 py-2 text-foreground focus:outline-none focus:border-primary" />
                </div>
              </div>

              <div className="flex items-center gap-2 mt-4">
                <input type="checkbox" id="inv_req" checked={formData.invoice_required} onChange={e => setFormData({...formData, invoice_required: e.target.checked})} className="rounded bg-surface-subtle border-border text-primary" />
                <label htmlFor="inv_req" className="text-sm text-foreground-muted">Requires Tax Invoice (Faktur Pajak)</label>
              </div>

              <div className="flex justify-end gap-3 mt-8 pt-4 border-t border-border">
                <button
                  type="button"
                  onClick={() => setIsRuleModalOpen(false)}
                  className="px-6 py-2 rounded-xl text-foreground-muted font-bold hover:text-foreground hover:bg-surface-subtle transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveRule}
                  disabled={saveRuleMutation.isPending}
                  className="px-6 py-2 rounded-xl bg-primary text-on-primary font-black uppercase tracking-wide hover:bg-primary-light transition-colors flex items-center gap-2"
                >
                  {saveRuleMutation.isPending && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
                  Save Rule
                </button>
              </div>
            </div>
          </div>
          </FocusTrap>
        </div>
      )}
    </div>
  )
}

import { useMemo, useState } from 'react'
import { Download, FileChartColumn, Loader2, RefreshCw } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { toast } from 'sonner'

type ReportRow = {
  bucket: string
  total_orders: number
  completed_orders: number
  failed_orders: number
  gross_revenue_idr: number
  average_order_value_idr: number
}

const money = (value: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(value || 0))

export default function CustomReports() {
  const [range, setRange] = useState('30D')
  const [groupBy, setGroupBy] = useState('day')
  const query = useQuery({
    queryKey: ['admin-custom-report', range, groupBy],
    queryFn: async () => (await api.get('/admin/analytics/custom-report', { params: { range, group_by: groupBy } })).data,
    staleTime: 30_000,
  })
  const rows = (query.data?.data || []) as ReportRow[]
  const totals = useMemo(() => rows.reduce((acc, row) => ({
    orders: acc.orders + Number(row.total_orders || 0),
    completed: acc.completed + Number(row.completed_orders || 0),
    failed: acc.failed + Number(row.failed_orders || 0),
    revenue: acc.revenue + Number(row.gross_revenue_idr || 0),
  }), { orders: 0, completed: 0, failed: 0, revenue: 0 }), [rows])

  const downloadCsv = () => {
    if (!rows.length) { toast.info('Tidak ada data untuk diekspor'); return }
    const header = ['Bucket', 'Total Orders', 'Completed', 'Failed', 'Gross Revenue IDR', 'AOV IDR']
    const body = rows.map((row) => [row.bucket, row.total_orders, row.completed_orders, row.failed_orders, row.gross_revenue_idr, row.average_order_value_idr])
    const csv = [header, ...body].map((line) => line.map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `tembus-custom-report-${range.toLowerCase()}-${groupBy}.csv`; anchor.click(); URL.revokeObjectURL(url)
  }

  return <div className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="text-xs font-black uppercase tracking-[0.32em] text-primary-light">Analytics workspace</p><h1 className="mt-2 text-3xl font-black text-zinc-100">Custom Report Builder</h1><p className="mt-2 text-sm text-zinc-500">Bangun laporan order dari data database, tanpa angka demo.</p></div>
      <button type="button" onClick={downloadCsv} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-3 text-xs font-black uppercase tracking-widest text-white"><Download className="h-4 w-4" /> Export CSV</button>
    </div>
    <div className="grid gap-4 rounded-3xl border border-white/10 bg-zinc-900/60 p-5 md:grid-cols-3">
      <label className="text-xs font-bold text-zinc-400">Periode<select value={range} onChange={(event) => setRange(event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-zinc-100"><option value="24H">24 jam</option><option value="7D">7 hari</option><option value="30D">30 hari</option><option value="90D">90 hari</option></select></label>
      <label className="text-xs font-bold text-zinc-400">Kelompokkan berdasarkan<select value={groupBy} onChange={(event) => setGroupBy(event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-zinc-100"><option value="day">Hari</option><option value="hour">Jam</option><option value="service">Layanan</option><option value="status">Status</option></select></label>
      <div className="flex items-end"><button type="button" onClick={() => query.refetch()} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 p-3 text-xs font-black uppercase tracking-widest text-zinc-300 hover:bg-white/10"><RefreshCw className="h-4 w-4" /> Refresh data</button></div>
    </div>
    <div className="grid gap-4 md:grid-cols-4"><Metric label="Total order" value={String(totals.orders)} /><Metric label="Selesai" value={String(totals.completed)} /><Metric label="Gagal / batal" value={String(totals.failed)} /><Metric label="Gross revenue" value={money(totals.revenue)} /></div>
    <div className="overflow-hidden rounded-3xl border border-white/10 bg-zinc-900/60">
      {query.isLoading ? <div className="flex h-56 items-center justify-center text-zinc-500"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Memuat report...</div> : query.isError ? <div className="p-12 text-center text-red-300">Report gagal dimuat. Coba refresh.</div> : !rows.length ? <div className="flex h-56 flex-col items-center justify-center gap-2 text-zinc-500"><FileChartColumn className="h-8 w-8" /><p className="font-bold">Belum ada order pada periode ini</p></div> : <div className="overflow-x-auto"><table className="w-full text-left"><thead className="border-b border-white/10 text-[10px] uppercase tracking-widest text-zinc-500"><tr>{['Bucket', 'Order', 'Selesai', 'Gagal/Batal', 'Gross Revenue', 'AOV'].map((label) => <th key={label} className="px-5 py-4">{label}</th>)}</tr></thead><tbody className="divide-y divide-white/5">{rows.map((row) => <tr key={String(row.bucket)} className="text-sm text-zinc-300"><td className="px-5 py-4 font-bold text-zinc-100">{groupBy === 'service' || groupBy === 'status' ? row.bucket : new Date(row.bucket).toLocaleString('id-ID')}</td><td className="px-5 py-4">{row.total_orders}</td><td className="px-5 py-4">{row.completed_orders}</td><td className="px-5 py-4">{row.failed_orders}</td><td className="px-5 py-4">{money(row.gross_revenue_idr)}</td><td className="px-5 py-4">{money(row.average_order_value_idr)}</td></tr>)}</tbody></table></div>}
    </div>
  </div>
}

function Metric({ label, value }: { label: string, value: string }) { return <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"><p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">{label}</p><p className="mt-2 text-xl font-black text-zinc-100">{value}</p></div> }

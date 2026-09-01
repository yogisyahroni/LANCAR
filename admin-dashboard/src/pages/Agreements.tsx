import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  FileText,
  Search,
  Download,
  Eye,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  FileWarning,
  AlertCircle,
  ExternalLink,
  X,
  Printer,
  User,
  Calendar,
  Globe,
  Smartphone,
  Scale,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { adminApiRootUrl } from '../lib/runtimeConfig'
import { cn } from '../lib/utils'
import { format, parseISO } from 'date-fns'
import { id } from 'date-fns/locale'
import { Skeleton } from '../components/ui/Skeleton'

// ── Types ──────────────────────────────────────────────────────────────────

interface Agreement {
  id: string
  user_id: string
  user_type: 'courier' | 'customer'
  agreement_type: 'mitra_agreement' | 'customer_tos' | 'privacy_policy'
  agreed_at: string
  agreed_ip: string | null
  user_agent: string | null
  pdf_path: string | null
  html_content: string | null
  metadata: any
  created_at: string
  updated_at: string
  user_name: string
  user_email: string
  user_phone: string
}

interface AgreementListResponse {
  success: boolean
  data: Agreement[]
  total: number
  limit: number
  offset: number
}

// ── Agreement Label Helpers ────────────────────────────────────────────────

const agreementTypeLabel = (type: string): string => {
  const map: Record<string, string> = {
    mitra_agreement: 'Perjanjian Mitra Kurir',
    customer_tos: 'Syarat & Ketentuan Pelanggan',
    privacy_policy: 'Kebijakan Privasi',
  }
  return map[type] ?? type
}

const agreementTypeBadge = (type: string) => {
  const colors: Record<string, string> = {
    mitra_agreement: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
    customer_tos: 'bg-blue-500/10 text-blue-300 border-blue-500/20',
    privacy_policy: 'bg-purple-500/10 text-purple-300 border-purple-500/20',
  }
  const color = colors[type] ?? 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20'
  return (
    <span className={cn('text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-full border', color)}>
      {agreementTypeLabel(type)}
    </span>
  )
}

const userTypeBadge = (type: string) => {
  const colors: Record<string, string> = {
    courier: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
    customer: 'bg-primary/10 text-primary-light border-primary/20',
  }
  const labels: Record<string, string> = {
    courier: 'Kurir',
    customer: 'Pelanggan',
  }
  return (
    <span className={cn('text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-full border', colors[type] ?? '')}>
      {labels[type] ?? type}
    </span>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function Agreements() {
  const [search, setSearch] = useState('')
  const [filterUserType, setFilterUserType] = useState('')
  const [filterAgreementType, setFilterAgreementType] = useState('')
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showPDF, setShowPDF] = useState(false)
  const [pdfViewAgreement, setPdfViewAgreement] = useState<Agreement | null>(null)
  const limit = 15

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const { data, isLoading, isError, error, refetch } = useQuery<AgreementListResponse>({
    queryKey: ['admin-agreements', search, filterUserType, filterAgreementType, page],
    queryFn: async () => {
      const res = await api.get('/admin/agreements', {
        params: {
          search: search || undefined,
          user_type: filterUserType || undefined,
          agreement_type: filterAgreementType || undefined,
          limit,
          offset: (page - 1) * limit,
        },
      })
      return res.data
    },
  })

  const agreements = data?.data ?? []
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / limit))

  // ── Detail ────────────────────────────────────────────────────────────────
  const { data: agreementDetail } = useQuery<{ success: boolean; data: Agreement }>({
    queryKey: ['admin-agreement-detail', selectedId],
    queryFn: async () => {
      if (!selectedId) return null as any
      const res = await api.get(`/admin/agreements/${selectedId}`)
      return res.data
    },
    enabled: !!selectedId,
  })

  const detail = agreementDetail?.data

  // ── Actions ───────────────────────────────────────────────────────────────
  const openPDFView = (agreement: Agreement) => {
    setPdfViewAgreement(agreement)
    setShowPDF(true)
  }

  const pdfUrl = (agreement: Agreement) => {
    const base = adminApiRootUrl.replace(/\/api\/v1\/?$/, '')
    return `${base}/api/v1/admin/agreements/${agreement.id}/pdf`
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tight text-zinc-100">
            <span className="text-primary-light">Perjanjian</span> Hukum
          </h1>
          <p className="text-zinc-500 mt-1">Kelola & tinjau perjanjian hukum mitra dan pelanggan</p>
        </div>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-white/5 border border-white/10 text-zinc-300 text-[10px] font-black uppercase tracking-widest hover:bg-white/10 transition-all"
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </motion.div>

      {/* Filters */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="flex flex-wrap items-center gap-4"
      >
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
          <input
            type="text"
            placeholder="Cari nama atau email..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all placeholder:text-zinc-600"
          />
        </div>
        <select
          value={filterUserType}
          onChange={(e) => { setFilterUserType(e.target.value); setPage(1) }}
          className="bg-white/5 border border-white/10 rounded-xl py-2.5 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 text-zinc-300"
        >
          <option value="">Semua Tipe User</option>
          <option value="courier">Kurir</option>
          <option value="customer">Pelanggan</option>
        </select>
        <select
          value={filterAgreementType}
          onChange={(e) => { setFilterAgreementType(e.target.value); setPage(1) }}
          className="bg-white/5 border border-white/10 rounded-xl py-2.5 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 text-zinc-300"
        >
          <option value="">Semua Perjanjian</option>
          <option value="mitra_agreement">Perjanjian Mitra</option>
          <option value="customer_tos">Syarat & Ketentuan</option>
          <option value="privacy_policy">Kebijakan Privasi</option>
        </select>
      </motion.div>

      {/* Table */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rounded-[32px] border border-white/5 bg-zinc-900/30 backdrop-blur-sm overflow-hidden"
      >
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/5">
                <th className="text-left px-6 py-4 text-[10px] font-black uppercase tracking-widest text-zinc-500">User</th>
                <th className="text-left px-6 py-4 text-[10px] font-black uppercase tracking-widest text-zinc-500">Tipe</th>
                <th className="text-left px-6 py-4 text-[10px] font-black uppercase tracking-widest text-zinc-500">Jenis Perjanjian</th>
                <th className="text-left px-6 py-4 text-[10px] font-black uppercase tracking-widest text-zinc-500">Ditandatangani</th>
                <th className="text-left px-6 py-4 text-[10px] font-black uppercase tracking-widest text-zinc-500">IP</th>
                <th className="text-right px-6 py-4 text-[10px] font-black uppercase tracking-widest text-zinc-500">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-8 py-20 text-center">
                    <div className="flex flex-col items-center gap-4">
                      <Skeleton className="h-8 w-8 rounded-full" />
                      <Skeleton className="h-3 w-36" />
                    </div>
                  </td>
                </tr>
              ) : isError ? (
                <tr>
                  <td colSpan={6} className="px-8 py-20 text-center">
                    <div className="flex flex-col items-center gap-4">
                      <AlertCircle className="w-10 h-10 text-red-400" />
                      <div>
                        <p className="text-zinc-100 font-black uppercase tracking-widest text-xs">GAGAL MEMUAT DATA</p>
                        <p className="text-zinc-600 text-xs mt-2">{(error as any)?.response?.data?.error || 'Terjadi kesalahan server'}</p>
                      </div>
                      <button
                        onClick={() => refetch()}
                        className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-300 text-[10px] font-black uppercase tracking-widest hover:bg-red-500/20 transition-all"
                      >
                        <RefreshCw size={14} />
                        Retry
                      </button>
                    </div>
                  </td>
                </tr>
              ) : agreements.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-8 py-20 text-center">
                    <div className="flex flex-col items-center gap-4 opacity-40">
                      <FileWarning className="w-12 h-12 text-zinc-500" />
                      <p className="text-zinc-400 font-black uppercase tracking-widest text-xs">Belum ada perjanjian</p>
                      <p className="text-zinc-600 text-xs">Perjanjian akan muncul setelah user menyetujui syarat & ketentuan</p>
                    </div>
                  </td>
                </tr>
              ) : (
                agreements.map((agreement, idx) => (
                  <motion.tr
                    key={agreement.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.02 }}
                    className="hover:bg-white/5 transition-colors cursor-pointer"
                    onClick={() => setSelectedId(agreement.id)}
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-primary/30 to-emerald-600/30 flex items-center justify-center">
                          <User className="h-4 w-4 text-primary-light" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-zinc-200">{agreement.user_name || '—'}</p>
                          <p className="text-[10px] text-zinc-500 font-medium">{agreement.user_phone || agreement.user_email || '—'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">{userTypeBadge(agreement.user_type)}</td>
                    <td className="px-6 py-4">{agreementTypeBadge(agreement.agreement_type)}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-3.5 w-3.5 text-zinc-500" />
                        <span className="text-sm text-zinc-300">
                          {format(parseISO(agreement.agreed_at), 'dd MMM yyyy, HH:mm', { locale: id })}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {agreement.agreed_ip ? (
                        <span className="text-xs text-zinc-500 font-mono">{agreement.agreed_ip}</span>
                      ) : (
                        <span className="text-xs text-zinc-600">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); openPDFView(agreement) }}
                          className="p-2.5 rounded-xl bg-primary/10 border border-primary/20 text-primary-light hover:bg-primary/20 transition-all"
                          title="Lihat Dokumen"
                        >
                          <Eye size={14} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setSelectedId(agreement.id)
                          }}
                          className="p-2.5 rounded-xl bg-white/5 border border-white/10 text-zinc-400 hover:bg-white/10 hover:text-white transition-all"
                          title="Detail"
                        >
                          <FileText size={14} />
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {total > 0 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-white/5">
            <p className="text-[10px] text-zinc-500 font-medium">
              Menampilkan {(page - 1) * limit + 1}–{Math.min(page * limit, total)} dari {total} perjanjian
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-2 rounded-xl bg-white/5 border border-white/10 text-zinc-400 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                <ChevronLeft size={14} />
              </button>
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                const start = Math.max(1, page - 2)
                const p = start + i
                if (p > totalPages) return null
                return (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={cn(
                      'w-8 h-8 rounded-xl text-[11px] font-black transition-all',
                      p === page
                        ? 'bg-primary text-white shadow-lg shadow-primary/20'
                        : 'bg-white/5 text-zinc-400 hover:bg-white/10'
                    )}
                  >
                    {p}
                  </button>
                )
              })}
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-2 rounded-xl bg-white/5 border border-white/10 text-zinc-400 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </motion.div>

      {/* ── Detail Modal ───────────────────────────────────────────────────── */}
      <AnimatePresence>
        {selectedId && detail && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedId(null)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed inset-4 md:inset-auto md:top-[10%] md:left-1/2 md:-translate-x-1/2 md:w-[600px] md:max-h-[75vh] bg-zinc-900 border border-white/10 rounded-[32px] z-50 flex flex-col overflow-hidden shadow-2xl shadow-black/80"
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between px-6 py-5 border-b border-white/5">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-primary/10 text-primary-light">
                    <FileText size={16} />
                  </div>
                  <div>
                    <h2 className="text-sm font-black uppercase tracking-wider text-zinc-100">Detail Perjanjian</h2>
                    <p className="text-[10px] text-zinc-500 font-medium">ID: {detail.id.slice(0, 8)}...</p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedId(null)}
                  className="p-2 rounded-xl text-zinc-500 hover:text-white hover:bg-white/10 transition-all"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Modal Body */}
              <div className="flex-1 overflow-y-auto p-6 space-y-5">
                <div className="grid grid-cols-2 gap-4">
                  <DetailField icon={<User size={14} />} label="Nama" value={detail.user_name || '—'} />
                  <DetailField icon={<Smartphone size={14} />} label="No. HP" value={detail.user_phone || '—'} />
                  <DetailField icon={<Globe size={14} />} label="Email" value={detail.user_email || '—'} />
                  <DetailField icon={<Scale size={14} />} label="Tipe User" value={detail.user_type === 'courier' ? 'Kurir' : 'Pelanggan'} />
                </div>

                <div className="border-t border-white/5 pt-5 space-y-3">
                  <DetailField icon={<FileText size={14} />} label="Jenis Perjanjian" value={agreementTypeLabel(detail.agreement_type)} />
                  <DetailField icon={<Calendar size={14} />} label="Ditandatangani" value={format(parseISO(detail.agreed_at), 'dd MMMM yyyy HH:mm', { locale: id })} />
                  {detail.agreed_ip && <DetailField icon={<Globe size={14} />} label="IP Address" value={detail.agreed_ip} />}
                  {detail.user_agent && (
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-1 flex items-center gap-1.5">
                        <Smartphone size={12} /> User Agent
                      </p>
                      <p className="text-xs text-zinc-400 break-all font-mono bg-zinc-800/50 rounded-xl p-3">{detail.user_agent}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/5 bg-zinc-900/50">
                <button
                  onClick={() => setSelectedId(null)}
                  className="px-5 py-2.5 rounded-xl bg-white/5 text-zinc-300 text-[10px] font-black uppercase tracking-widest hover:bg-white/10 transition-all"
                >
                  Tutup
                </button>
                <button
                  onClick={() => openPDFView(detail)}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary/10 border border-primary/20 text-primary-light text-[10px] font-black uppercase tracking-widest hover:bg-primary/20 transition-all"
                >
                  <Eye size={14} />
                  Lihat Dokumen
                </button>
                <a
                  href={pdfUrl(detail)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-white text-[10px] font-black uppercase tracking-widest hover:bg-primary/90 transition-all"
                >
                  <Download size={14} />
                  Download
                </a>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── PDF/Print View Modal ──────────────────────────────────────────── */}
      <AnimatePresence>
        {showPDF && pdfViewAgreement && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowPDF(false)}
              className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed inset-4 md:inset-8 bg-zinc-900 border border-white/10 rounded-[32px] z-50 flex flex-col overflow-hidden shadow-2xl shadow-black/80"
            >
              {/* PDF Toolbar Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-zinc-900/80">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-2 rounded-xl bg-primary/10 text-primary-light">
                    <FileText size={16} />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-sm font-black uppercase tracking-wider text-zinc-100 truncate">
                      {agreementTypeLabel(pdfViewAgreement.agreement_type)}
                    </h2>
                    <p className="text-[10px] text-zinc-500 font-medium truncate">
                      {pdfViewAgreement.user_name || pdfViewAgreement.user_phone}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => window.open(pdfUrl(pdfViewAgreement), '_blank')}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 text-zinc-300 text-[10px] font-black uppercase tracking-widest hover:bg-white/10 transition-all"
                    title="Buka di tab baru"
                  >
                    <ExternalLink size={14} />
                    Tab Baru
                  </button>
                  <a
                    href={pdfUrl(pdfViewAgreement)}
                    download
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/10 border border-primary/20 text-primary-light text-[10px] font-black uppercase tracking-widest hover:bg-primary/20 transition-all"
                    title="Download PDF"
                  >
                    <Download size={14} />
                    Download
                  </a>
                  <button
                    onClick={() => {
                      // Open in new tab, then print
                      const w = window.open(pdfUrl(pdfViewAgreement), '_blank')
                      if (w) {
                        w.onload = () => w.print()
                      }
                    }}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-zinc-300 text-[10px] font-black uppercase tracking-widest hover:bg-white/10 transition-all"
                    title="Cetak"
                  >
                    <Printer size={14} />
                    Cetak
                  </button>
                  <button
                    onClick={() => setShowPDF(false)}
                    className="p-2 rounded-xl text-zinc-500 hover:text-white hover:bg-white/10 transition-all"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              {/* PDF Viewer */}
              <div className="flex-1 bg-zinc-950 relative">
                <iframe
                  src={pdfUrl(pdfViewAgreement)}
                  className="w-full h-full border-0"
                  title="PDF Viewer"
                  sandbox="allow-scripts allow-forms allow-same-origin"
                />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────

function DetailField({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 flex items-center gap-1.5">
        {icon} {label}
      </p>
      <p className="text-sm text-zinc-200 font-semibold">{value}</p>
    </div>
  )
}

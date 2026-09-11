import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle, CheckCircle2, Clock, ExternalLink, FileCheck2, Search, Store, X, XCircle
} from 'lucide-react'
import { toast } from 'sonner'
import { api } from '../lib/api'
import { cn } from '../lib/utils'
import { StatusBadge } from '../components/StatusBadge'

const docTypeLabels: Record<string, string> = {
  ktp_pemilik: 'KTP Pemilik',
  foto_tempat_usaha: 'Foto Tempat Usaha',
  rekening_bank: 'Rekening Bank',
  nib: 'NIB / Izin Usaha (opsional)',
}

const resolveUploadUrl = (fileUrl?: string) => {
  if (!fileUrl) return ''
  if (/^https?:\/\//i.test(fileUrl)) return fileUrl
  try {
    const base = new URL(api.defaults.baseURL || window.location.origin)
    return `${base.origin}${fileUrl}`
  } catch {
    return fileUrl
  }
}

const formatIDR = (v: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(v)
const idempotencyKey = (scope: string) => `merchant-onboarding-${scope}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
const lifecycleLabel = (status?: string) => ({
  DRAFT: 'Draft', SUBMITTED: 'Diajukan', VERIFYING: 'Sedang diverifikasi',
  ACTIVE: 'Aktif', REJECTED: 'Ditolak', SUSPENDED: 'Disuspend',
}[String(status || '').toUpperCase()] || status || '—')

const merchantStatus = (status?: string) => {
  switch (String(status || '').toUpperCase()) {
    case 'ACTIVE': return 'active'
    case 'REJECTED': return 'rejected'
    case 'SUSPENDED': return 'suspended'
    case 'DRAFT': return 'draft'
    case 'SUBMITTED':
    case 'VERIFYING': return 'pending_review'
    default: return status || 'unknown'
  }
}

const halalStatus = (status?: string) => status === 'halal_certified' ? 'verified' : status === 'non_halal' ? 'review' : 'pending_review'
const halalLabel = (status?: string, detail = false) => status === 'halal_certified'
  ? detail ? 'Bersertifikat Halal' : 'Halal'
  : status === 'non_halal'
    ? detail ? 'Non-Halal (self-declare)' : 'Non-Halal'
    : detail ? 'Halal: Belum ditentukan' : 'Halal: Belum'

export default function Merchants() {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState('SUBMITTED')
  const [selected, setSelected] = useState<any>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [showReject, setShowReject] = useState(false)
  // FB-125: text search cari merchant by nama/telepon/email.
  const [search, setSearch] = useState('')
  // A2: filter jenis usaha merchant (perorangan / perusahaan).
  const [businessType, setBusinessType] = useState('all')

  const { data, isLoading } = useQuery({
    queryKey: ['admin-merchants', status, businessType],
    queryFn: async () => {
      const params: any = { status }
      if (businessType !== 'all') params.business_type = businessType
      const res = await api.get('/admin/merchants', { params })
      return res.data.merchants || []
    }
  })

  const { data: detail } = useQuery({
    queryKey: ['admin-merchant-detail', selected?.id],
    queryFn: async () => {
      const res = await api.get(`/admin/merchants/${selected.id}`)
      return res.data
    },
    enabled: Boolean(selected?.id)
  })

  const approve = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.post(`/admin/merchants/${id}/approve`, {}, { headers: { 'X-Idempotency-Key': idempotencyKey(`activate-${id}`) } })
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-merchants'] })
      setSelected(null)
      toast.success('Merchant disetujui')
    },
    onError: (error: any) => toast.error(error.response?.data?.error || error.message)
  })

  const reject = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const res = await api.post(`/admin/merchants/${id}/reject`, { reason }, { headers: { 'X-Idempotency-Key': idempotencyKey(`reject-${id}`) } })
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-merchants'] })
      setSelected(null)
      setShowReject(false)
      setRejectReason('')
      toast.success('Merchant ditolak')
    },
    onError: (error: any) => toast.error(error.response?.data?.error || error.message)
  })

  const startVerification = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.post(`/admin/merchants/${id}/start-verification`, {}, { headers: { 'X-Idempotency-Key': idempotencyKey(`verify-${id}`) } })
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-merchants'] })
      queryClient.invalidateQueries({ queryKey: ['admin-merchant-detail'] })
      setSelected(null)
      toast.success('Review verifikasi dimulai')
    },
    onError: (error: any) => toast.error(error.response?.data?.error || error.message)
  })

  const suspend = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const res = await api.post(`/admin/merchants/${id}/suspend`, { reason }, { headers: { 'X-Idempotency-Key': idempotencyKey(`suspend-${id}`) } })
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-merchants'] })
      queryClient.invalidateQueries({ queryKey: ['admin-merchant-detail'] })
      setSelected(null)
      toast.success('Merchant disuspend dan toko ditutup')
    },
    onError: (error: any) => toast.error(error.response?.data?.error || error.message)
  })

  const merchants = data || []
  // FB-125: filter client-side by nama toko / telepon / email (case-insensitive).
  const query = search.trim().toLowerCase()
  const filtered = query
    ? merchants.filter((m: any) =>
        [m.nama_toko, m.phone, m.email, m.alamat].some((v) =>
          String(v ?? '').toLowerCase().includes(query)
        )
      )
    : merchants
  const active = selected || merchants[0]
  const merchantDetail = detail?.merchant || active
  const documents = active ? (detail?.documents || []) : []
  const menuItems = active ? (detail?.menu_items || []) : []
  const hasMenu = Array.isArray(menuItems) && menuItems.length > 0

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground-muted">Merchant Review</h1>
          <p className="mt-2 text-sm text-foreground-muted">
            Review pendaftaran merchant food delivery sebelum toko bisa terima order.
          </p>
        </div>
        <div className="flex rounded-2xl border border-border bg-surface/[0.03] p-1">
          {['SUBMITTED', 'VERIFYING', 'ACTIVE', 'REJECTED', 'SUSPENDED', 'all'].map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => { setStatus(item); setSelected(null) }}
              className={cn(
                'rounded-xl px-3 py-2 text-sm font-bold transition',
                status === item ? 'bg-primary text-on-primary' : 'text-foreground-muted hover:text-foreground'
              )}
            >
              {item === 'all' ? 'Semua' : lifecycleLabel(item)}
            </button>
          ))}
        </div>
      </div>

      {/* A2: filter jenis usaha merchant (perorangan / perusahaan) */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold uppercase tracking-wide text-foreground-muted">Jenis</span>
        <select
          aria-label="Filter merchants by business type"
          value={businessType}
          onChange={(e) => { setBusinessType(e.target.value); setSelected(null) }}
          className="rounded-xl border border-border bg-surface-subtle px-3 py-2 text-sm text-foreground-muted focus:outline-none"
        >
          <option value="all">Semua</option>
          <option value="perorangan">Perorangan</option>
          <option value="perusahaan">Perusahaan</option>
        </select>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[420px_1fr]">
        <div className="rounded-3xl border border-border bg-surface/[0.03]">
          <div className="border-b border-border p-5">
            <p className="text-sm font-bold text-foreground-muted">{filtered.length} merchant</p>
            <p className="mt-1 text-xs text-foreground-muted">Klik merchant untuk membuka detail review.</p>
            {/* FB-125: pencarian merchant by nama/telepon/email */}
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-border bg-surface-subtle px-3 py-2">
              <Search className="h-4 w-4 shrink-0 text-foreground-muted" aria-hidden="true" />
              <input
                type="text"
                aria-label="Search merchants by name, phone, or email"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setSelected(null) }}
                placeholder="Cari nama toko / telepon / email…"
                className="w-full bg-transparent text-sm text-foreground-muted placeholder:text-foreground-muted focus:outline-none"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="text-foreground-muted hover:text-foreground-muted"
                  aria-label="Bersihkan pencarian" title="Bersihkan pencarian"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
            </div>
          </div>
          <div className="max-h-[640px] overflow-y-auto p-3">
            {isLoading ? (
              <div className="p-6 text-sm text-foreground-muted">Loading merchants...</div>
            ) : filtered.length === 0 ? (
              <div className="p-6 text-sm text-foreground-muted">
                {query ? 'Tidak ada merchant yang cocok dengan pencarian.' : 'Belum ada merchant pada status ini.'}
              </div>
            ) : filtered.map((item: any) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelected(item)}
                className={cn(
                  'mb-2 w-full rounded-2xl border p-4 text-left transition',
                  active?.id === item.id ? 'border-primary bg-primary/10' : 'border-border bg-surface-subtle hover:bg-surface/[0.06]'
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-bold text-foreground-muted">{item.nama_toko}</p>
                    <p className="mt-1 text-xs text-foreground-muted">{item.phone || item.email || '—'}</p>
                  </div>
                  {item.onboarding_status === 'ACTIVE'
                    ? <CheckCircle2 className="h-5 w-5 text-success" aria-hidden="true" />
                    : item.onboarding_status === 'REJECTED' || item.onboarding_status === 'SUSPENDED'
                      ? <XCircle className="h-5 w-5 text-error" aria-hidden="true" />
                      : <AlertTriangle className="h-5 w-5 text-warning"  aria-hidden="true"/>}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <StatusBadge status={merchantStatus(item.onboarding_status)} labelPrefix="Merchant onboarding status" label={lifecycleLabel(item.onboarding_status)} />
                  <StatusBadge status={item.is_open ? 'enabled' : 'disabled'} labelPrefix="Store availability" label={item.is_open ? 'Buka' : 'Tutup'} />
                  {/* ADR 003: status halal */}
                  <StatusBadge
                    status={halalStatus(item.halal_status)}
                    labelPrefix="Halal status"
                    label={halalLabel(item.halal_status)}
                    className={item.halal_status === 'halal_certified' ? 'border-success bg-success-surface' : 'border-border bg-surface-subtle'}
                  />
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-border bg-surface/[0.03] p-6">
          {!active ? (
            <div className="flex min-h-[520px] items-center justify-center text-foreground-muted">Pilih merchant untuk review.</div>
          ) : (
            <div className="space-y-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-foreground-muted">Merchant</p>
                  <h2 className="mt-1 text-2xl font-bold text-foreground-muted">{active.nama_toko}</h2>
                  <p className="mt-1 text-sm text-foreground-muted">{active.alamat}</p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full border border-border px-2 py-1 text-foreground-muted">
                      <Clock className="mr-1 inline h-3 w-3" aria-hidden="true" />
                      {active.jam_buka || '?'} – {active.jam_tutup || '?'}
                    </span>
                    <span className="rounded-full border border-border px-2 py-1 text-foreground-muted">
                      Completion {active.completion_rate_pct ?? 0}%
                    </span>
                    <StatusBadge status={merchantStatus(active.onboarding_status)} labelPrefix="Merchant onboarding status" label={`${lifecycleLabel(active.onboarding_status)} · ${active.market_code || 'ID-JK'}`} />
                    {/* ADR 003: status halal merchant */}
                    <StatusBadge
                      status={halalStatus(active.halal_status)}
                      labelPrefix="Halal status"
                      label={halalLabel(active.halal_status, true)}
                      className={active.halal_status === 'halal_certified' ? 'border-success bg-success-surface' : 'border-border bg-surface-subtle'}
                    />
                    <StatusBadge status={active.is_open ? 'enabled' : 'disabled'} labelPrefix="Store availability" label={active.is_open ? 'Buka' : 'Tutup'} />
                    {active.lokasi_lat != null && (
                      <span className="rounded-full border border-border px-2 py-1 text-foreground-muted">
                        {active.lokasi_lat.toFixed(4)}, {active.lokasi_lng?.toFixed(4)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  {active.onboarding_status === 'SUBMITTED' && (
                    <>
                      <button
                        type="button"
                        onClick={() => startVerification.mutate(active.id)}
                        disabled={startVerification.isPending}
                        className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-on-primary transition hover:bg-primary/80 disabled:opacity-60"
                      >
                        {startVerification.isPending ? 'Memulai...' : 'Mulai verifikasi'}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setShowReject(true); setRejectReason('') }}
                        className="rounded-xl bg-error-surface px-4 py-2 text-sm font-bold text-error transition hover:bg-error-surface"
                      >
                        Tolak
                      </button>
                    </>
                  )}
                  {active.onboarding_status === 'VERIFYING' && (
                    <>
                      <button
                        type="button"
                        onClick={() => approve.mutate(active.id)}
                        disabled={approve.isPending}
                        className="rounded-xl bg-success px-4 py-2 text-sm font-bold text-on-success transition hover:bg-success disabled:opacity-60"
                      >
                        {approve.isPending ? 'Mengaktifkan...' : 'Aktifkan'}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setShowReject(true); setRejectReason('') }}
                        className="rounded-xl bg-error-surface px-4 py-2 text-sm font-bold text-error transition hover:bg-error-surface"
                      >
                        Tolak
                      </button>
                    </>
                  )}
                  {active.onboarding_status === 'ACTIVE' && (
                    <button
                      type="button"
                      onClick={() => {
                        const reason = window.prompt('Alasan suspend merchant:')?.trim()
                        if (reason) suspend.mutate({ id: active.id, reason })
                      }}
                      disabled={suspend.isPending}
                      className="rounded-xl bg-warning-surface px-4 py-2 text-sm font-bold text-warning transition hover:bg-warning-surface disabled:opacity-60"
                    >
                      {suspend.isPending ? 'Memproses...' : 'Suspend'}
                    </button>
                  )}
                  {['DRAFT', 'REJECTED', 'SUSPENDED'].includes(active.onboarding_status) && (
                    <StatusBadge
                      status={merchantStatus(active.onboarding_status)}
                      labelPrefix="Merchant onboarding status"
                      label={lifecycleLabel(active.onboarding_status)}
                      className={cn('rounded-xl px-4 py-2 text-sm', active.onboarding_status === 'REJECTED' ? 'border-error bg-error-surface' : 'border-warning bg-warning-surface')}
                    />
                  )}
                </div>
              </div>

              {showReject && (
                <div className="rounded-2xl border border-error bg-error-surface p-4">
                  <p className="text-sm font-bold text-error">Alasan penolakan</p>
                  <textarea
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    rows={2}
                    className="mt-2 w-full rounded-xl border border-border bg-background p-3 text-sm text-foreground-muted outline-none focus:border-error"
                    placeholder="Contoh: dokumen tidak jelas, nama toko menyesatkan..."
                  />
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => reject.mutate({ id: active.id, reason: rejectReason })}
                      disabled={reject.isPending || !rejectReason.trim()}
                      className="rounded-xl bg-error px-4 py-2 text-sm font-bold text-on-error transition hover:bg-error disabled:opacity-60"
                    >
                      {reject.isPending ? 'Menolak...' : 'Konfirmasi Tolak'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowReject(false)}
                      className="rounded-xl border border-border px-4 py-2 text-sm font-bold text-foreground-muted hover:text-foreground"
                    >
                      Batal
                    </button>
                  </div>
                </div>
              )}

              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-foreground-muted">Requirement verifikasi market</p>
                {(detail?.verification_requirements || []).length === 0 ? (
                  <p className="mt-2 text-sm text-warning">Tidak ada requirement aktif untuk market ini; aktivasi akan ditolak aman.</p>
                ) : (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(detail?.verification_requirements || []).map((requirement: any) => (
                      <span key={requirement.id} className={cn(
                        'rounded-full border px-3 py-1 text-xs font-semibold',
                        requirement.document_present ? 'border-success bg-success-surface text-success' : 'border-warning bg-warning-surface text-warning'
                      )}>
                        {docTypeLabels[requirement.document_type] || requirement.document_type}: {requirement.document_present ? 'ada' : 'belum ada'}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="rounded-2xl border border-border bg-surface-subtle p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-foreground-muted">Profil legal & payout</p>
                  <dl className="mt-3 space-y-2 text-sm">
                    <div className="flex justify-between gap-3"><dt className="text-foreground-muted">Badan usaha</dt><dd className="text-right text-foreground-muted">{merchantDetail?.legal_entity_type || merchantDetail?.business_type || '—'}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-foreground-muted">Nama legal</dt><dd className="text-right text-foreground-muted">{merchantDetail?.legal_name || merchantDetail?.nama_toko || '—'}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-foreground-muted">Payout reference</dt><dd className="max-w-[65%] truncate text-right text-foreground-muted" title={merchantDetail?.payout_account_reference || '—'}>{merchantDetail?.payout_account_reference || '—'}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-foreground-muted">Bank</dt><dd className="text-right text-foreground-muted">{merchantDetail?.bank_name || '—'}{merchantDetail?.bank_account_verified ? ' · terverifikasi' : ''}</dd></div>
                  </dl>
                </div>
                <div className="rounded-2xl border border-border bg-surface-subtle p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-foreground-muted">Commercial terms food</p>
                  <dl className="mt-3 space-y-2 text-sm">
                    <div className="flex justify-between gap-3"><dt className="text-foreground-muted">Contract version</dt><dd className="text-right text-foreground-muted">{merchantDetail?.commercial_contract_version || 'Belum ada contract approved'}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-foreground-muted">Effective from</dt><dd className="text-right text-foreground-muted">{merchantDetail?.commercial_contract_effective_from ? new Date(merchantDetail.commercial_contract_effective_from).toLocaleString('id-ID') : '—'}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-foreground-muted">Market</dt><dd className="text-right text-foreground-muted">{merchantDetail?.market_code || '—'}</dd></div>
                  </dl>
                </div>
              </div>

              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-foreground-muted">Dokumen Verifikasi</p>
                {documents.length === 0 ? (
                  <p className="mt-2 text-sm text-foreground-muted">Belum ada dokumen.</p>
                ) : (
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {documents.map((doc: any) => (
                      <a
                        key={doc.id}
                        href={resolveUploadUrl(doc.file_url)}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-3 rounded-2xl border border-border bg-surface-subtle p-3 transition hover:bg-surface/[0.06]"
                      >
                        <FileCheck2 className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-foreground-muted" title={docTypeLabels[doc.doc_type] || doc.doc_type}>{docTypeLabels[doc.doc_type] || doc.doc_type}</p>
                          <p className="text-xs text-foreground-muted">{new Date(doc.uploaded_at).toLocaleString('id-ID')}</p>
                        </div>
                        <ExternalLink className="h-4 w-4 shrink-0 text-foreground-muted" aria-hidden="true" />
                      </a>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-foreground-muted">Menu ({(Array.isArray(menuItems) ? menuItems.length : 0)} item)</p>
                {!hasMenu ? (
                  <p className="mt-2 text-sm text-foreground-muted">Belum ada menu.</p>
                ) : (
                  <div className="mt-3 space-y-2">
                    {menuItems.map((item: any) => (
                      <div key={item.id} className="flex items-center justify-between rounded-2xl border border-border bg-surface-subtle p-3">
                        <div>
                          <p className="text-sm font-bold text-foreground-muted">{item.nama}</p>
                          <p className="text-xs text-foreground-muted">{item.kategori || 'Tanpa kategori'} • prep {item.prep_time_minutes || 15} mnt</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={cn(
                            'rounded-full px-2 py-1 text-xs font-bold uppercase',
                            item.is_available ? 'bg-success-surface text-success' : 'bg-surface-subtle text-foreground-muted'
                          )}>
                            {item.is_available ? 'Tersedia' : 'Habis'}
                          </span>
                          <span className="text-sm font-bold text-foreground-muted">{formatIDR(item.harga)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Bike, CheckCircle2, Clock, ExternalLink, FileCheck2, ShieldCheck, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '../lib/api'
import { cn } from '../lib/utils'

const documentLabels: Record<string, string> = {
  ktp: 'e-KTP Asli',
  sim: 'SIM C / D Asli',
  stnk: 'STNK Asli',
  skpd: 'SKPD Pajak 5 Tahunan',
  vehicle_photo: 'Foto Kendaraan',
  skck: 'SKCK Asli / Legalisir',
  bank_account: 'Rekening Bank'
}

const ruleLabels: Record<string, string> = {
  vehicle_age_max_8_years: 'Umur kendaraan maksimal 8 tahun',
  vehicle_cc_max_250: 'CC kendaraan maksimal 250 cc',
  four_stroke_engine: 'Mesin 4 tak',
  not_trail_sport_touring: 'Bukan Trail, Sport, atau Touring',
  skpd_tax_active: 'Pajak aktif',
  sim_active: 'SIM aktif'
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

export default function CourierApplications() {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState('pending')
  const [selected, setSelected] = useState<any>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['on-demand-courier-applications', status],
    queryFn: async () => {
      const res = await api.get('/admin/courier-applications/on-demand', { params: { status } })
      return res.data.data || []
    }
  })

  const updateStatus = useMutation({
    mutationFn: async ({ id, nextStatus, reason }: { id: string; nextStatus: string; reason?: string }) => {
      const res = await api.patch(`/admin/couriers/${id}/status`, { status: nextStatus, reason })
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['on-demand-courier-applications'] })
      queryClient.invalidateQueries({ queryKey: ['admin-couriers'] })
      queryClient.invalidateQueries({ queryKey: ['admin-couriers-stats'] })
      setSelected(null)
      toast.success('Review kurir diperbarui')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || error.message)
    }
  })

  const applications = data || []
  const active = selected || applications[0]
  const checklist = active?.onboarding_checklist || {}
  const docs = checklist.documents || {}
  const rules = checklist.rules || {}
  const documentRows = active?.documents || []
  const allPassed = [...Object.values(docs), ...Object.values(rules)].every(Boolean)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-100">On-Demand Courier Review</h1>
          <p className="mt-2 text-sm text-zinc-500">
            Review pendaftaran kurir GoSend-style sebelum akun bisa aktif menerima pekerjaan.
          </p>
        </div>
        <div className="flex rounded-2xl border border-white/10 bg-white/[0.03] p-1">
          {['pending', 'approved', 'rejected', 'all'].map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => {
                setStatus(item)
                setSelected(null)
              }}
              className={cn(
                'rounded-xl px-4 py-2 text-sm font-bold capitalize transition',
                status === item ? 'bg-primary text-white' : 'text-zinc-400 hover:text-white'
              )}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[420px_1fr]">
        <div className="rounded-3xl border border-white/10 bg-white/[0.03]">
          <div className="border-b border-white/10 p-5">
            <p className="text-sm font-bold text-zinc-100">{applications.length} kandidat</p>
            <p className="mt-1 text-xs text-zinc-500">Klik kandidat untuk membuka detail review.</p>
          </div>

          <div className="max-h-[680px] overflow-y-auto p-3">
            {isLoading ? (
              <div className="p-6 text-sm text-zinc-500">Loading applications...</div>
            ) : applications.length === 0 ? (
              <div className="p-6 text-sm text-zinc-500">Belum ada kandidat pada status ini.</div>
            ) : applications.map((item: any) => {
              const itemChecklist = item.onboarding_checklist || {}
              const passed = [
                ...Object.values(itemChecklist.documents || {}),
                ...Object.values(itemChecklist.rules || {})
              ].every(Boolean)
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelected(item)}
                  className={cn(
                    'mb-2 w-full rounded-2xl border p-4 text-left transition',
                    active?.id === item.id ? 'border-primary bg-primary/10' : 'border-white/10 bg-zinc-950/50 hover:bg-white/[0.06]'
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-bold text-zinc-100">{item.full_name}</p>
                      <p className="mt-1 text-xs text-zinc-500">{item.phone_number} • {item.vehicle_plate}</p>
                    </div>
                    {passed ? <CheckCircle2 className="h-5 w-5 text-emerald-400" /> : <AlertTriangle className="h-5 w-5 text-amber-300" />}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-bold uppercase">
                    <span className="rounded-full border border-white/10 px-2 py-1 text-zinc-400">{item.verification_status}</span>
                    <span className="rounded-full border border-white/10 px-2 py-1 text-zinc-400">{item.vehicle_cc || 0} cc</span>
                    <span className="rounded-full border border-white/10 px-2 py-1 text-zinc-400">{item.document_count} docs</span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
          {!active ? (
            <div className="flex min-h-[520px] items-center justify-center text-zinc-500">Pilih kandidat untuk review.</div>
          ) : (
            <div className="space-y-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.25em] text-zinc-500">Courier Applicant</p>
                  <h2 className="mt-2 text-3xl font-black text-zinc-100">{active.full_name}</h2>
                  <p className="mt-1 text-sm text-zinc-500">{active.email || 'No email'} • {active.phone_number}</p>
                </div>
                <StatusBadge status={active.verification_status} />
              </div>

              <div className="grid gap-4 md:grid-cols-4">
                <InfoCard icon={Bike} label="Kendaraan" value={`${active.vehicle_brand || '-'} ${active.vehicle_model || ''}`} />
                <InfoCard icon={Clock} label="Tahun" value={String(active.vehicle_year || '-')} />
                <InfoCard icon={ShieldCheck} label="CC" value={`${active.vehicle_cc || 0} cc`} />
                <InfoCard icon={FileCheck2} label="Bank" value={active.bank_code || '-'} />
              </div>

              <ReviewSection title="Dokumen Wajib">
                {Object.entries(documentLabels).map(([key, label]) => (
                  <ChecklistRow
                    key={key}
                    label={label}
                    passed={Boolean(docs[key])}
                    fileUrl={documentRows.find((doc: any) => doc.doc_type === key)?.file_url}
                  />
                ))}
              </ReviewSection>

              <ReviewSection title="Aturan Kendaraan">
                {Object.entries(ruleLabels).map(([key, label]) => (
                  <ChecklistRow key={key} label={label} passed={Boolean(rules[key])} />
                ))}
              </ReviewSection>

              <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-5">
                <p className="text-sm font-bold text-zinc-100">Rekening Payout</p>
                <div className="mt-4 grid gap-3 text-sm md:grid-cols-3">
                  <Meta label="Bank" value={active.bank_code} />
                  <Meta label="Nomor Rekening" value={active.bank_account_number} />
                  <Meta label="Nama Rekening" value={active.bank_account_name} />
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => updateStatus.mutate({ id: active.id, nextStatus: 'Active' })}
                  disabled={updateStatus.isPending || !allPassed}
                  className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Approve Courier
                </button>
                <button
                  type="button"
                  onClick={() => updateStatus.mutate({ id: active.id, nextStatus: 'Rejected', reason: 'Dokumen atau kendaraan belum memenuhi syarat on-demand' })}
                  disabled={updateStatus.isPending}
                  className="rounded-xl bg-red-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-red-500 disabled:opacity-50"
                >
                  Reject
                </button>
                {!allPassed && (
                  <p className="flex items-center gap-2 text-sm text-amber-300">
                    <AlertTriangle className="h-4 w-4" />
                    Kandidat belum memenuhi semua requirement.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const approved = status === 'approved'
  const rejected = status === 'rejected'
  return (
    <span className={cn(
      'rounded-full px-3 py-1 text-xs font-black uppercase',
      approved ? 'bg-emerald-500/10 text-emerald-300' : rejected ? 'bg-red-500/10 text-red-300' : 'bg-amber-500/10 text-amber-300'
    )}>
      {status}
    </span>
  )
}

function InfoCard({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-4">
      <Icon className="h-5 w-5 text-primary-light" />
      <p className="mt-3 text-xs font-bold uppercase text-zinc-500">{label}</p>
      <p className="mt-1 text-sm font-bold text-zinc-100">{value}</p>
    </div>
  )
}

function ReviewSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-5">
      <p className="text-sm font-bold text-zinc-100">{title}</p>
      <div className="mt-4 grid gap-3 md:grid-cols-2">{children}</div>
    </div>
  )
}

function ChecklistRow({ label, passed, fileUrl }: { label: string; passed: boolean; fileUrl?: string }) {
  const href = resolveUploadUrl(fileUrl)
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
      <div className="min-w-0">
        <span className="text-sm text-zinc-300">{label}</span>
        {href && (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="mt-1 flex items-center gap-1 text-xs font-bold text-primary-light hover:text-white"
          >
            Buka dokumen <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
      {passed ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" /> : <XCircle className="h-5 w-5 shrink-0 text-red-400" />}
    </div>
  )
}

function Meta({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase text-zinc-500">{label}</p>
      <p className="mt-1 font-bold text-zinc-100">{value || '-'}</p>
    </div>
  )
}

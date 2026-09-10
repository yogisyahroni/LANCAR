import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertCircle,
  Flag,
  History,
  Loader2,
  RefreshCw,
  Search,
} from 'lucide-react'
import { cn } from '../lib/utils'
import { api } from '../lib/api'
import { toast } from 'sonner'
import { FocusTrap } from '../components/a11y/FocusTrap'
import { Skeleton } from '../components/ui/Skeleton'
import { useAuthStore } from '../store/useAuthStore'
import { EXPERIENCE_CAPABILITIES, hasExperiencePermission } from '../lib/experiencePermissions'

interface FeatureFlag {
  key: string
  name?: string | null
  description?: string | null
  category?: string | null
  is_enabled: boolean
  require_checklist?: boolean
  config?: Record<string, unknown> | null
  evaluation_revision?: number | string | null
  updated_at?: string | null
  updated_by_name?: string | null
}

const flagErrorMessage = (error: any, fallback: string) =>
  error?.response?.data?.error || error?.response?.data?.message || error?.message || fallback

export default function FeatureFlags() {
  const { user } = useAuthStore()
  const canMutate = hasExperiencePermission(user, EXPERIENCE_CAPABILITIES.featureFlagWrite)
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [toggleTarget, setToggleTarget] = useState<FeatureFlag | null>(null)
  const [reason, setReason] = useState('')
  const [rollbackPlan, setRollbackPlan] = useState('')

  const flagsQuery = useQuery({
    queryKey: ['feature-flags'],
    queryFn: async (): Promise<FeatureFlag[]> => {
      const res = await api.get('/admin/feature-flags')
      return Array.isArray(res.data) ? res.data : res.data?.data ?? []
    },
  })

  const auditLogsQuery = useQuery({
    queryKey: ['audit-logs', 'feature-flags-panel'],
    queryFn: async () => {
      const res = await api.get('/admin/audit-logs')
      const raw = Array.isArray(res.data) ? res.data : res.data?.data ?? []
      return raw as Array<Record<string, any>>
    },
    staleTime: 60 * 1000,
  })

  const toggleMutation = useMutation({
    mutationFn: async ({ key, nextEnabled, reason, rollbackPlan }: { key: string; nextEnabled: boolean; reason: string; rollbackPlan: string }) => {
      return api.patch(`/admin/feature-flags/${key}/toggle`, { new_enabled: nextEnabled, reason, rollback_plan: rollbackPlan || undefined })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feature-flags'] })
      queryClient.invalidateQueries({ queryKey: ['audit-logs'] })
      toast.success('Feature flag diperbarui')
      setToggleTarget(null)
      setReason('')
      setRollbackPlan('')
    },
    onError: (error: any) => {
      toast.error(flagErrorMessage(error, 'Gagal memperbarui feature flag'))
    },
  })

  useEffect(() => {
    if (!toggleTarget) return undefined

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !toggleMutation.isPending) {
        setToggleTarget(null)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [toggleMutation.isPending, toggleTarget])

  const filteredFlags = useMemo(() => {
    const data = flagsQuery.data ?? []
    const q = search.trim().toLowerCase()
    if (!q) return data
    return data.filter((flag) =>
      `${flag.key} ${flag.name ?? ''} ${flag.description ?? ''} ${flag.category ?? ''}`
        .toLowerCase()
        .includes(q),
    )
  }, [flagsQuery.data, search])

  // Change log: ambil entri audit yang menyentuh feature flag (action/target mengandung "feature").
  const flagAuditLogs = useMemo(() => {
    const logs = auditLogsQuery.data ?? []
    return logs
      .filter((log) => {
        const haystack = `${log.action ?? ''} ${log.target_key ?? ''} ${log.target_id ?? ''}`.toLowerCase()
        return haystack.includes('feature')
      })
      .slice(0, 15)
  }, [auditLogsQuery.data])

  const submitToggle = () => {
    if (!toggleTarget) return
    if (!reason.trim()) {
      toast.error('Alasan perubahan wajib diisi')
      return
    }
    const highBlast = Boolean(
      toggleTarget.require_checklist ||
      toggleTarget.config?.high_blast_radius === true ||
      ['authorization', 'financial', 'payment', 'pricing', 'risk', 'routing', 'security', 'settlement', 'system'].includes((toggleTarget.category || '').toLowerCase()) ||
      ['require_payment_gateway', 'dynamic_pricing_peak_hour', 'dynamic_pricing_demand_supply', 'multi_zone_courier', 'model_p2p', 'model_two_legs', 'model_three_legs', 'three_legs_relay'].includes(toggleTarget.key),
    )
    if (highBlast && rollbackPlan.trim().length < 20) {
      toast.error('Rollback plan minimal 20 karakter wajib untuk flag high-blast-radius')
      return
    }
    toggleMutation.mutate({
      key: toggleTarget.key,
      nextEnabled: !toggleTarget.is_enabled,
      reason: reason.trim(),
      rollbackPlan: rollbackPlan.trim(),
    })
  }

  return (
    <div className="space-y-8 animate-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-foreground-muted tracking-tight flex items-center gap-3">
            <Flag size={26} className="text-primary-light" aria-hidden="true" />
            Feature Flags
          </h1>
          <p className="text-foreground-muted mt-1">Kontrol on/off fitur platform dengan jejak alasan perubahan.</p>
        </div>
        <div className="relative w-full md:w-80">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-foreground-muted" size={16} aria-hidden="true" />
          <label htmlFor="ff-search" className="sr-only">Cari feature flag</label>
          <input
            id="ff-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari key, nama, atau deskripsi..."
            className="w-full bg-surface-subtle border border-border rounded-2xl py-3 pl-11 pr-4 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all placeholder:text-foreground-muted placeholder:font-medium"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[2fr_1fr] gap-8 items-start">
        {/* Flags Table */}
        <div className="glass-card rounded-[40px] border-border overflow-hidden shadow-2xl shadow-scrim">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border bg-surface/[0.01]">
                  {['Flag', 'Kategori', 'Status'].map((head) => (
                    <th key={head} scope="col" className="px-6 py-5 text-xs font-black text-foreground-muted uppercase tracking-[0.2em]">
                      {head}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {flagsQuery.isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={3} className="px-6 py-4">
                        <Skeleton className="h-10 w-full rounded-xl" />
                      </td>
                    </tr>
                  ))
                ) : flagsQuery.isError ? (
                  <tr>
                    <td colSpan={3} className="px-8 py-16 text-center space-y-3">
                      <AlertCircle className="w-8 h-8 mx-auto text-error"  aria-hidden="true"/>
                      <p className="text-xs font-black uppercase tracking-widest text-foreground-muted">Feature flags gagal dimuat</p>
                      <button
                        type="button"
                        onClick={() => flagsQuery.refetch()}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-error-surface border border-error text-error text-[10px] font-black uppercase tracking-widest hover:bg-error-surface transition-all"
                      >
                        <RefreshCw size={13} aria-hidden="true" />
                        Retry
                      </button>
                    </td>
                  </tr>
                ) : filteredFlags.length > 0 ? (
                  filteredFlags.map((flag) => (
                    <tr key={flag.key} className="hover:bg-surface/[0.02] transition-colors group">
                      <td className="px-6 py-5 max-w-md">
                        <p className="text-sm font-black text-foreground-muted">{flag.name || flag.key}</p>
                        {flag.name && flag.name !== flag.key && (
                          <p className="text-[10px] text-foreground-muted font-mono mt-0.5">{flag.key}</p>
                        )}
                        {flag.description && (
                          <p className="text-xs text-foreground-muted mt-1 line-clamp-1" title={flag.description}>{flag.description}</p>
                        )}
                      </td>
                      <td className="px-6 py-5">
                        <span className="px-2.5 py-1 rounded-lg bg-surface-raised text-foreground-muted border border-border text-[9px] font-black uppercase tracking-widest">
                          {flag.category || 'Umum'}
                        </span>
                      </td>
                      <td className="px-6 py-5">
                        <button
                          type="button"
                          onClick={() => {
                            setToggleTarget(flag)
                            setReason('')
                            setRollbackPlan('')
                          }}
                          role="switch"
                          aria-checked={flag.is_enabled}
                          aria-label={`${flag.is_enabled ? 'Nonaktifkan' : 'Aktifkan'} ${flag.key}`}
                          disabled={toggleMutation.isPending || !canMutate}
                          className={cn(
                            'inline-flex items-center gap-3 rounded-full px-1 py-1 transition-colors w-24 justify-start',
                            flag.is_enabled ? 'bg-success-surface' : 'bg-surface-raised',
                          )}
                        >
                          <span
                            className={cn(
                              'h-6 w-6 rounded-full bg-surface shadow transition-transform',
                              flag.is_enabled ? 'translate-x-14' : 'translate-x-0',
                            )}
                          />
                          <span
                            className={cn(
                              'text-[9px] font-black uppercase tracking-widest',
                              flag.is_enabled ? 'text-success' : 'text-foreground-muted',
                            )}
                          >
                            {flag.is_enabled ? 'On' : 'Off'}
                          </span>
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={3} className="px-8 py-20 text-center space-y-3">
                      <Flag className="mx-auto text-foreground-muted" size={44} aria-hidden="true" />
                      <p className="text-foreground-muted font-black uppercase tracking-widest text-xs">
                        Tidak ada feature flag yang cocok.
                      </p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Change Log Panel */}
        <aside aria-labelledby="ff-changelog-title" className="glass-card rounded-[40px] border-border p-8 xl:sticky xl:top-4">
          <h2 id="ff-changelog-title" className="text-sm font-black uppercase tracking-[0.22em] text-foreground-muted flex items-center gap-2">
            <History size={15} aria-hidden="true" /> Change Log
          </h2>
          {auditLogsQuery.isLoading ? (
            <div className="mt-6 space-y-3" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-14 rounded-2xl" />
              ))}
            </div>
          ) : flagAuditLogs.length === 0 ? (
            <p className="mt-6 text-xs text-foreground-muted italic">
              Belum ada aktivitas feature flag tercatat di audit log.
            </p>
          ) : (
            <ul className="mt-6 space-y-3 max-h-[480px] overflow-y-auto pr-1">
              {flagAuditLogs.map((log, i) => (
                <li
                  key={String(log.id ?? i)}
                  className="rounded-2xl bg-surface/[0.03] border border-border p-4"
                >
                  <p className="text-[11px] font-black text-foreground-muted truncate" title={(log.action as string)?.replace(/_/g, ' ') || 'perubahan'}>
                    {(log.action as string)?.replace(/_/g, ' ') || 'perubahan'}
                  </p>
                  <p className="text-[10px] text-foreground-muted mt-1 line-clamp-2" title={log.payload?.reason || log.reason || (typeof log.payload === 'string' ? log.payload : '') || '—'}>
                    {log.payload?.reason || log.reason || (typeof log.payload === 'string' ? log.payload : '') || '—'}
                  </p>
                  <p className="text-[9px] text-foreground-muted font-bold uppercase tracking-widest mt-2">
                    {log.actor_name || log.actor_id || 'sistem'} •{' '}
                    {log.created_at ? new Date(log.created_at).toLocaleString('id-ID') : ''}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>

      {/* Toggle Reason Modal */}
      {toggleTarget && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center p-6">
          <div
            className="absolute inset-0 bg-scrim/80 backdrop-blur-sm"
            onClick={() => setToggleTarget(null)}
            aria-hidden="true"
          />
          <FocusTrap className="relative z-10 outline-none w-full max-w-md">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="ff-toggle-title"
              className="glass-card w-full p-8 rounded-[32px] border-border"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 id="ff-toggle-title" className="text-xl font-black text-foreground-muted">
                    {toggleTarget.is_enabled ? 'Nonaktifkan' : 'Aktifkan'} Feature?
                  </h2>
                  <p className="text-xs text-foreground-muted mt-1 font-mono">{toggleTarget.key}</p>
                </div>
                <span
                  className={cn(
                    'px-3 py-1 rounded-full text-xs font-bold tracking-wide border shrink-0',
                    toggleTarget.is_enabled
                      ? 'bg-success-surface text-success border-success'
                      : 'bg-surface-raised text-foreground-muted border-border',
                  )}
                >
                  {toggleTarget.is_enabled ? 'On → Off' : 'Off → On'}
                </span>
              </div>
              <div className="mt-6 space-y-2">
                <label htmlFor="ff-reason" className="text-xs font-bold tracking-wide text-foreground-muted">
                  Alasan Perubahan (wajib)
                </label>
                <textarea
                  id="ff-reason"
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Contoh: rollout bertahap payment gateway baru..."
                  className="w-full bg-surface-subtle border border-border rounded-2xl p-4 text-sm font-medium text-foreground-muted focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
                />
              </div>
              <div className="mt-5 space-y-2">
                <label htmlFor="ff-rollback-plan" className="text-xs font-bold tracking-wide text-foreground-muted">
                  Rollback Plan {toggleTarget.require_checklist ? '(wajib)' : '(wajib untuk high-blast flag)'}
                </label>
                <textarea
                  id="ff-rollback-plan"
                  rows={3}
                  value={rollbackPlan}
                  onChange={(e) => setRollbackPlan(e.target.value)}
                  placeholder="Contoh: kembalikan flag ke off, verifikasi active-order recovery, lalu pantau error rate..."
                  className="w-full bg-surface-subtle border border-border rounded-2xl p-4 text-sm font-medium text-foreground-muted focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
                />
              </div>
              <div className="flex justify-end gap-3 mt-8">
                <button
                  type="button"
                  onClick={() => setToggleTarget(null)}
                  className="px-5 py-2.5 rounded-xl font-bold text-sm text-foreground-muted hover:text-foreground transition-colors"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={submitToggle}
                  disabled={toggleMutation.isPending || !canMutate}
                  className={cn(
                    'inline-flex items-center gap-2 px-6 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest text-foreground transition-colors disabled:opacity-60',
                    toggleTarget.is_enabled ? 'bg-error hover:bg-error' : 'bg-success hover:bg-success',
                  )}
                >
                  {toggleMutation.isPending && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
                  Konfirmasi
                </button>
              </div>
            </div>
          </FocusTrap>
        </div>
      )}
    </div>
  )
}

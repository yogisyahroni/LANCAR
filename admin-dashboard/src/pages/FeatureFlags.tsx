import { useMemo, useState } from 'react'
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

interface FeatureFlag {
  key: string
  name?: string | null
  description?: string | null
  category?: string | null
  is_enabled: boolean
  updated_at?: string | null
  updated_by_name?: string | null
}

const flagErrorMessage = (error: any, fallback: string) =>
  error?.response?.data?.error || error?.response?.data?.message || error?.message || fallback

export default function FeatureFlags() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [toggleTarget, setToggleTarget] = useState<FeatureFlag | null>(null)
  const [reason, setReason] = useState('')

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
    mutationFn: async ({ key, nextEnabled, reason }: { key: string; nextEnabled: boolean; reason: string }) => {
      return api.patch(`/admin/feature-flags/${key}/toggle`, { new_enabled: nextEnabled, reason })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feature-flags'] })
      queryClient.invalidateQueries({ queryKey: ['audit-logs'] })
      toast.success('Feature flag diperbarui')
      setToggleTarget(null)
      setReason('')
    },
    onError: (error: any) => {
      toast.error(flagErrorMessage(error, 'Gagal memperbarui feature flag'))
    },
  })

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
    toggleMutation.mutate({
      key: toggleTarget.key,
      nextEnabled: !toggleTarget.is_enabled,
      reason: reason.trim(),
    })
  }

  return (
    <div className="space-y-8 animate-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-zinc-100 tracking-tight flex items-center gap-3">
            <Flag size={26} className="text-primary-light" />
            Feature Flags
          </h1>
          <p className="text-zinc-500 mt-1">Kontrol on/off fitur platform dengan jejak alasan perubahan.</p>
        </div>
        <div className="relative w-full md:w-80">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-600" size={16} aria-hidden="true" />
          <label htmlFor="ff-search" className="sr-only">Cari feature flag</label>
          <input
            id="ff-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari key, nama, atau deskripsi..."
            className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 pl-11 pr-4 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all placeholder:text-zinc-600 placeholder:font-medium"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[2fr_1fr] gap-8 items-start">
        {/* Flags Table */}
        <div className="glass-card rounded-[40px] border-white/5 overflow-hidden shadow-2xl shadow-black/40">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/5 bg-white/[0.01]">
                  {['Flag', 'Kategori', 'Status'].map((head) => (
                    <th key={head} scope="col" className="px-6 py-5 text-xs font-black text-zinc-500 uppercase tracking-[0.2em]">
                      {head}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
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
                      <AlertCircle className="w-8 h-8 mx-auto text-red-400" />
                      <p className="text-xs font-black uppercase tracking-widest text-zinc-200">Feature flags gagal dimuat</p>
                      <button
                        type="button"
                        onClick={() => flagsQuery.refetch()}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-[10px] font-black uppercase tracking-widest hover:bg-red-500/20 transition-all"
                      >
                        <RefreshCw size={13} />
                        Retry
                      </button>
                    </td>
                  </tr>
                ) : filteredFlags.length > 0 ? (
                  filteredFlags.map((flag) => (
                    <tr key={flag.key} className="hover:bg-white/[0.02] transition-colors group">
                      <td className="px-6 py-5 max-w-md">
                        <p className="text-sm font-black text-zinc-100">{flag.name || flag.key}</p>
                        {flag.name && flag.name !== flag.key && (
                          <p className="text-[10px] text-zinc-600 font-mono mt-0.5">{flag.key}</p>
                        )}
                        {flag.description && (
                          <p className="text-xs text-zinc-500 mt-1 line-clamp-1">{flag.description}</p>
                        )}
                      </td>
                      <td className="px-6 py-5">
                        <span className="px-2.5 py-1 rounded-lg bg-zinc-800 text-zinc-400 border border-white/5 text-[9px] font-black uppercase tracking-widest">
                          {flag.category || 'Umum'}
                        </span>
                      </td>
                      <td className="px-6 py-5">
                        <button
                          type="button"
                          onClick={() => {
                            setToggleTarget(flag)
                            setReason('')
                          }}
                          role="switch"
                          aria-checked={flag.is_enabled}
                          aria-label={`${flag.is_enabled ? 'Nonaktifkan' : 'Aktifkan'} ${flag.key}`}
                          disabled={toggleMutation.isPending}
                          className={cn(
                            'inline-flex items-center gap-3 rounded-full px-1 py-1 transition-colors w-24 justify-start',
                            flag.is_enabled ? 'bg-emerald-500/20' : 'bg-zinc-800',
                          )}
                        >
                          <span
                            className={cn(
                              'h-6 w-6 rounded-full bg-white shadow transition-transform',
                              flag.is_enabled ? 'translate-x-14' : 'translate-x-0',
                            )}
                          />
                          <span
                            className={cn(
                              'text-[9px] font-black uppercase tracking-widest',
                              flag.is_enabled ? 'text-emerald-400' : 'text-zinc-500',
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
                      <Flag className="mx-auto text-zinc-800" size={44} />
                      <p className="text-zinc-500 font-black uppercase tracking-widest text-xs">
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
        <aside aria-labelledby="ff-changelog-title" className="glass-card rounded-[40px] border-white/5 p-8 xl:sticky xl:top-4">
          <h2 id="ff-changelog-title" className="text-sm font-black uppercase tracking-[0.22em] text-zinc-500 flex items-center gap-2">
            <History size={15} /> Change Log
          </h2>
          {auditLogsQuery.isLoading ? (
            <div className="mt-6 space-y-3" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-14 rounded-2xl" />
              ))}
            </div>
          ) : flagAuditLogs.length === 0 ? (
            <p className="mt-6 text-xs text-zinc-600 italic">
              Belum ada aktivitas feature flag tercatat di audit log.
            </p>
          ) : (
            <ul className="mt-6 space-y-3 max-h-[480px] overflow-y-auto pr-1">
              {flagAuditLogs.map((log, i) => (
                <li
                  key={String(log.id ?? i)}
                  className="rounded-2xl bg-white/[0.03] border border-white/5 p-4"
                >
                  <p className="text-[11px] font-black text-zinc-200 truncate">
                    {(log.action as string)?.replace(/_/g, ' ') || 'perubahan'}
                  </p>
                  <p className="text-[10px] text-zinc-500 mt-1 line-clamp-2">
                    {log.payload?.reason || log.reason || (typeof log.payload === 'string' ? log.payload : '') || '—'}
                  </p>
                  <p className="text-[9px] text-zinc-600 font-bold uppercase tracking-widest mt-2">
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
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => setToggleTarget(null)}
            aria-hidden="true"
          />
          <FocusTrap className="relative z-10 outline-none w-full max-w-md">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="ff-toggle-title"
              className="glass-card w-full p-8 rounded-[32px] border-white/10"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 id="ff-toggle-title" className="text-xl font-black text-zinc-100">
                    {toggleTarget.is_enabled ? 'Nonaktifkan' : 'Aktifkan'} Feature?
                  </h2>
                  <p className="text-xs text-zinc-500 mt-1 font-mono">{toggleTarget.key}</p>
                </div>
                <span
                  className={cn(
                    'px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border shrink-0',
                    toggleTarget.is_enabled
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                      : 'bg-zinc-800 text-zinc-500 border-white/10',
                  )}
                >
                  {toggleTarget.is_enabled ? 'On → Off' : 'Off → On'}
                </span>
              </div>
              <div className="mt-6 space-y-2">
                <label htmlFor="ff-reason" className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                  Alasan Perubahan (wajib)
                </label>
                <textarea
                  id="ff-reason"
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Contoh: rollout bertahap payment gateway baru..."
                  className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-sm font-medium text-zinc-100 focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
                />
              </div>
              <div className="flex justify-end gap-3 mt-8">
                <button
                  type="button"
                  onClick={() => setToggleTarget(null)}
                  className="px-5 py-2.5 rounded-xl font-bold text-sm text-zinc-400 hover:text-white transition-colors"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={submitToggle}
                  disabled={toggleMutation.isPending}
                  className={cn(
                    'inline-flex items-center gap-2 px-6 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest text-white transition-colors disabled:opacity-50',
                    toggleTarget.is_enabled ? 'bg-red-500 hover:bg-red-400' : 'bg-emerald-500 hover:bg-emerald-400',
                  )}
                >
                  {toggleMutation.isPending && <Loader2 size={14} className="animate-spin" />}
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

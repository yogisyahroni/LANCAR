import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Shield, AlertTriangle, Lock, Unlock, History,
  Info, Plus, X, Loader2, CheckCircle2, Clock,
  AlertCircle, ChevronRight
} from 'lucide-react'
import { cn } from '../lib/utils'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { toast } from 'sonner'

// ─── Types ────────────────────────────────────────────────────────────────────
interface FeatureFlag {
  id: string
  key: string
  category: string
  is_enabled: boolean
  config: Record<string, any>
  require_checklist: boolean
  updated_at: string
  updated_by?: string
  description?: string
}

interface FlagLog {
  id: string
  flag_key: string
  is_enabled: boolean
  updated_by: string
  change_reason: string
  created_at: string
}

// ─── Skeleton Loader ──────────────────────────────────────────────────────────
const FlagSkeleton = () => (
  <div className="glass-card p-6 rounded-3xl border-white/5 animate-pulse space-y-4">
    <div className="flex items-start justify-between">
      <div className="h-12 w-12 rounded-2xl bg-white/5" />
      <div className="h-6 w-16 rounded-full bg-white/5" />
    </div>
    <div className="h-5 w-3/4 bg-white/5 rounded-lg" />
    <div className="h-4 w-full bg-white/5 rounded-lg" />
    <div className="h-4 w-2/3 bg-white/5 rounded-lg" />
    <div className="h-10 w-full bg-white/5 rounded-xl" />
  </div>
)

// ─── TOTP Input Group ─────────────────────────────────────────────────────────
const TotpInput = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => {
  const inputs = useRef<(HTMLInputElement | null)[]>([])
  const digits = value.padEnd(6, '').split('').slice(0, 6)

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>, idx: number) => {
    if (e.key === 'Backspace' && !digits[idx] && idx > 0) {
      inputs.current[idx - 1]?.focus()
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>, idx: number) => {
    const val = e.target.value.replace(/\D/g, '').slice(-1)
    const next = [...digits]
    next[idx] = val
    const joined = next.join('').replace(/ /g, '')
    onChange(joined)
    if (val && idx < 5) inputs.current[idx + 1]?.focus()
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    onChange(pasted)
    if (pasted.length === 6) inputs.current[5]?.focus()
    e.preventDefault()
  }

  return (
    <div className="flex gap-3">
      {[0,1,2,3,4,5].map((idx) => (
        <input
          key={idx}
          ref={el => { inputs.current[idx] = el }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={digits[idx] || ''}
          onChange={e => handleChange(e, idx)}
          onKeyDown={e => handleKey(e, idx)}
          onPaste={handlePaste}
          className="w-full h-14 bg-white/5 border border-white/10 rounded-xl text-center text-xl font-bold focus:border-primary focus:ring-2 focus:ring-primary/30 transition-all outline-none"
        />
      ))}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function FeatureFlags() {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState('All')
  const [toggleModal, setToggleModal] = useState<FeatureFlag | null>(null)
  const [logsModal, setLogsModal] = useState<FeatureFlag | null>(null)
  const [createModal, setCreateModal] = useState(false)
  const [reason, setReason] = useState('')
  const [totp, setTotp] = useState('')
  const [newFlag, setNewFlag] = useState({ key: '', category: 'Feature', description: '', reason: '' })

  // ── GET all flags ──
  const { data: flags = [], isLoading } = useQuery<FeatureFlag[]>({
    queryKey: ['admin-feature-flags', activeTab],
    queryFn: async () => {
      const params = activeTab !== 'All' ? { category: activeTab } : {}
      const res = await api.get('/admin/feature-flags', { params })
      return res.data
    },
    refetchInterval: 30000
  })

  // ── GET logs for a specific flag ──
  const { data: logs = [], isLoading: isLoadingLogs } = useQuery<FlagLog[]>({
    queryKey: ['admin-flag-logs', logsModal?.key],
    queryFn: async () => {
      const res = await api.get(`/admin/feature-flags/${logsModal!.key}/logs`)
      return res.data
    },
    enabled: !!logsModal
  })

  // ── PATCH toggle flag ──
  const toggleMutation = useMutation({
    mutationFn: async ({ flag, totp_code }: { flag: FeatureFlag; totp_code: string }) => {
      return api.patch(`/admin/feature-flags/${flag.key}/toggle`, {
        new_enabled: !flag.is_enabled,
        reason,
        totp_code,
        ...(flag.require_checklist && !flag.is_enabled
          ? { checklist_data: { admin_manual_confirm: true } }
          : {})
      })
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['admin-feature-flags'] })
      toast.success(`Flag "${vars.flag.key}" ${vars.flag.is_enabled ? 'deactivated' : 'activated'} successfully`)
      setToggleModal(null)
      setReason('')
      setTotp('')
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Failed to toggle flag')
    }
  })

  // ── POST create flag ──
  const createMutation = useMutation({
    mutationFn: async () => {
      return api.post('/admin/feature-flags', {
        key: newFlag.key,
        category: newFlag.category,
        description: newFlag.description,
        is_enabled: false,
        reason: newFlag.reason
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-feature-flags'] })
      toast.success('New feature flag created')
      setCreateModal(false)
      setNewFlag({ key: '', category: 'Feature', description: '', reason: '' })
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Failed to create flag')
    }
  })

  const canSubmitToggle = reason.length >= 50 && totp.length === 6

  return (
    <div className="space-y-8 animate-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-zinc-100 tracking-tight">Feature Management</h1>
          <p className="text-zinc-500 mt-1 flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary-light" />
            Control center for system capabilities and rollouts
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="glass-card px-4 py-2 rounded-xl flex items-center gap-2 border-amber-500/20 bg-amber-500/5">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <span className="text-xs font-bold text-amber-200">SUPER ADMIN MODE</span>
          </div>
          <button
            onClick={() => setCreateModal(true)}
            className="px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-bold flex items-center gap-2 hover:scale-[1.02] active:scale-[0.98] transition-all shadow-lg shadow-primary/20"
          >
            <Plus size={16} />
            New Flag
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-white/5 pb-px">
        {['All', 'Model', 'Pricing', 'Feature', 'System'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "px-6 py-3 text-sm font-medium transition-all relative",
              activeTab === tab ? "text-primary-light" : "text-zinc-500 hover:text-zinc-300"
            )}
          >
            {tab}
            {activeTab === tab && (
              <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-light" />
            )}
          </button>
        ))}
      </div>

      {/* Flags Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {isLoading
          ? [...Array(6)].map((_, i) => <FlagSkeleton key={i} />)
          : flags.map((flag, i) => (
            <motion.div
              key={flag.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.05 }}
              className="glass-card p-6 rounded-3xl relative overflow-hidden group border-white/5 hover:border-primary/20 transition-all"
            >
              <div className="flex items-start justify-between mb-4">
                <div className={cn(
                  "p-3 rounded-2xl",
                  flag.is_enabled ? "bg-emerald-500/10 text-emerald-400" : "bg-zinc-800 text-zinc-500"
                )}>
                  {flag.is_enabled ? <Unlock size={24} /> : <Lock size={24} />}
                </div>
                <div className={cn(
                  "px-3 py-1 rounded-full text-[10px] font-bold tracking-widest uppercase",
                  flag.is_enabled
                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                    : "bg-zinc-800 text-zinc-500 border border-white/5"
                )}>
                  {flag.is_enabled ? 'ON' : 'OFF'}
                </div>
              </div>

              <h3 className="text-lg font-bold text-zinc-100 mb-1">{flag.key}</h3>
              <p className="text-xs text-zinc-600 font-bold uppercase tracking-widest mb-2">{flag.category}</p>
              {flag.description && (
                <p className="text-sm text-zinc-500 mb-4 min-h-[36px]">{flag.description}</p>
              )}

              <div className="space-y-2 mb-6">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-600">Last updated</span>
                  <span className="text-zinc-300 font-medium">
                    {new Date(flag.updated_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </span>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => { setToggleModal(flag); setReason(''); setTotp('') }}
                  className={cn(
                    "flex-1 py-2.5 rounded-xl text-sm font-bold transition-all",
                    flag.is_enabled
                      ? "bg-white/5 text-zinc-400 hover:bg-white/10"
                      : "bg-primary text-white shadow-lg shadow-primary/20 hover:scale-[1.02]"
                  )}
                >
                  {flag.is_enabled ? 'Deactivate' : 'Activate'}
                </button>
                <button
                  onClick={() => setLogsModal(flag)}
                  className="p-2.5 rounded-xl bg-white/5 text-zinc-500 hover:text-white transition-all"
                  title="View change logs"
                >
                  <History size={18} />
                </button>
              </div>

              {flag.require_checklist && (
                <div className="absolute top-0 right-0 p-2">
                  <Link to="/three-legs-readiness">
                    <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 transition-all cursor-pointer">
                      <Info size={14} />
                    </div>
                  </Link>
                </div>
              )}
            </motion.div>
          ))}
      </div>

      {/* ── Toggle Confirm Modal ── */}
      <AnimatePresence>
        {toggleModal && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setToggleModal(null)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="glass-card w-full max-w-lg p-8 rounded-[40px] relative z-10 border-white/10"
            >
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-2xl font-bold text-zinc-100">
                  {toggleModal.is_enabled ? 'Deactivate' : 'Activate'}{' '}
                  <span className="text-primary-light">{toggleModal.key}</span>
                </h2>
                <button onClick={() => setToggleModal(null)} className="p-2 hover:bg-white/5 rounded-full transition-colors">
                  <X size={20} className="text-zinc-500" />
                </button>
              </div>
              <p className="text-zinc-500 text-sm mb-8">
                This action will be logged in the immutable audit trail and broadcasted via WebSockets to all services.
              </p>

              <div className="space-y-6">
                <div>
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2 block">
                    Reason for change{' '}
                    <span className={cn("ml-1", reason.length >= 50 ? "text-emerald-400" : "text-zinc-600")}>
                      ({reason.length}/50 min)
                    </span>
                  </label>
                  <textarea
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    placeholder="Describe why this change is necessary (min 50 chars)..."
                    className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 min-h-[100px] transition-all resize-none"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2 block">
                    TOTP Verification (Google Authenticator)
                  </label>
                  <TotpInput value={totp} onChange={setTotp} />
                </div>

                <div className="flex gap-4 pt-2">
                  <button
                    onClick={() => setToggleModal(null)}
                    className="flex-1 py-4 rounded-2xl text-zinc-400 font-bold hover:bg-white/5 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    disabled={!canSubmitToggle || toggleMutation.isPending}
                    onClick={() => toggleMutation.mutate({ flag: toggleModal, totp_code: totp })}
                    className="flex-1 py-4 rounded-2xl bg-primary text-white font-bold shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:scale-100 flex items-center justify-center gap-2"
                  >
                    {toggleMutation.isPending
                      ? <><Loader2 size={18} className="animate-spin" /> Processing...</>
                      : 'Confirm Change'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Logs Drawer ── */}
      <AnimatePresence>
        {logsModal && (
          <div className="fixed inset-0 z-[200] flex items-end md:items-center justify-center p-0 md:p-6">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setLogsModal(null)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, y: 60 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 60 }}
              className="glass-card w-full md:max-w-2xl max-h-[80vh] overflow-y-auto p-8 rounded-t-[40px] md:rounded-[40px] relative z-10 border-white/10"
            >
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-xl font-bold text-zinc-100">Change Log</h2>
                  <p className="text-sm text-zinc-500 mt-1 font-mono">{logsModal.key}</p>
                </div>
                <button onClick={() => setLogsModal(null)} className="p-2 hover:bg-white/5 rounded-full transition-colors">
                  <X size={20} className="text-zinc-500" />
                </button>
              </div>

              {isLoadingLogs ? (
                <div className="flex flex-col items-center py-12 gap-4">
                  <Loader2 className="animate-spin text-primary" size={32} />
                  <p className="text-zinc-500 text-sm">Loading logs...</p>
                </div>
              ) : logs.length === 0 ? (
                <div className="text-center py-12 text-zinc-600">
                  <History size={40} className="mx-auto mb-3 opacity-30" />
                  <p className="text-sm">No change logs yet for this flag.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {logs.map((log, i) => (
                    <motion.div
                      key={log.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.04 }}
                      className="flex items-start gap-4 p-4 rounded-2xl bg-white/[0.02] border border-white/5"
                    >
                      <div className={cn(
                        "mt-0.5 p-1.5 rounded-lg flex-shrink-0",
                        log.is_enabled ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
                      )}>
                        {log.is_enabled ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className={cn("text-xs font-bold uppercase tracking-widest",
                            log.is_enabled ? "text-emerald-400" : "text-red-400"
                          )}>
                            {log.is_enabled ? 'ACTIVATED' : 'DEACTIVATED'}
                          </span>
                          <div className="flex items-center gap-1 text-zinc-600 text-xs flex-shrink-0">
                            <Clock size={12} />
                            {new Date(log.created_at).toLocaleString('id-ID')}
                          </div>
                        </div>
                        <p className="text-sm text-zinc-300 mt-1 break-words">{log.change_reason}</p>
                        <p className="text-xs text-zinc-600 mt-1">by {log.updated_by}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Create Flag Modal ── */}
      <AnimatePresence>
        {createModal && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setCreateModal(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="glass-card w-full max-w-lg p-8 rounded-[40px] relative z-10 border-white/10"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
                  <Plus size={20} className="text-primary-light" />
                  Create Feature Flag
                </h2>
                <button onClick={() => setCreateModal(false)} className="p-2 hover:bg-white/5 rounded-full transition-colors">
                  <X size={20} className="text-zinc-500" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2 block">Flag Key</label>
                  <input
                    value={newFlag.key}
                    onChange={e => setNewFlag({ ...newFlag, key: e.target.value.toLowerCase().replace(/\s+/g, '_') })}
                    placeholder="e.g. model_three_legs"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2 block">Category</label>
                  <select
                    value={newFlag.category}
                    onChange={e => setNewFlag({ ...newFlag, category: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all appearance-none"
                  >
                    {['Model', 'Pricing', 'Feature', 'System'].map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2 block">Description</label>
                  <input
                    value={newFlag.description}
                    onChange={e => setNewFlag({ ...newFlag, description: e.target.value })}
                    placeholder="Brief description of this flag..."
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2 block">
                    Reason{' '}
                    <span className={cn("ml-1", newFlag.reason.length >= 50 ? "text-emerald-400" : "text-zinc-600")}>
                      ({newFlag.reason.length}/50 min)
                    </span>
                  </label>
                  <textarea
                    value={newFlag.reason}
                    onChange={e => setNewFlag({ ...newFlag, reason: e.target.value })}
                    placeholder="Why is this flag being created? (min 50 chars)"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all resize-none min-h-[80px]"
                  />
                </div>
                <button
                  disabled={!newFlag.key || !newFlag.reason || newFlag.reason.length < 50 || createMutation.isPending}
                  onClick={() => createMutation.mutate()}
                  className="w-full py-4 rounded-2xl bg-primary text-white font-bold shadow-lg shadow-primary/20 hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-40 disabled:scale-100 flex items-center justify-center gap-2"
                >
                  {createMutation.isPending
                    ? <><Loader2 size={18} className="animate-spin" /> Creating...</>
                    : <><Plus size={18} /> Create Flag</>}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* View Readiness Link CTA */}
      <div className="p-6 rounded-3xl bg-amber-500/5 border border-amber-500/20 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <AlertTriangle size={24} className="text-amber-500 flex-shrink-0" />
          <div>
            <p className="text-sm font-bold text-amber-200">3-Leg Relay not ready for launch</p>
            <p className="text-xs text-zinc-500 mt-0.5">Check strategic readiness checklist before enabling Model 3-Kaki.</p>
          </div>
        </div>
        <Link to="/three-legs-readiness">
          <button className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500/10 text-amber-300 text-sm font-bold hover:bg-amber-500/20 transition-all flex-shrink-0">
            View Readiness <ChevronRight size={16} />
          </button>
        </Link>
      </div>
    </div>
  )
}

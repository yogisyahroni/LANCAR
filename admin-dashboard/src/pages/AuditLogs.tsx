import { useState } from 'react'
import { 
  History, 
  Search, 
  Filter, 
  User, 
  Tag, 
  Info,
  ChevronLeft,
  ChevronRight,
  Download,
  AlertCircle,
  CreditCard,
  Truck,
  ShieldCheck,
  Megaphone,
  Activity,
  Layers
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { clientLog } from '../lib/clientLogger'
import { cn } from '../lib/utils'
import { format } from 'date-fns'

export default function AuditLogs() {
  const [searchTerm, setSearchTerm] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['audit-logs'],
    queryFn: async () => {
      const res = await api.get('/admin/audit-logs')
      return res.data
    }
  })

  const filteredLogs = logs.filter((log: any) => {
    const matchesSearch = String(log?.key || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
                          String(log?.change_reason || '').toLowerCase().includes(searchTerm.toLowerCase())
    const matchesCategory = categoryFilter === 'all' || log?.category === categoryFilter
    return matchesSearch && matchesCategory
  })

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-foreground-muted tracking-tight flex items-center gap-3">
            <History className="text-primary-light" size={32}  aria-hidden="true"/>
            System Audit Logs
          </h1>
          <p className="text-foreground-muted font-medium mt-1">Track every configuration change and feature flag toggle across the platform.</p>
        </div>
        <button 
          onClick={async () => {
            try {
              const res = await api.get('/admin/audit-logs/export', { responseType: 'blob' })
              const url = URL.createObjectURL(res.data)
              const a = document.createElement('a')
              a.href = url
              a.download = `system_audit_${new Date().toISOString().split('T')[0]}.csv`
              a.click()
              URL.revokeObjectURL(url)
            } catch (error) { clientLog.error('Audit log export failed', { error }) }
          }}
          className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-surface-subtle border border-border text-foreground-muted font-bold hover:bg-surface-subtle transition-all"
        >
          <Download size={18} aria-hidden="true" />
          Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="relative md:col-span-2">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-foreground-muted" size={18} aria-hidden="true" />
          <input 
            type="text" 
            aria-label="Search audit logs by key or reason"
            placeholder="Search by key or reason..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-surface-subtle border border-border rounded-2xl py-4 pl-12 pr-4 text-foreground-muted focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
          />
        </div>
        <div className="relative">
          <Filter className="absolute left-4 top-1/2 -translate-y-1/2 text-foreground-muted" size={18} aria-hidden="true" />
          <select 
            aria-label="Filter audit logs by category"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="w-full bg-surface-subtle border border-border rounded-2xl py-4 pl-12 pr-4 text-foreground-muted focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all appearance-none"
          >
            <option value="all">All Categories</option>
            <option value="finance">Finance / Treasury</option>
            <option value="logistics">Logistics / Zones</option>
            <option value="insurance">Insurance / Risks</option>
            <option value="security">Security / Auth</option>
            <option value="marketing">Marketing / Promos</option>
            <option value="feature">Feature Flags</option>
            <option value="general">General System</option>
          </select>
        </div>
      </div>

      {/* Logs Table */}
      <div className="glass-card rounded-[40px] border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border bg-surface/[0.02]">
                <th scope="col" className="px-8 py-6 text-[10px] font-black text-foreground-muted uppercase tracking-widest">Timestamp</th>
                <th scope="col" className="px-8 py-6 text-[10px] font-black text-foreground-muted uppercase tracking-widest">Entity / Key</th>
                <th scope="col" className="px-8 py-6 text-[10px] font-black text-foreground-muted uppercase tracking-widest">Action</th>
                <th scope="col" className="px-8 py-6 text-[10px] font-black text-foreground-muted uppercase tracking-widest">Changed By</th>
                <th scope="col" className="px-8 py-6 text-[10px] font-black text-foreground-muted uppercase tracking-widest">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={5} className="px-8 py-6">
                      <div className="h-4 bg-surface-subtle rounded w-full" />
                    </td>
                  </tr>
                ))
              ) : filteredLogs.length > 0 ? (
                filteredLogs.map((log: any) => (
                  <tr key={log.id} className="hover:bg-surface/[0.01] transition-colors group">
                    <td className="px-8 py-6">
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-foreground-muted">{format(new Date(log.created_at), 'MMM dd, HH:mm:ss')}</span>
                        <span className="text-[10px] text-foreground-muted font-medium">{format(new Date(log.created_at), 'yyyy')}</span>
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "h-8 w-8 rounded-lg flex items-center justify-center shadow-sm",
                          log.category === 'finance' ? "bg-success-surface text-success" :
                          log.category === 'logistics' ? "bg-info-surface text-info" :
                          log.category === 'insurance' ? "bg-info-surface text-info" :
                          log.category === 'security' ? "bg-error/10 text-error" :
                          log.category === 'marketing' ? "bg-accent-surface text-accent" :
                          log.category === 'feature' ? "bg-primary/10 text-primary-light" :
                          "bg-surface-subtle text-foreground-muted"
                        )}>
                          {log.category === 'finance' ? <CreditCard size={14} aria-hidden="true" /> :
                           log.category === 'logistics' ? <Truck size={14} aria-hidden="true" /> :
                           log.category === 'insurance' ? <ShieldCheck size={14} aria-hidden="true" /> :
                           log.category === 'security' ? <ShieldCheck size={14} aria-hidden="true" /> :
                           log.category === 'marketing' ? <Megaphone size={14} aria-hidden="true" /> :
                           log.category === 'feature' ? <Activity size={14} aria-hidden="true" /> :
                           <Layers size={14} aria-hidden="true" />}
                        </div>
                        <div className="flex flex-col">
                          <span className="text-sm font-mono font-black text-foreground-muted tracking-tight">{log.key}</span>
                          <span className="text-[10px] text-foreground-muted font-bold uppercase tracking-wider">{log.category || 'uncategorized'}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <span className={cn(
                        "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest",
                        log.is_enabled ? "bg-success-surface text-success" : "bg-error-surface text-error"
                      )}>
                        {log.is_enabled ? (log.key.includes(':') ? 'ACTION COMPLETED' : 'ENABLED') : 'DISABLED / REJECTED'}
                      </span>
                    </td>
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "h-7 w-7 rounded-full flex items-center justify-center",
                          log.updated_by_name ? "bg-primary/20 text-primary-light" : "bg-surface-raised text-foreground-muted"
                        )}>
                          <User size={14} aria-hidden="true" />
                        </div>
                        <div className="flex flex-col">
                          <span className={cn(
                            "text-sm font-bold tracking-tight",
                            log.updated_by_name ? "text-foreground-muted" : "text-foreground-muted italic"
                          )}>
                            {log.updated_by_name || 'Automated System'}
                          </span>
                          {log.updated_by_name && (
                            <span className="text-[10px] text-foreground-muted font-bold uppercase tracking-widest">Administrator</span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-6 max-w-xs">
                      <p className="text-xs text-foreground-muted line-clamp-2 italic" title={log.change_reason || 'No reason provided.'}>{log.change_reason || 'No reason provided.'}</p>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-8 py-20 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <AlertCircle size={40} className="text-foreground-muted" aria-hidden="true" />
                      <p className="text-foreground-muted font-bold uppercase tracking-widest text-xs">No audit logs found matching filters.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-foreground-muted font-medium">Showing <span className="text-foreground-muted font-bold">{filteredLogs.length}</span> audit logs</p>
        <div className="flex items-center gap-2">
          <button type="button" aria-label="Previous audit log page" title="Previous audit log page" className="p-2 rounded-xl bg-surface-subtle border border-border text-foreground-muted hover:text-foreground transition-all disabled:opacity-60" disabled>
            <ChevronLeft size={18} aria-hidden="true" />
          </button>
          <button type="button" aria-label="Next audit log page" title="Next audit log page" className="p-2 rounded-xl bg-surface-subtle border border-border text-foreground-muted hover:text-foreground transition-all disabled:opacity-60" disabled>
            <ChevronRight size={18} aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  )
}

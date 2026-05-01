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
  AlertCircle
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
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
    const matchesSearch = log.key.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          log.change_reason?.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesCategory = categoryFilter === 'all' || log.category === categoryFilter
    return matchesSearch && matchesCategory
  })

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className="text-3xl font-black text-zinc-100 tracking-tight flex items-center gap-3">
            <History className="text-primary-light" size={32} />
            System Audit Logs
          </h2>
          <p className="text-zinc-500 font-medium mt-1">Track every configuration change and feature flag toggle across the platform.</p>
        </div>
        <button className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-white/5 border border-white/10 text-zinc-300 font-bold hover:bg-white/10 transition-all">
          <Download size={18} />
          Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="relative md:col-span-2">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
          <input 
            type="text" 
            placeholder="Search by key or reason..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
          />
        </div>
        <div className="relative">
          <Filter className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
          <select 
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all appearance-none"
          >
            <option value="all">All Categories</option>
            <option value="feature">Feature Flags</option>
            <option value="general">General Config</option>
            <option value="insurance">Insurance</option>
            <option value="security">Security</option>
          </select>
        </div>
      </div>

      {/* Logs Table */}
      <div className="glass-card rounded-[40px] border-white/5 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/5 bg-white/[0.02]">
                <th className="px-8 py-6 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Timestamp</th>
                <th className="px-8 py-6 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Entity / Key</th>
                <th className="px-8 py-6 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Action</th>
                <th className="px-8 py-6 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Changed By</th>
                <th className="px-8 py-6 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={5} className="px-8 py-6">
                      <div className="h-4 bg-white/5 rounded w-full" />
                    </td>
                  </tr>
                ))
              ) : filteredLogs.length > 0 ? (
                filteredLogs.map((log: any) => (
                  <tr key={log.id} className="hover:bg-white/[0.01] transition-colors group">
                    <td className="px-8 py-6">
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-zinc-200">{format(new Date(log.created_at), 'MMM dd, HH:mm:ss')}</span>
                        <span className="text-[10px] text-zinc-500 font-medium">{format(new Date(log.created_at), 'yyyy')}</span>
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "h-8 w-8 rounded-lg flex items-center justify-center",
                          log.key.startsWith('config:') ? "bg-amber-500/10 text-amber-500" : "bg-primary/10 text-primary-light"
                        )}>
                          {log.key.startsWith('config:') ? <Tag size={14} /> : <Info size={14} />}
                        </div>
                        <span className="text-sm font-mono font-bold text-zinc-300">{log.key}</span>
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <span className={cn(
                        "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest",
                        log.is_enabled ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
                      )}>
                        {log.is_enabled ? 'ENABLED / UPDATED' : 'DISABLED'}
                      </span>
                    </td>
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-2">
                        <div className="h-6 w-6 rounded-md bg-zinc-800 flex items-center justify-center">
                          <User size={12} className="text-zinc-500" />
                        </div>
                        <span className="text-xs font-bold text-zinc-400">{log.updated_by || 'System'}</span>
                      </div>
                    </td>
                    <td className="px-8 py-6 max-w-xs">
                      <p className="text-xs text-zinc-500 line-clamp-2 italic">{log.change_reason || 'No reason provided.'}</p>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-8 py-20 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <AlertCircle size={40} className="text-zinc-800" />
                      <p className="text-zinc-500 font-bold uppercase tracking-widest text-xs">No audit logs found matching filters.</p>
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
        <p className="text-xs text-zinc-600 font-medium">Showing <span className="text-zinc-400 font-bold">{filteredLogs.length}</span> audit logs</p>
        <div className="flex items-center gap-2">
          <button className="p-2 rounded-xl bg-white/5 border border-white/10 text-zinc-500 hover:text-white transition-all disabled:opacity-50" disabled>
            <ChevronLeft size={18} />
          </button>
          <button className="p-2 rounded-xl bg-white/5 border border-white/10 text-zinc-500 hover:text-white transition-all disabled:opacity-50" disabled>
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
    </div>
  )
}

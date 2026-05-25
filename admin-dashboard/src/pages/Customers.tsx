import { useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { 
  Users, 
  Search, 
  Filter, 
  ShoppingBag, 
  Mail, 
  ChevronRight,
  TrendingUp,
  Building2,
  ChevronLeft,
  Download,
  Loader2,
  AlertCircle,
  RefreshCw
} from 'lucide-react'
import { cn } from '../lib/utils'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { format } from 'date-fns'

// Debounce hook
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)
  const callbackRef = useCallback(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  useState(callbackRef)
  return debouncedValue
}

// Skeleton card
function CustomerSkeleton() {
  return (
    <div className="glass-card p-8 rounded-[40px] border-white/5 animate-pulse">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-6">
          <div className="h-16 w-16 rounded-[24px] bg-zinc-800" />
          <div className="space-y-2">
            <div className="h-5 w-36 bg-zinc-800 rounded-lg" />
            <div className="h-4 w-48 bg-zinc-800/60 rounded-lg" />
          </div>
        </div>
        <div className="h-5 w-16 bg-zinc-800/60 rounded-full" />
      </div>
      <div className="grid grid-cols-2 gap-4 mt-8 pt-8 border-t border-white/5">
        <div className="h-16 bg-zinc-800/40 rounded-2xl" />
        <div className="h-16 bg-zinc-800/40 rounded-2xl" />
      </div>
      <div className="h-12 bg-zinc-800/30 rounded-2xl mt-6" />
    </div>
  )
}

const queryErrorMessage = (error: any, fallback: string) =>
  error?.response?.data?.error || error?.response?.data?.message || error?.message || fallback

function CustomerErrorState({ title, message, onRetry }: { title: string; message: string; onRetry: () => void }) {
  return (
    <div className="col-span-full py-20 text-center space-y-4 rounded-[32px] border border-red-500/20 bg-red-500/5">
      <AlertCircle className="w-10 h-10 text-red-400 mx-auto" />
      <div>
        <p className="text-sm font-black text-zinc-100 uppercase tracking-widest">{title}</p>
        <p className="text-xs text-zinc-500 mt-2">{message}</p>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-300 text-[10px] font-black uppercase tracking-widest hover:bg-red-500/20 transition-all"
      >
        <RefreshCw size={14} />
        Retry
      </button>
    </div>
  )
}

export default function Customers() {
  const [searchInput, setSearchInput] = useState('')
  const [page, setPage] = useState(1)
  const LIMIT = 12

  // Debounce search 300ms — backend-driven
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const handleSearchChange = (value: string) => {
    setSearchInput(value)
    clearTimeout((handleSearchChange as any)._timer)
    ;(handleSearchChange as any)._timer = setTimeout(() => {
      setDebouncedSearch(value)
      setPage(1) // Reset to page 1 on new search
    }, 300)
  }

  const { data: stats, isLoading: isLoadingStats, isError: isStatsError, error: statsError, refetch: refetchStats } = useQuery({
    queryKey: ['customer-stats'],
    queryFn: async () => {
      const res = await api.get('/admin/customers/stats')
      return res.data
    }
  })

  const { data: customerRes, isLoading: isLoadingCustomers, isError: isCustomersError, error: customersError, refetch: refetchCustomers } = useQuery({
    queryKey: ['customers', debouncedSearch, page],
    queryFn: async () => {
      const res = await api.get('/admin/customers', {
        params: { search: debouncedSearch || undefined, page, limit: LIMIT }
      })
      return res.data // { data: [], total, page, limit }
    },
    placeholderData: (prev) => prev // keep previous data while loading new page
  })

  const customers = customerRes?.data || []
  const total = customerRes?.total || 0
  const totalPages = Math.ceil(total / LIMIT)

  const handleExport = async () => {
    try {
      const res = await api.get('/admin/customers/export', { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url
      a.download = `customers_export_${new Date().toISOString().split('T')[0]}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      console.error('Export failed')
    }
  }

  const statCards = [
    { label: 'Total Customers', value: isLoadingStats ? '—' : stats?.totalCustomers?.toLocaleString() ?? 'Tidak tersedia', icon: Users, color: 'text-zinc-400' },
    { label: 'UMKM Partners', value: isLoadingStats ? '—' : stats?.umkmPartners?.toLocaleString() ?? 'Tidak tersedia', icon: Building2, color: 'text-primary-light' },
    { label: 'Total Revenue', value: isLoadingStats ? '—' : typeof stats?.totalRevenue === 'number' ? `Rp ${stats.totalRevenue.toLocaleString()}` : 'Tidak tersedia', icon: TrendingUp, color: 'text-emerald-400' },
  ]

  return (
    <div className="space-y-8 animate-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold text-zinc-100 tracking-tight">Customer Directory</h1>
          <p className="text-zinc-500 mt-1">
            Manage personal and UMKM accounts, view order history and wallets.
            {total > 0 && <span className="text-zinc-600 ml-2">— {total.toLocaleString()} total</span>}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleExport}
            className="px-6 py-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-black text-sm uppercase tracking-widest hover:bg-emerald-500/20 transition-all flex items-center gap-2"
          >
            <Download size={18} />
            Export CSV
          </button>
          <button className="px-6 py-3 rounded-2xl bg-white/5 border border-white/10 text-zinc-300 font-black text-sm uppercase tracking-widest hover:bg-white/10 transition-all flex items-center gap-2">
            <Mail size={18} />
            Bulk Email
          </button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {isStatsError ? (
          <CustomerErrorState
            title="Customer stats gagal dimuat"
            message={queryErrorMessage(statsError, 'Statistik customer belum bisa diambil dari API admin.')}
            onRetry={() => refetchStats()}
          />
        ) : statCards.map((stat, i) => (
          <div key={i} className="glass-card p-8 rounded-[32px] border-white/5">
            <div className="flex items-center gap-4">
              <div className={cn("p-4 rounded-2xl bg-white/5", stat.color)}>
                <stat.icon size={24} />
              </div>
              <div>
                <p className="text-xs font-black text-zinc-600 uppercase tracking-widest">{stat.label}</p>
                <p className="text-2xl font-black text-zinc-100 mt-1">{stat.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Search + Filter */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative w-full md:w-96 group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-600 group-focus-within:text-primary-light transition-colors" size={18} />
          <input 
            type="text" 
            placeholder="Search by name, email, or ID..."
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-2xl py-3.5 pl-12 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all placeholder:text-zinc-600"
          />
          {isLoadingCustomers && (
            <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-600 animate-spin" size={16} />
          )}
        </div>
        <div className="flex items-center gap-2">
          <button className="p-3.5 rounded-2xl bg-white/5 text-zinc-500 hover:text-white border border-white/10 transition-all">
            <Filter size={20} />
          </button>
        </div>
      </div>

      {/* Customer Cards Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {isLoadingCustomers ? (
          Array.from({ length: 6 }).map((_, i) => <CustomerSkeleton key={i} />)
        ) : isCustomersError ? (
          <CustomerErrorState
            title="Customer gagal dimuat"
            message={queryErrorMessage(customersError, 'Daftar customer belum bisa diambil dari API admin.')}
            onRetry={() => refetchCustomers()}
          />
        ) : (
          <>
            {customers.map((customer: any, i: number) => (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                key={customer.id}
                className="glass-card p-8 rounded-[40px] border-white/5 hover:border-white/10 transition-all group"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-6">
                    <div className="h-16 w-16 rounded-[24px] bg-zinc-900 border border-white/10 flex items-center justify-center text-2xl font-black text-zinc-700 uppercase group-hover:bg-primary group-hover:text-white group-hover:border-primary/20 transition-all">
                      {customer.name?.charAt(0)}
                    </div>
                    <div>
                      <div className="flex items-center gap-3">
                        <h3 className="text-xl font-bold text-zinc-100">{customer.name}</h3>
                        <span className={cn(
                          "px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-widest border",
                          customer.orders_count > 100 
                            ? "border-primary-light/20 text-primary-light bg-primary-light/5" 
                            : "border-zinc-700 text-zinc-500 bg-white/5"
                        )}>
                          {customer.orders_count > 100 ? 'UMKM' : 'Personal'}
                        </span>
                      </div>
                      <p className="text-sm text-zinc-500 mt-1">{customer.email}</p>
                    </div>
                  </div>
                  <span className={cn(
                    "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest",
                    customer.status === 'active' ? "bg-emerald-500/10 text-emerald-400" : "bg-zinc-800 text-zinc-600"
                  )}>
                    {customer.status}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4 mt-8 pt-8 border-t border-white/5">
                  <div className="flex items-center gap-4 p-4 rounded-2xl bg-white/[0.01]">
                    <ShoppingBag size={18} className="text-zinc-600" />
                    <div>
                      <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">Orders</p>
                      <p className="text-sm font-black text-zinc-200">{customer.orders_count}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 p-4 rounded-2xl bg-white/[0.01]">
                    <Users size={18} className="text-zinc-600" />
                    <div>
                      <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">Joined</p>
                      <p className="text-sm font-black text-zinc-200">
                        {customer.joined_at ? format(new Date(customer.joined_at), 'dd MMM yyyy') : '—'}
                      </p>
                    </div>
                  </div>
                </div>

                <button className="w-full mt-6 py-4 rounded-2xl bg-white/5 text-zinc-500 font-black text-xs uppercase tracking-[0.2em] hover:bg-primary hover:text-white transition-all flex items-center justify-center gap-2">
                  View Profile Detail
                  <ChevronRight size={14} />
                </button>
              </motion.div>
            ))}
            {customers.length === 0 && (
              <div className="col-span-full py-20 text-center text-zinc-500 font-bold italic uppercase tracking-widest">
                No customers found matching your criteria
              </div>
            )}
          </>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-4">
          <p className="text-sm text-zinc-500">
            Showing <span className="text-zinc-300 font-bold">{((page - 1) * LIMIT) + 1}–{Math.min(page * LIMIT, total)}</span> of <span className="text-zinc-300 font-bold">{total.toLocaleString()}</span> customers
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-3 rounded-2xl bg-white/5 border border-white/10 text-zinc-400 hover:text-white hover:bg-white/10 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronLeft size={18} />
            </button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const pageNum = Math.max(1, Math.min(page - 2, totalPages - 4)) + i
              return (
                <button
                  key={pageNum}
                  onClick={() => setPage(pageNum)}
                  className={cn(
                    "w-10 h-10 rounded-xl text-sm font-black transition-all",
                    pageNum === page 
                      ? "bg-primary text-white shadow-lg shadow-primary/20" 
                      : "bg-white/5 border border-white/10 text-zinc-400 hover:text-white hover:bg-white/10"
                  )}
                >
                  {pageNum}
                </button>
              )
            })}
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-3 rounded-2xl bg-white/5 border border-white/10 text-zinc-400 hover:text-white hover:bg-white/10 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

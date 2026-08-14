import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Store, UserCircle2, XCircle, CheckCircle2, Clock } from 'lucide-react'
import { api } from '../lib/api'
import { cn } from '../lib/utils'

const statusStyle: Record<string, string> = {
  active: 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  pending: 'border border-amber-500/30 bg-amber-500/10 text-amber-300',
  revoked: 'border border-zinc-500/30 bg-zinc-500/10 text-zinc-400',
}
const roleStyle: Record<string, string> = {
  manager: 'text-sky-300',
  kasir: 'text-zinc-300',
  kitchen: 'text-violet-300',
}

export default function MerchantStaff() {
  const [merchantId, setMerchantId] = useState('')
  const [role, setRole] = useState('all')
  const [status, setStatus] = useState('all')

  const { data, isLoading } = useQuery({
    queryKey: ['admin-merchant-staff', merchantId, role, status],
    queryFn: async () => {
      const params: any = {}
      if (merchantId.trim()) params.merchant_id = merchantId.trim()
      if (role !== 'all') params.role = role
      if (status !== 'all') params.status = status
      const res = await api.get('/admin/merchant-staff', { params })
      return res.data
    }
  })

  const staff = data?.staff || []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-zinc-100">Oversight Staff Merchant</h1>
        <p className="mt-2 text-sm text-zinc-500">
          Pengawasan seluruh staff merchant lintas toko (akses super-admin).
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <label className="flex flex-col gap-1 text-xs font-bold uppercase tracking-[0.25em] text-zinc-500">
          Merchant ID
          <input
            value={merchantId}
            onChange={(e) => setMerchantId(e.target.value)}
            placeholder="kosongkan = semua"
            className="w-72 rounded-xl border border-white/10 bg-zinc-950/60 px-3 py-2 text-sm normal-case text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-bold uppercase tracking-[0.25em] text-zinc-500">
          Role
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="rounded-xl border border-white/10 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-100 focus:outline-none"
          >
            <option value="all">Semua</option>
            <option value="manager">Manager</option>
            <option value="kasir">Kasir</option>
            <option value="kitchen">Kitchen</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-bold uppercase tracking-[0.25em] text-zinc-500">
          Status
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-xl border border-white/10 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-100 focus:outline-none"
          >
            <option value="all">Semua</option>
            <option value="active">Active</option>
            <option value="pending">Pending</option>
            <option value="revoked">Revoked</option>
          </select>
        </label>
      </div>

      <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
        <p className="mb-3 text-sm font-bold text-zinc-100">{staff.length} staff</p>
        {isLoading ? (
          <p className="text-sm text-zinc-500">Loading...</p>
        ) : staff.length === 0 ? (
          <p className="text-sm text-zinc-500">Belum ada staff merchant (atau filter tidak cocok).</p>
        ) : (
          <div className="space-y-2">
            {staff.map((s: any) => (
              <div
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-zinc-950/50 p-4"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <UserCircle2 className="h-5 w-5 shrink-0 text-zinc-500" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-zinc-100">
                      {s.staff_name || s.staff_email || s.staff_phone || '(belum accept)'}
                    </p>
                    <p className="truncate text-xs text-zinc-500">
                      <Store className="mr-1 inline h-3 w-3" />
                      {s.merchant_name || s.merchant_id}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase">
                  <span className={cn('rounded-full px-2 py-1', roleStyle[s.role] || 'text-zinc-400')}>{s.role}</span>
                  <span className={cn('rounded-full px-2 py-1', statusStyle[s.status] || 'border border-white/10 text-zinc-500')}>
                    {s.status === 'active' && <CheckCircle2 className="mr-1 inline h-3 w-3" />}
                    {s.status === 'pending' && <Clock className="mr-1 inline h-3 w-3" />}
                    {s.status === 'revoked' && <XCircle className="mr-1 inline h-3 w-3" />}
                    {s.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

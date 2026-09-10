import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Store, UserCircle2 } from 'lucide-react'
import { api } from '../lib/api'
import { cn } from '../lib/utils'
import { StatusBadge } from '../components/StatusBadge'

const roleStyle: Record<string, string> = {
  manager: 'text-info',
  cashier: 'text-foreground-muted',
  kasir: 'text-foreground-muted',
  kitchen: 'text-info',
  marketing: 'text-warning',
  finance: 'text-success',
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
        <h1 className="text-3xl font-bold tracking-tight text-foreground-muted">Oversight Staff Merchant</h1>
        <p className="mt-2 text-sm text-foreground-muted">
          Pengawasan seluruh staff merchant lintas toko (akses super-admin).
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-4 rounded-2xl border border-border bg-surface/[0.03] p-4">
        <label className="flex flex-col gap-1 text-xs font-bold tracking-wide text-foreground-muted">
          Merchant ID
          <input
            value={merchantId}
            onChange={(e) => setMerchantId(e.target.value)}
            placeholder="kosongkan = semua"
            className="w-72 rounded-xl border border-border bg-surface-subtle px-3 py-2 text-sm normal-case text-foreground-muted placeholder:text-foreground-muted focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-bold tracking-wide text-foreground-muted">
          Role
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="rounded-xl border border-border bg-surface-subtle px-3 py-2 text-sm text-foreground-muted focus:outline-none"
          >
            <option value="all">Semua</option>
            <option value="manager">Manager</option>
            <option value="cashier">Cashier</option>
            <option value="kitchen">Kitchen</option>
            <option value="marketing">Marketing</option>
            <option value="finance">Finance</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-bold tracking-wide text-foreground-muted">
          Status
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-xl border border-border bg-surface-subtle px-3 py-2 text-sm text-foreground-muted focus:outline-none"
          >
            <option value="all">Semua</option>
            <option value="active">Active</option>
            <option value="pending">Pending</option>
            <option value="revoked">Revoked</option>
          </select>
        </label>
      </div>

      <div className="rounded-3xl border border-border bg-surface/[0.03] p-5">
        <p className="mb-3 text-sm font-bold text-foreground-muted">{staff.length} staff</p>
        {isLoading ? (
          <p className="text-sm text-foreground-muted">Loading...</p>
        ) : staff.length === 0 ? (
          <p className="text-sm text-foreground-muted">Belum ada staff merchant (atau filter tidak cocok).</p>
        ) : (
          <div className="space-y-2">
            {staff.map((s: any) => (
              <div
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface-subtle p-4"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <UserCircle2 className="h-5 w-5 shrink-0 text-foreground-muted" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-foreground-muted" title={s.staff_name || s.staff_email || s.staff_phone || '(belum accept)'}>
                      {s.staff_name || s.staff_email || s.staff_phone || '(belum accept)'}
                    </p>
                    <p className="truncate text-xs text-foreground-muted" title={s.merchant_name || s.merchant_id}>
                      <Store className="mr-1 inline h-3 w-3"  aria-hidden="true"/>
                      {s.merchant_name || s.merchant_id}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase">
                  <span className={cn('rounded-full px-2 py-1', roleStyle[s.role] || 'text-foreground-muted')}>{s.role}</span>
                  <StatusBadge status={s.status} labelPrefix="Staff status" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

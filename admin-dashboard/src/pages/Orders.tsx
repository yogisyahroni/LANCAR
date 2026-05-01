import ActiveOrdersTable from '../components/ActiveOrdersTable'

export default function Orders() {
  return (
    <div className="space-y-8 animate-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-zinc-100 tracking-tight">Orders Management</h1>
          <p className="text-zinc-500 mt-1">Manage and monitor all Lancar logistics orders</p>
        </div>
        <div className="flex gap-3">
          <button className="px-4 py-2 rounded-xl border border-white/10 text-sm font-medium hover:bg-white/5 transition-all">Export CSV</button>
          <button className="px-6 py-2 rounded-xl bg-primary text-white text-sm font-bold shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all">Create Manual Order</button>
        </div>
      </div>

      <div className="glass-card p-8 rounded-3xl">
        <ActiveOrdersTable />
      </div>
    </div>
  )
}

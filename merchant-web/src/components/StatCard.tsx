import type { LucideIcon } from 'lucide-react'

export default function StatCard({ icon: Icon, label, value, hint, accent }: {
  icon: LucideIcon
  label: string
  value: string
  hint?: string
  accent?: boolean
}) {
  return (
    <div className={`rounded-2xl border p-5 shadow-sm ${accent ? 'border-transparent bg-gradient-to-br from-emerald-900 to-emerald-950 text-white' : 'border-zinc-100 bg-white'}`}>
      <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${accent ? 'bg-white/10' : 'bg-emerald-900/5'}`}>
        <Icon className={`h-5 w-5 ${accent ? 'text-[#F97316]' : 'text-emerald-900'}`} />
      </div>
      <p className={`mt-3 text-sm font-semibold ${accent ? 'text-emerald-100/80' : 'text-zinc-500'}`}>{label}</p>
      <p className="mt-1 text-2xl font-black tracking-tight">{value}</p>
      {hint && <p className={`mt-1 text-xs ${accent ? 'text-emerald-100/60' : 'text-zinc-400'}`}>{hint}</p>}
    </div>
  )
}

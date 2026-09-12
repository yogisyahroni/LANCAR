import { useQuery } from '@tanstack/react-query'
import { Activity, Loader2 } from 'lucide-react'
import { api } from '../lib/api'

export default function CommunicationDeliveryHealth() {
  const health = useQuery({ queryKey: ['communication-delivery-health'], queryFn: async () => (await api.get('/admin/communications/delivery-health')).data?.data })
  return <div className="space-y-8 animate-in" aria-labelledby="communication-health-title"><header><h1 id="communication-health-title" className="text-3xl font-black text-foreground-muted tracking-tight italic uppercase">Communication Delivery Health</h1><p className="text-foreground-muted mt-1">Aggregate delivery health only; private inbox content is not exposed.</p></header>{health.isLoading ? <Loader2 className="animate-spin" aria-label="Loading delivery health" /> : <section className="glass-card p-6 rounded-3xl border-border"><div className="flex items-center gap-2 mb-5"><Activity size={18} aria-hidden="true" /><h2 className="font-black uppercase tracking-wide">Last 24 hours</h2></div><div className="grid gap-3 md:grid-cols-3">{health.data?.items?.map((item: any)=><div key={`${item.channel}-${item.status}`} className="rounded-2xl bg-surface-subtle p-4"><p className="text-xs uppercase text-foreground-muted">{item.channel}</p><p className="font-bold">{item.status}</p><p className="text-2xl font-black">{item.count}</p></div>)}{!health.data?.items?.length && <p className="text-sm text-foreground-muted">Belum ada delivery event pada window ini.</p>}</div></section>}</div>
}

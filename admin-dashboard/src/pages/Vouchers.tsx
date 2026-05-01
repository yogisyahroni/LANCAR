import { useState } from 'react'
import { motion } from 'framer-motion'
import { 
  Ticket, 
  Plus, 
  Search, 
  Filter, 
  Calendar, 
  Users, 
  TrendingUp,
  Clock
} from 'lucide-react'
import { cn } from '../lib/utils'

const initialVouchers = [
  {
    id: 'VOU-201',
    code: 'LANCARCEPAT',
    type: 'Percentage',
    value: '20%',
    minOrder: 'Rp 50,000',
    maxDiscount: 'Rp 15,000',
    usage: '1,240 / 5,000',
    expiry: '2024-12-31',
    status: 'Active'
  },
  {
    id: 'VOU-202',
    code: 'BARUPENGGUNA',
    type: 'Fixed',
    value: 'Rp 10,000',
    minOrder: 'Rp 20,000',
    maxDiscount: 'N/A',
    usage: '842 / 1,000',
    expiry: '2024-06-30',
    status: 'Active'
  },
  {
    id: 'VOU-203',
    code: 'RAMADANKAREEM',
    type: 'Percentage',
    value: '50%',
    minOrder: 'Rp 100,000',
    maxDiscount: 'Rp 50,000',
    usage: '5,000 / 5,000',
    expiry: '2024-04-10',
    status: 'Expired'
  }
]

export default function Vouchers() {
  const [vouchers] = useState(initialVouchers)

  return (
    <div className="space-y-8 animate-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-zinc-100 tracking-tight italic uppercase">Voucher Engine</h1>
          <p className="text-zinc-500 mt-1">Create and monitor promotional campaigns and discounts.</p>
        </div>
        <button className="px-6 py-3 rounded-2xl bg-primary text-white font-black text-sm uppercase tracking-widest hover:bg-primary-light shadow-lg shadow-primary/20 transition-all flex items-center gap-2">
          <Plus size={18} />
          Generate Voucher
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          { label: 'Active Vouchers', value: '12', icon: Ticket, color: 'text-emerald-400' },
          { label: 'Total Claims', value: '42,120', icon: Users, color: 'text-primary-light' },
          { label: 'Revenue Impact', value: 'Rp 124.5M', icon: TrendingUp, color: 'text-amber-400' },
        ].map((stat, i) => (
          <div key={i} className="glass-card p-8 rounded-[32px] border-white/5">
             <div className="flex items-center gap-4">
                <div className={cn("p-4 rounded-2xl bg-white/5", stat.color)}>
                   <stat.icon size={24} />
                </div>
                <div>
                   <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">{stat.label}</p>
                   <p className="text-2xl font-black text-zinc-100 mt-1 tracking-tighter">{stat.value}</p>
                </div>
             </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative w-full md:w-96 group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-600 group-focus-within:text-primary-light transition-colors" size={18} />
          <input 
            type="text" 
            placeholder="Search by code or name..."
            className="w-full bg-white/5 border border-white/10 rounded-2xl py-3.5 pl-12 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all placeholder:text-zinc-600"
          />
        </div>
        <div className="flex items-center gap-2">
           <button className="p-3.5 rounded-2xl bg-white/5 text-zinc-500 hover:text-white border border-white/10 transition-all">
              <Filter size={20} />
           </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {vouchers.map((voucher, i) => (
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.1 }}
            key={voucher.id}
            className="glass-card p-8 rounded-[40px] border-white/5 group hover:border-white/10 transition-all overflow-hidden relative"
          >
            {/* Background Pattern */}
            <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
               <Ticket size={120} />
            </div>

            <div className="flex items-start justify-between relative z-10">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="px-4 py-2 rounded-xl bg-primary/10 border border-primary/20 text-primary-light font-black text-lg tracking-wider">
                    {voucher.code}
                  </div>
                  <span className={cn(
                    "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest",
                    voucher.status === 'Active' ? "bg-emerald-500/10 text-emerald-400" : "bg-zinc-800 text-zinc-600"
                  )}>
                    {voucher.status}
                  </span>
                </div>
                <div>
                   <p className="text-sm font-medium text-zinc-400">Discount: <span className="text-zinc-100 font-bold">{voucher.value}</span></p>
                   <p className="text-[10px] text-zinc-500 mt-1 italic">Min. Order {voucher.minOrder} • Max. {voucher.maxDiscount}</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mt-8 pt-8 border-t border-white/5 relative z-10">
               <div className="space-y-1">
                  <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest flex items-center gap-2">
                     <TrendingUp size={12} /> Usage
                  </p>
                  <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden mt-2">
                     <div 
                        className="h-full bg-primary rounded-full transition-all" 
                        style={{ width: `${(parseInt(voucher.usage.split(' / ')[0].replace(/,/g, '')) / parseInt(voucher.usage.split(' / ')[1].replace(/,/g, ''))) * 100}%` }} 
                     />
                  </div>
                  <p className="text-xs font-bold text-zinc-400 mt-2">{voucher.usage}</p>
               </div>
               <div className="space-y-1">
                  <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest flex items-center gap-2">
                     <Calendar size={12} /> Expiry
                  </p>
                  <p className="text-xs font-bold text-zinc-200 mt-2">{voucher.expiry}</p>
                  <div className="flex items-center gap-1.5 mt-1">
                     <Clock size={10} className="text-zinc-600" />
                     <p className="text-[10px] text-zinc-500 font-medium">Valid for 142 days more</p>
                  </div>
               </div>
            </div>

            <div className="flex items-center gap-3 mt-8 relative z-10">
               <button className="flex-1 py-4 rounded-2xl bg-white/5 text-zinc-500 font-black text-xs uppercase tracking-widest hover:bg-primary hover:text-white transition-all">
                  Edit Details
               </button>
               <button className="p-4 rounded-2xl bg-red-500/5 border border-red-500/10 text-red-500/40 hover:bg-red-500 hover:text-white transition-all">
                  <Trash2 size={18} />
               </button>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  )
}

function Trash2(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
      <line x1="10" x2="10" y1="11" y2="17" />
      <line x1="14" x2="14" y1="11" y2="17" />
    </svg>
  )
}

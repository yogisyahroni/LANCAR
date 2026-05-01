import { useState } from 'react'
import { motion } from 'framer-motion'
import { 
  Users, 
  Search, 
  Filter, 
  ShoppingBag, 
  CreditCard, 
  Mail, 
  ChevronRight,
  TrendingUp,
  Building2
} from 'lucide-react'
import { cn } from '../lib/utils'

const customers = [
  { 
    id: 'CST-4001', 
    name: 'Budi Santoso', 
    type: 'Personal',
    email: 'budi.s@gmail.com',
    phone: '+62 812-3344-5566',
    orders: 42,
    wallet: 'Rp 250,000',
    joinedAt: '12 Jan 2024',
    status: 'Active'
  },
  { 
    id: 'CST-4002', 
    name: 'Warung Makan Bahari', 
    type: 'UMKM',
    email: 'info@bahari.id',
    phone: '+62 811-2233-4455',
    orders: 156,
    wallet: 'Rp 1,200,000',
    joinedAt: '5 Feb 2024',
    status: 'Active'
  },
  { 
    id: 'CST-4003', 
    name: 'Siti Kholifah', 
    type: 'Personal',
    email: 'siti.k@yahoo.com',
    phone: '+62 813-4455-6677',
    orders: 8,
    wallet: 'Rp 45,000',
    joinedAt: '20 Mar 2024',
    status: 'Inactive'
  },
]

export default function Customers() {
  const [search, setSearch] = useState('')

  return (
    <div className="space-y-8 animate-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold text-zinc-100 tracking-tight">Customer Directory</h1>
          <p className="text-zinc-500 mt-1">Manage personal and UMKM accounts, view order history and wallets.</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="px-6 py-3 rounded-2xl bg-white/5 border border-white/10 text-zinc-300 font-black text-sm uppercase tracking-widest hover:bg-white/10 transition-all flex items-center gap-2">
            <Mail size={18} />
            Bulk Email
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          { label: 'Total Customers', value: '8,432', icon: Users, color: 'text-zinc-400' },
          { label: 'UMKM Partners', value: '412', icon: Building2, color: 'text-primary-light' },
          { label: 'Total Revenue', value: 'Rp 842.5M', icon: TrendingUp, color: 'text-emerald-400' },
        ].map((stat, i) => (
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

      <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative w-full md:w-96 group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-600 group-focus-within:text-primary-light transition-colors" size={18} />
          <input 
            type="text" 
            placeholder="Search by name, email, or ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
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
        {customers.map((customer, i) => (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            key={customer.id}
            className="glass-card p-8 rounded-[40px] border-white/5 hover:border-white/10 transition-all group"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-6">
                <div className="h-16 w-16 rounded-[24px] bg-zinc-900 border border-white/10 flex items-center justify-center text-2xl font-black text-zinc-700 uppercase group-hover:bg-primary group-hover:text-white group-hover:border-primary/20 transition-all">
                  {customer.name.charAt(0)}
                </div>
                <div>
                  <div className="flex items-center gap-3">
                    <h3 className="text-xl font-bold text-zinc-100">{customer.name}</h3>
                    <span className={cn(
                      "px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-widest border",
                      customer.type === 'UMKM' ? "border-primary-light/20 text-primary-light bg-primary-light/5" : "border-zinc-700 text-zinc-500 bg-white/5"
                    )}>
                      {customer.type}
                    </span>
                  </div>
                  <p className="text-sm text-zinc-500 mt-1">{customer.email}</p>
                </div>
              </div>
              <span className={cn(
                "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest",
                customer.status === 'Active' ? "bg-emerald-500/10 text-emerald-400" : "bg-zinc-800 text-zinc-600"
              )}>
                {customer.status}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4 mt-8 pt-8 border-t border-white/5">
               <div className="flex items-center gap-4 p-4 rounded-2xl bg-white/[0.01]">
                  <ShoppingBag size={18} className="text-zinc-600" />
                  <div>
                     <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">Orders</p>
                     <p className="text-sm font-black text-zinc-200">{customer.orders}</p>
                  </div>
               </div>
               <div className="flex items-center gap-4 p-4 rounded-2xl bg-white/[0.01]">
                  <CreditCard size={18} className="text-zinc-600" />
                  <div>
                     <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">Wallet</p>
                     <p className="text-sm font-black text-zinc-200">{customer.wallet}</p>
                  </div>
               </div>
            </div>

            <button className="w-full mt-6 py-4 rounded-2xl bg-white/5 text-zinc-500 font-black text-xs uppercase tracking-[0.2em] hover:bg-primary hover:text-white transition-all flex items-center justify-center gap-2">
               View Profile Detail
               <ChevronRight size={14} />
            </button>
          </motion.div>
        ))}
      </div>
    </div>
  )
}

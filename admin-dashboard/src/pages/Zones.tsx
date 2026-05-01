import { useState } from 'react'
import { motion } from 'framer-motion'
import { 
  Map as MapIcon, 
  Plus, 
  Layers,
  ChevronRight,
  Search,
  Navigation
} from 'lucide-react'

const initialZones = [
  {
    id: 'ZONE-101',
    name: 'Jakarta Pusat Core',
    color: '#006437',
    meetingPoints: 12,
    activeOrders: 45,
    status: 'Active'
  },
  {
    id: 'ZONE-102',
    name: 'SCBD / Senopati',
    color: '#34d399',
    meetingPoints: 8,
    activeOrders: 120,
    status: 'Active'
  },
  {
    id: 'ZONE-103',
    name: 'Kelapa Gading Prime',
    color: '#10b981',
    meetingPoints: 15,
    activeOrders: 62,
    status: 'Active'
  }
]

export default function Zones() {
  const [zones] = useState(initialZones)

  return (
    <div className="space-y-8 animate-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-zinc-100 tracking-tight italic uppercase">Zone Management</h1>
          <p className="text-zinc-500 mt-1">Define operational boundaries and manage meeting points.</p>
        </div>
        <button className="px-6 py-3 rounded-2xl bg-primary text-white font-black text-sm uppercase tracking-widest hover:bg-primary-light shadow-lg shadow-primary/20 transition-all flex items-center gap-2">
          <Plus size={18} />
          Create New Zone
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left: Zone List */}
        <div className="lg:col-span-4 space-y-4">
          <div className="relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-600 group-focus-within:text-primary-light transition-colors" size={18} />
            <input 
              type="text" 
              placeholder="Search zones..."
              className="w-full bg-white/5 border border-white/10 rounded-2xl py-3.5 pl-12 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all placeholder:text-zinc-600"
            />
          </div>

          <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
            {zones.map((zone) => (
              <motion.div 
                key={zone.id}
                whileHover={{ x: 4 }}
                className="glass-card p-6 rounded-3xl border-white/5 hover:border-white/10 cursor-pointer transition-all group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="h-3 w-3 rounded-full" style={{ backgroundColor: zone.color }} />
                    <div>
                      <h3 className="font-bold text-zinc-100">{zone.name}</h3>
                      <p className="text-[10px] text-zinc-500 font-black uppercase tracking-widest">{zone.id}</p>
                    </div>
                  </div>
                  <ChevronRight size={16} className="text-zinc-700 group-hover:text-primary-light transition-colors" />
                </div>
                <div className="grid grid-cols-2 gap-4 mt-6">
                   <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                      <p className="text-[9px] font-black text-zinc-600 uppercase tracking-widest">Meeting Points</p>
                      <p className="text-sm font-black text-zinc-200 mt-1">{zone.meetingPoints}</p>
                   </div>
                   <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                      <p className="text-[9px] font-black text-zinc-600 uppercase tracking-widest">Live Orders</p>
                      <p className="text-sm font-black text-zinc-200 mt-1">{zone.activeOrders}</p>
                   </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Right: Map Area */}
        <div className="lg:col-span-8 glass-card rounded-[48px] border-white/5 overflow-hidden relative min-h-[600px]">
           {/* Map Placeholder with UI overlays */}
           <div className="absolute inset-0 bg-[#09090b] flex flex-col items-center justify-center border border-white/5">
              <MapIcon size={64} className="text-zinc-800 mb-4 animate-pulse" />
              <p className="text-zinc-500 font-medium">Map Engine Loading...</p>
              <div className="mt-8 flex gap-3">
                 <div className="px-4 py-2 rounded-full bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest text-zinc-500">
                    Press <span className="text-primary-light">D</span> to Draw
                 </div>
                 <div className="px-4 py-2 rounded-full bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest text-zinc-500">
                    Press <span className="text-primary-light">M</span> for Point
                 </div>
              </div>
           </div>

           {/* Toolbar Overlays */}
           <div className="absolute top-8 right-8 flex flex-col gap-3">
              <button className="p-4 rounded-2xl bg-black/60 backdrop-blur-xl border border-white/10 text-white hover:bg-primary transition-all shadow-2xl">
                 <Layers size={20} />
              </button>
              <button className="p-4 rounded-2xl bg-black/60 backdrop-blur-xl border border-white/10 text-white hover:bg-primary transition-all shadow-2xl">
                 <Navigation size={20} />
              </button>
           </div>

           <div className="absolute bottom-8 left-8 right-8">
              <div className="p-6 rounded-[32px] bg-black/60 backdrop-blur-3xl border border-white/10 flex items-center justify-between">
                 <div className="flex items-center gap-6">
                    <div className="flex items-center gap-3">
                       <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                       <p className="text-xs font-black text-zinc-300 uppercase tracking-widest">Jakarta Pusat Core</p>
                    </div>
                    <div className="h-4 w-px bg-white/10" />
                    <p className="text-[10px] text-zinc-500 font-medium italic">Poly: 42.129, 106.845 ... 42.150, 106.860</p>
                 </div>
                 <div className="flex items-center gap-3">
                    <button className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-zinc-400 hover:text-white text-[10px] font-black uppercase tracking-widest transition-all">
                       Edit Shape
                    </button>
                    <button className="px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500 hover:text-white text-[10px] font-black uppercase tracking-widest transition-all">
                       Delete Zone
                    </button>
                 </div>
              </div>
           </div>
        </div>
      </div>
    </div>
  )
}

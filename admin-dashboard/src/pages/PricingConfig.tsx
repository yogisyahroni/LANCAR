import { useState } from 'react'
import { 
  Settings, 
  TrendingUp, 
  Zap, 
  CloudRain, 
  Clock, 
  Map, 
  Save, 
  Info,
  ChevronRight,
  Plus
} from 'lucide-react'
import { 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts'
import { cn } from '../lib/utils'

const simulationData = [
  { distance: 0, price: 15000 },
  { distance: 2, price: 19000 },
  { distance: 5, price: 25000 },
  { distance: 8, price: 31000 },
  { distance: 10, price: 35000 },
  { distance: 15, price: 45000 },
  { distance: 20, price: 55000 },
]

export default function PricingConfig() {
  const [baseFare, setBaseFare] = useState(15000)
  const [perKm, setPerKm] = useState(2000)
  const [activeTab, setActiveTab] = useState('Standard')

  return (
    <div className="space-y-8 animate-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold text-zinc-100 tracking-tight">Pricing Configuration</h1>
          <p className="text-zinc-500 mt-1">Configure base rates, surge multipliers, and dynamic pricing rules.</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="px-8 py-3 rounded-2xl bg-zinc-800 text-zinc-400 font-black text-sm uppercase tracking-widest hover:text-white transition-all">
            Discard
          </button>
          <button className="px-8 py-3 rounded-2xl bg-primary text-white font-black text-sm uppercase tracking-widest shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center gap-2">
            <Save size={18} />
            Save Changes
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Editor */}
        <div className="lg:col-span-2 space-y-8">
          <div className="glass-card p-10 rounded-[48px] border-white/5 space-y-10">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-black text-zinc-100 flex items-center gap-3 tracking-tight">
                <Settings className="text-primary-light" size={24} />
                Global Fare Rules
              </h2>
              <div className="flex gap-2">
                {['Standard', 'Relay', 'Express'].map(t => (
                  <button 
                    key={t}
                    onClick={() => setActiveTab(t)}
                    className={cn(
                      "px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all",
                      activeTab === t ? "bg-primary/20 text-primary-light border border-primary/20" : "text-zinc-600 hover:text-zinc-400"
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
              <div className="space-y-4">
                <label className="text-xs font-black text-zinc-600 uppercase tracking-widest">Base Fare (Rp)</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 font-bold">Rp</span>
                  <input 
                    type="number" 
                    value={baseFare}
                    onChange={(e) => setBaseFare(Number(e.target.value))}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-zinc-100 font-black focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                  />
                </div>
                <p className="text-[10px] text-zinc-600 font-bold italic">Applied to the first 2.0 km of any delivery.</p>
              </div>

              <div className="space-y-4">
                <label className="text-xs font-black text-zinc-600 uppercase tracking-widest">Distance Rate (Rp/km)</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 font-bold">Rp</span>
                  <input 
                    type="number" 
                    value={perKm}
                    onChange={(e) => setPerKm(Number(e.target.value))}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-zinc-100 font-black focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                  />
                </div>
                <p className="text-[10px] text-zinc-600 font-bold italic">Incremental rate added after base distance.</p>
              </div>
            </div>

            <div className="pt-10 border-t border-white/5 space-y-8">
              <h3 className="text-lg font-black text-zinc-100 flex items-center gap-3">
                <Zap className="text-amber-400" size={20} />
                Dynamic Surge Triggers
              </h3>
              
              <div className="space-y-6">
                {[
                  { icon: Clock, label: 'Peak Hour Surge', desc: 'Auto-apply 1.5x during 16:00 - 19:00', active: true },
                  { icon: CloudRain, label: 'Weather Surge', desc: 'Apply 1.2x when rainfall exceeds 5mm/h', active: true },
                  { icon: TrendingUp, label: 'High Demand Surge', desc: 'Apply 1.3x if pending orders > 50 in zone', active: false },
                ].map((rule, i) => (
                  <div key={i} className="flex items-center justify-between p-6 rounded-3xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] transition-all group">
                    <div className="flex items-center gap-4">
                      <div className={cn("p-3 rounded-2xl bg-white/5", rule.active ? "text-primary-light" : "text-zinc-600")}>
                        <rule.icon size={20} />
                      </div>
                      <div>
                        <p className="text-sm font-black text-zinc-200">{rule.label}</p>
                        <p className="text-xs text-zinc-600 font-medium">{rule.desc}</p>
                      </div>
                    </div>
                    <button className={cn(
                      "w-12 h-6 rounded-full relative transition-all duration-300",
                      rule.active ? "bg-primary" : "bg-zinc-800"
                    )}>
                      <div className={cn(
                        "absolute top-1 w-4 h-4 rounded-full bg-white transition-all duration-300",
                        rule.active ? "right-1" : "left-1"
                      )} />
                    </button>
                  </div>
                ))}
              </div>
              
              <button className="w-full py-4 rounded-2xl border border-dashed border-white/10 text-zinc-600 hover:text-zinc-400 hover:border-white/20 transition-all flex items-center justify-center gap-2 text-xs font-black uppercase tracking-widest">
                <Plus size={16} />
                Add New Trigger Rule
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Preview & Analytics */}
        <div className="space-y-8">
          <div className="glass-card p-8 rounded-[40px] border-white/5 space-y-6">
            <p className="text-xs font-black text-zinc-600 uppercase tracking-widest flex items-center gap-2">
              <TrendingUp size={14} />
              Pricing Simulation
            </p>
            <div className="h-[240px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={simulationData}>
                  <defs>
                    <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#006437" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#006437" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                  <XAxis 
                    dataKey="distance" 
                    stroke="#52525b" 
                    fontSize={10} 
                    tickLine={false} 
                    axisLine={false}
                    tickFormatter={(val) => `${val}km`}
                  />
                  <YAxis 
                    stroke="#52525b" 
                    fontSize={10} 
                    tickLine={false} 
                    axisLine={false}
                    tickFormatter={(val) => `Rp${val/1000}k`}
                  />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#09090b', borderColor: '#27272a', borderRadius: '12px' }}
                    itemStyle={{ color: '#006437', fontWeight: 'bold' }}
                  />
                  <Area type="monotone" dataKey="price" stroke="#006437" strokeWidth={3} fillOpacity={1} fill="url(#colorPrice)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="p-6 rounded-2xl bg-primary/5 border border-primary/10">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/20 text-primary-light">
                  <Info size={16} />
                </div>
                <p className="text-xs text-zinc-400 leading-relaxed italic font-medium">
                  At current settings, a <span className="text-primary-light font-bold">10km</span> delivery will cost <span className="text-zinc-100 font-bold">Rp 35,000</span> (Standard).
                </p>
              </div>
            </div>
          </div>

          <div className="glass-card p-8 rounded-[40px] border-white/5 space-y-6">
             <p className="text-xs font-black text-zinc-600 uppercase tracking-widest">Pricing Strategy Health</p>
             <div className="space-y-6">
                <div>
                   <div className="flex justify-between items-center mb-2">
                      <span className="text-xs text-zinc-400 font-bold">Gross Margin</span>
                      <span className="text-xs text-emerald-400 font-black">22.4%</span>
                   </div>
                   <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded-full" style={{ width: '22.4%' }} />
                   </div>
                </div>
                <div>
                   <div className="flex justify-between items-center mb-2">
                      <span className="text-xs text-zinc-400 font-bold">Courier Take-Home</span>
                      <span className="text-xs text-primary-light font-black">78.0%</span>
                   </div>
                   <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full" style={{ width: '78%' }} />
                   </div>
                </div>
             </div>
          </div>

          <button className="w-full group p-6 rounded-[32px] bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] transition-all text-left">
             <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                   <div className="p-3 rounded-2xl bg-white/5 text-zinc-400 group-hover:text-primary-light transition-colors">
                      <Map size={20} />
                   </div>
                   <div>
                      <p className="text-sm font-black text-zinc-200">Zonal Pricing</p>
                      <p className="text-xs text-zinc-600">Configure rates per specific zone</p>
                   </div>
                </div>
                <ChevronRight size={18} className="text-zinc-700 group-hover:text-zinc-400 transition-colors" />
             </div>
          </button>
        </div>
      </div>
    </div>
  )
}

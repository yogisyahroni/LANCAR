import { useState } from 'react'
import { motion } from 'framer-motion'
import { 
  Clock, 
  Save, 
  RotateCcw, 
  ShieldAlert, 
  Zap, 
  Target,
  Timer
} from 'lucide-react'
import { cn } from '../lib/utils'

export default function SLAConfig() {
  const [activeModel, setActiveModel] = useState('3-Leg')

  return (
    <div className="space-y-8 animate-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-zinc-100 tracking-tight italic uppercase">SLA Thresholds</h1>
          <p className="text-zinc-500 mt-1">Configure service level agreements and automated alert triggers.</p>
        </div>
        <div className="flex items-center gap-3">
           <button className="p-3 rounded-xl bg-white/5 text-zinc-500 hover:text-white transition-all">
              <RotateCcw size={18} />
           </button>
           <button className="flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-white font-black text-xs uppercase tracking-widest hover:bg-primary-light shadow-lg shadow-primary/20 transition-all">
              <Save size={18} />
              Deploy Config
           </button>
        </div>
      </div>

      <div className="flex bg-white/5 p-1 rounded-2xl border border-white/10 w-fit">
        {['P2P', '2-Leg', '3-Leg'].map(model => (
          <button 
            key={model}
            onClick={() => setActiveModel(model)}
            className={cn(
              "px-8 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all",
              activeModel === model ? "bg-primary text-white shadow-lg" : "text-zinc-600 hover:text-zinc-300"
            )}
          >
            {model} Model
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left: SLA Stages */}
        <div className="lg:col-span-8 space-y-6">
           {[
             { stage: 'Pickup Window', target: '15m', critical: '25m', description: 'Time from assignment to courier pickup at origin.' },
             { stage: 'Leg 1 (Origin to Relay)', target: '45m', critical: '60m', description: 'Maximum travel time for the first courier.' },
             { stage: 'Relay Processing', target: '10m', critical: '20m', description: 'Time for package handoff and second courier assignment.' },
             { stage: 'Final Leg Delivery', target: '30m', critical: '45m', description: 'Time from relay pickup to final customer delivery.' },
           ].map((item, i) => (
             <motion.div 
               key={i}
               initial={{ opacity: 0, y: 10 }}
               animate={{ opacity: 1, y: 0 }}
               transition={{ delay: i * 0.1 }}
               className="glass-card p-8 rounded-[40px] border-white/5 hover:border-white/10 transition-all group"
             >
               <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                  <div className="space-y-2">
                     <h3 className="text-xl font-black text-zinc-100 flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-white/5 text-primary-light">
                           <Timer size={20} />
                        </div>
                        {item.stage}
                     </h3>
                     <p className="text-sm text-zinc-500 max-w-md">{item.description}</p>
                  </div>
                  <div className="flex items-center gap-4">
                     <div className="space-y-2">
                        <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">Target (Soft)</label>
                        <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-xl px-4 py-3">
                           <input type="text" defaultValue={item.target} className="bg-transparent w-12 text-sm font-bold text-zinc-100 focus:outline-none" />
                           <Clock size={14} className="text-zinc-600" />
                        </div>
                     </div>
                     <div className="space-y-2">
                        <label className="text-[10px] font-black text-red-500/60 uppercase tracking-widest">Critical (Hard)</label>
                        <div className="flex items-center gap-3 bg-red-500/5 border border-red-500/10 rounded-xl px-4 py-3">
                           <input type="text" defaultValue={item.critical} className="bg-transparent w-12 text-sm font-bold text-red-400 focus:outline-none" />
                           <ShieldAlert size={14} className="text-red-500/40" />
                        </div>
                     </div>
                  </div>
               </div>
             </motion.div>
           ))}
        </div>

        {/* Right: Automation Settings */}
        <div className="lg:col-span-4 space-y-8">
           <div className="glass-card p-10 rounded-[48px] border-white/5 space-y-8">
              <h3 className="text-xl font-black text-zinc-100 flex items-center gap-3">
                 <Zap className="text-amber-400" size={24} />
                 Auto-Assignment
              </h3>
              <div className="space-y-6">
                 <div className="space-y-4">
                    <div className="flex items-center justify-between">
                       <p className="text-xs font-bold text-zinc-400">Min. Confidence Score</p>
                       <p className="text-xs font-black text-primary-light">85%</p>
                    </div>
                    <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                       <div className="h-full bg-primary w-[85%] rounded-full" />
                    </div>
                    <p className="text-[10px] text-zinc-600 italic">Couriers with lower scores will require manual approval.</p>
                 </div>

                 <div className="space-y-4">
                    <div className="flex items-center justify-between">
                       <p className="text-xs font-bold text-zinc-400">Assignment Radius</p>
                       <p className="text-xs font-black text-primary-light">3.5 KM</p>
                    </div>
                    <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                       <div className="h-full bg-primary w-[60%] rounded-full" />
                    </div>
                 </div>
              </div>
           </div>

           <div className="glass-card p-10 rounded-[48px] border-emerald-500/10 bg-emerald-500/[0.02] space-y-6">
              <div className="flex items-center gap-3 text-emerald-400">
                 <Target size={20} />
                 <h4 className="font-black text-xs uppercase tracking-widest">Optimized Mode</h4>
              </div>
              <p className="text-xs text-zinc-500 leading-relaxed">
                 Settings currently aligned with <span className="text-zinc-200 font-bold">Peak Hour Strategy</span>. 
                 SLA targets are automatically extended by 15% during heavy rain or demand spikes.
              </p>
              <button className="w-full py-4 rounded-2xl bg-white/5 border border-white/10 text-zinc-400 hover:text-white text-[10px] font-black uppercase tracking-widest transition-all">
                 Review Peak Rules
              </button>
           </div>
        </div>
      </div>
    </div>
  )
}

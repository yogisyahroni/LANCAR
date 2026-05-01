import { useState } from 'react'
import { motion } from 'framer-motion'
import { 
  Clock, 
  Save, 
  RotateCcw, 
  ShieldAlert, 
  Zap, 
  Target,
  Timer,
  Loader2
} from 'lucide-react'
import { cn } from '../lib/utils'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { toast } from 'sonner'

export default function SLAConfig() {
  const queryClient = useQueryClient();
  const [activeModel, setActiveModel] = useState('3-Leg')

  const { data: configs, isLoading } = useQuery({
    queryKey: ['sla', activeModel],
    queryFn: async () => {
      const res = await api.get(`/admin/sla?model_type=${activeModel}`);
      return res.data;
    }
  });

  const updateMutation = useMutation({
    mutationFn: async (updatedStage: any) => {
      const res = await api.put('/admin/sla', updatedStage);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sla', activeModel] });
      toast.success('SLA threshold updated successfully');
    }
  });

  if (isLoading) {
    return (
      <div className="h-[80vh] flex items-center justify-center">
        <Loader2 className="w-12 h-12 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-zinc-100 tracking-tight italic uppercase">SLA Thresholds</h1>
          <p className="text-zinc-500 mt-1">Configure service level agreements and automated alert triggers.</p>
        </div>
        <div className="flex items-center gap-3">
           <button 
             onClick={() => queryClient.invalidateQueries({ queryKey: ['sla', activeModel] })}
             className="p-3 rounded-xl bg-white/5 text-zinc-500 hover:text-white transition-all"
           >
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
           {configs?.map((item: any, i: number) => (
             <motion.div 
               key={item.id}
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
                        {item.stage_name}
                     </h3>
                     <p className="text-sm text-zinc-500 max-w-md">{item.description}</p>
                  </div>
                  <div className="flex items-center gap-4">
                     <div className="space-y-2">
                        <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">Target (Soft)</label>
                        <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-xl px-4 py-3">
                           <input 
                             type="number" 
                             defaultValue={item.target_minutes} 
                             onBlur={(e) => updateMutation.mutate({ id: item.id, target_minutes: Number(e.target.value), critical_minutes: item.critical_minutes })}
                             className="bg-transparent w-12 text-sm font-bold text-zinc-100 focus:outline-none" 
                           />
                           <span className="text-[10px] text-zinc-600 font-bold uppercase">Min</span>
                           <Clock size={14} className="text-zinc-600" />
                        </div>
                     </div>
                     <div className="space-y-2">
                        <label className="text-[10px] font-black text-red-500/60 uppercase tracking-widest">Critical (Hard)</label>
                        <div className="flex items-center gap-3 bg-red-500/5 border border-red-500/10 rounded-xl px-4 py-3">
                           <input 
                             type="number" 
                             defaultValue={item.critical_minutes} 
                             onBlur={(e) => updateMutation.mutate({ id: item.id, critical_minutes: Number(e.target.value), target_minutes: item.target_minutes })}
                             className="bg-transparent w-12 text-sm font-bold text-red-400 focus:outline-none" 
                           />
                           <span className="text-[10px] text-red-500/40 font-bold uppercase">Min</span>
                           <ShieldAlert size={14} className="text-red-500/40" />
                        </div>
                     </div>
                  </div>
               </div>
             </motion.div>
           ))}
           {(!configs || configs.length === 0) && (
             <div className="py-20 text-center text-zinc-500 font-bold italic uppercase tracking-widest italic">
               No SLA configurations found for this model
             </div>
           )}
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

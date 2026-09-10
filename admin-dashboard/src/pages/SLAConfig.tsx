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
import { AdminPageSkeleton } from '../components/ui/Skeleton'
import { toast } from 'sonner'

export default function SLAConfig() {
  const queryClient = useQueryClient();
  const [activeModel, setActiveModel] = useState('p2p')

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
    return <AdminPageSkeleton />;
  }

  return (
    <div className="space-y-8 animate-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-foreground-muted tracking-tight italic uppercase">SLA Thresholds</h1>
          <p className="text-foreground-muted mt-1">Configure service level agreements and automated alert triggers.</p>
        </div>
        <div className="flex items-center gap-3">
           <button 
             type="button"
             onClick={() => queryClient.invalidateQueries({ queryKey: ['sla', activeModel] })}
             aria-label="Refresh SLA thresholds"
             title="Refresh SLA thresholds"
             className="p-3 rounded-xl bg-surface-subtle text-foreground-muted hover:text-foreground transition-all"
           >
              <RotateCcw size={18} aria-hidden="true" />
           </button>
           <button className="flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-on-primary font-black text-xs uppercase tracking-widest hover:bg-primary-light shadow-lg shadow-primary/20 transition-all">
              <Save size={18} aria-hidden="true" />
              Deploy Config
           </button>
        </div>
      </div>

      <div className="flex bg-surface-subtle p-1 rounded-2xl border border-border w-fit">
        {['p2p'].map(model => (
          <button 
            key={model}
            onClick={() => setActiveModel(model)}
            className={cn(
              "px-8 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all",
              activeModel === model ? "bg-primary text-on-primary shadow-lg" : "text-foreground-muted hover:text-foreground-muted"
            )}
          >
            P2P Model
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
               className="glass-card p-8 rounded-[40px] border-border hover:border-border transition-all group"
             >
               <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                  <div className="space-y-2">
                     <h3 className="text-xl font-black text-foreground-muted flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-surface-subtle text-primary-light">
                           <Timer size={20} aria-hidden="true" />
                        </div>
                        {item.stage_name}
                     </h3>
                     <p className="text-sm text-foreground-muted max-w-md">{item.description}</p>
                  </div>
                  <div className="flex items-center gap-4">
                     <div className="space-y-2">
                        <label className="text-xs font-bold text-foreground-muted tracking-wide">Target (Soft)</label>
                        <div className="flex items-center gap-3 bg-surface-subtle border border-border rounded-xl px-4 py-3">
                           <input 
                             type="number" 
                             defaultValue={item.target_minutes} 
                             onBlur={(e) => {
                               const val = Number(e.target.value);
                               if (!isNaN(val)) updateMutation.mutate({ id: item.id, target_minutes: val, critical_minutes: item.critical_minutes });
                             }}
                             className="bg-transparent w-12 text-sm font-bold text-foreground-muted focus:outline-none"
                           />
                           <span className="text-[10px] text-foreground-muted font-bold uppercase">Min</span>
                           <Clock size={14} className="text-foreground-muted"  aria-hidden="true"/>
                        </div>
                     </div>
                     <div className="space-y-2">
                        <label className="text-xs font-bold text-error tracking-wide">Critical (Hard)</label>
                        <div className="flex items-center gap-3 bg-error-surface border border-error rounded-xl px-4 py-3">
                           <input 
                             type="number" 
                             defaultValue={item.critical_minutes} 
                             onBlur={(e) => {
                               const val = Number(e.target.value);
                               if (!isNaN(val)) updateMutation.mutate({ id: item.id, critical_minutes: val, target_minutes: item.target_minutes });
                             }}
                             className="bg-transparent w-12 text-sm font-bold text-error focus:outline-none"
                           />
                           <span className="text-[10px] text-error font-bold uppercase">Min</span>
                           <ShieldAlert size={14} className="text-error" aria-hidden="true" />
                        </div>
                     </div>
                  </div>
               </div>
             </motion.div>
           ))}
           {(!configs || configs.length === 0) && (
             <div className="py-20 text-center text-foreground-muted font-bold italic uppercase tracking-widest italic">
               No SLA configurations found for this model
             </div>
           )}
        </div>

        {/* Right: Automation Settings */}
        <div className="lg:col-span-4 space-y-8">
           <div className="glass-card p-10 rounded-[48px] border-border space-y-8">
              <h3 className="text-xl font-black text-foreground-muted flex items-center gap-3">
                 <Zap className="text-warning" size={24} aria-hidden="true" />
                 Auto-Assignment
              </h3>
              <div className="space-y-6">
                 <div className="space-y-4">
                    <div className="flex items-center justify-between">
                       <p className="text-xs font-bold text-foreground-muted">Min. Confidence Score</p>
                       <p className="text-xs font-black text-primary-light">85%</p>
                    </div>
                    <div className="h-1.5 bg-surface-subtle rounded-full overflow-hidden">
                       <div className="h-full bg-primary w-[85%] rounded-full" />
                    </div>
                    <p className="text-[10px] text-foreground-muted italic">Couriers with lower scores will require manual approval.</p>
                 </div>

                 <div className="space-y-4">
                    <div className="flex items-center justify-between">
                       <p className="text-xs font-bold text-foreground-muted">Assignment Radius</p>
                       <p className="text-xs font-black text-primary-light">3.5 KM</p>
                    </div>
                    <div className="h-1.5 bg-surface-subtle rounded-full overflow-hidden">
                       <div className="h-full bg-primary w-[60%] rounded-full" />
                    </div>
                 </div>
              </div>
           </div>

           <div className="glass-card p-10 rounded-[48px] border-success bg-success/[0.02] space-y-6">
              <div className="flex items-center gap-3 text-success">
                 <Target size={20} aria-hidden="true" />
                 <h4 className="font-black text-xs uppercase tracking-widest">Optimized Mode</h4>
              </div>
              <p className="text-xs text-foreground-muted leading-relaxed">
                 Settings currently aligned with <span className="text-foreground-muted font-bold">Peak Hour Strategy</span>.
                 SLA targets are automatically extended by 15% during heavy rain or demand spikes.
              </p>
              <button className="w-full py-4 rounded-2xl bg-surface-subtle border border-border text-foreground-muted hover:text-foreground text-[10px] font-black uppercase tracking-widest transition-all">
                 Review Peak Rules
              </button>
           </div>
        </div>
      </div>
    </div>
  )
}

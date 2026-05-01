import { useState } from 'react'
import { motion } from 'framer-motion'
import { 
  Plus, 
  MessageSquare, 
  Mail, 
  Smartphone, 
  Save,
  RotateCcw,
  Code
} from 'lucide-react'
import { cn } from '../lib/utils'

const initialTemplates = [
  {
    id: 'NTF-001',
    trigger: 'ORDER_PLACED',
    channels: ['PUSH', 'EMAIL'],
    subject: 'Order #{order_id} Received!',
    content: 'Hi {customer_name}, your order #{order_id} from {pickup} is being processed. ETA: {eta}.',
    status: 'Active'
  },
  {
    id: 'NTF-002',
    trigger: 'COURIER_ASSIGNED',
    channels: ['PUSH', 'SMS'],
    subject: 'Courier is on the way!',
    content: '{courier_name} is heading to {pickup} to collect your package. Tracking: {tracking_url}',
    status: 'Active'
  },
  {
    id: 'NTF-003',
    trigger: 'LEG_1_COMPLETE',
    channels: ['PUSH'],
    subject: 'Package at Relay Point 1',
    content: 'Great news! Your package has arrived at {relay_1_name}. Next courier is being assigned.',
    status: 'Active'
  }
]

export default function Notifications() {
  const [templates] = useState(initialTemplates)
  const [selectedId, setSelectedId] = useState(templates[0].id)
  
  const selectedTemplate = templates.find(t => t.id === selectedId)

  return (
    <div className="space-y-8 animate-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-zinc-100 tracking-tight italic uppercase">Communication Hub</h1>
          <p className="text-zinc-500 mt-1">Manage automated triggers and notification templates.</p>
        </div>
        <button className="px-6 py-3 rounded-2xl bg-primary text-white font-black text-sm uppercase tracking-widest hover:bg-primary-light shadow-lg shadow-primary/20 transition-all flex items-center gap-2">
          <Plus size={18} />
          Add Trigger
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left: Trigger List */}
        <div className="lg:col-span-4 space-y-3">
          <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest px-2">Trigger Events</p>
          <div className="space-y-2">
            {templates.map((t) => (
              <motion.div 
                key={t.id}
                onClick={() => setSelectedId(t.id)}
                className={cn(
                  "p-5 rounded-3xl border cursor-pointer transition-all flex items-center justify-between group",
                  selectedId === t.id 
                    ? "bg-primary/10 border-primary/20 text-primary-light shadow-lg shadow-primary/5" 
                    : "bg-white/5 border-white/5 text-zinc-400 hover:border-white/10 hover:text-zinc-200"
                )}
              >
                <div>
                   <p className="text-[10px] font-black uppercase tracking-widest mb-1">{t.id}</p>
                   <h3 className="font-bold">{t.trigger}</h3>
                </div>
                <div className="flex gap-1.5">
                   {t.channels.includes('PUSH') && <Smartphone size={14} className="opacity-40" />}
                   {t.channels.includes('EMAIL') && <Mail size={14} className="opacity-40" />}
                   {t.channels.includes('SMS') && <MessageSquare size={14} className="opacity-40" />}
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Right: Template Editor */}
        <div className="lg:col-span-8 glass-card p-10 rounded-[48px] border-white/5 space-y-10">
           {selectedTemplate && (
             <>
               <div className="flex items-center justify-between">
                  <div className="space-y-1">
                     <h3 className="text-xl font-black text-zinc-100">{selectedTemplate.trigger}</h3>
                     <p className="text-xs text-zinc-500">Configure messaging for this event</p>
                  </div>
                  <div className="flex items-center gap-2">
                     <button className="p-3 rounded-xl bg-white/5 text-zinc-500 hover:text-white transition-all">
                        <RotateCcw size={18} />
                     </button>
                     <button className="flex items-center gap-2 px-6 py-3 rounded-xl bg-emerald-500 text-white font-black text-xs uppercase tracking-widest hover:bg-emerald-400 transition-all">
                        <Save size={18} />
                        Save Changes
                     </button>
                  </div>
               </div>

               <div className="space-y-8">
                  {/* Channels */}
                  <div className="space-y-4">
                     <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">Active Channels</p>
                     <div className="flex gap-4">
                        {[
                          { id: 'PUSH', icon: Smartphone, label: 'Push' },
                          { id: 'EMAIL', icon: Mail, label: 'Email' },
                          { id: 'SMS', icon: MessageSquare, label: 'SMS' },
                        ].map(ch => (
                          <button 
                            key={ch.id}
                            className={cn(
                              "flex-1 flex items-center justify-center gap-3 p-4 rounded-2xl border transition-all",
                              selectedTemplate.channels.includes(ch.id)
                                ? "bg-primary/5 border-primary/20 text-primary-light"
                                : "bg-white/5 border-white/5 text-zinc-500 grayscale opacity-50"
                            )}
                          >
                            <ch.icon size={18} />
                            <span className="text-[10px] font-black uppercase tracking-widest">{ch.label}</span>
                          </button>
                        ))}
                     </div>
                  </div>

                  {/* Subject */}
                  <div className="space-y-3">
                     <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">Message Subject</label>
                     <input 
                        type="text" 
                        defaultValue={selectedTemplate.subject}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-sm font-bold text-zinc-100 focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                     />
                  </div>

                  {/* Content */}
                  <div className="space-y-3">
                     <div className="flex items-center justify-between">
                        <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">Template Content</label>
                        <div className="flex items-center gap-2 px-2 py-1 rounded-lg bg-white/5 text-zinc-500">
                           <Code size={12} />
                           <span className="text-[9px] font-black uppercase tracking-widest">Dynamic Vars</span>
                        </div>
                     </div>
                     <textarea 
                        rows={6}
                        defaultValue={selectedTemplate.content}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl p-6 text-sm font-medium text-zinc-300 focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all resize-none leading-relaxed"
                     />
                     <div className="flex flex-wrap gap-2 pt-2">
                        {['{order_id}', '{customer_name}', '{pickup}', '{courier_name}', '{eta}'].map(v => (
                          <span key={v} className="px-3 py-1.5 rounded-lg bg-zinc-900 border border-white/5 text-[10px] font-mono text-primary-light/60 hover:text-primary-light hover:border-primary/20 cursor-pointer transition-all">
                             {v}
                          </span>
                        ))}
                     </div>
                  </div>
               </div>
             </>
           )}
        </div>
      </div>
    </div>
  )
}

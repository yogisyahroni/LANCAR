import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { 
  Plus, 
  MessageSquare, 
  Mail, 
  Smartphone, 
  Save,
  RotateCcw,
  Code,
  Loader2
} from 'lucide-react'
import { cn } from '../lib/utils'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { toast } from 'sonner'

export default function Notifications() {
  const queryClient = useQueryClient()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    subject: '',
    content: '',
    channels: [] as string[]
  })

  const { data: templates, isLoading } = useQuery({
    queryKey: ['notification-templates'],
    queryFn: async () => {
      const res = await api.get('/admin/notifications/templates');
      return res.data;
    }
  })

  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      await api.put(`/admin/notifications/templates/${selectedId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-templates'] });
      toast.success('Notification template updated successfully');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to update template');
    }
  })

  const selectedTemplate = templates?.find((t: any) => t.id === selectedId)

  useEffect(() => {
    if (selectedTemplate) {
      setFormData({
        subject: selectedTemplate.subject,
        content: selectedTemplate.content,
        channels: selectedTemplate.channels || []
      })
    } else if (templates?.length > 0 && !selectedId) {
      setSelectedId(templates[0].id)
    }
  }, [selectedTemplate, templates])

  if (isLoading) {
    return (
      <div className="h-[80vh] flex items-center justify-center">
        <Loader2 className="w-12 h-12 text-primary animate-spin" aria-hidden="true" />
      </div>
    );
  }

  const handleSave = () => {
    if (!selectedId) return;
    updateMutation.mutate(formData);
  }

  const toggleChannel = (channelId: string) => {
    setFormData(prev => ({
      ...prev,
      channels: prev.channels.includes(channelId)
        ? prev.channels.filter(c => c !== channelId)
        : [...prev.channels, channelId]
    }))
  }

  return (
    <div className="space-y-8 animate-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-foreground-muted tracking-tight italic uppercase">Communication Hub</h1>
          <p className="text-foreground-muted mt-1">Manage automated triggers and notification templates.</p>
        </div>
        <button className="px-6 py-3 rounded-2xl bg-primary text-on-primary font-black text-sm uppercase tracking-widest hover:bg-primary-light shadow-lg shadow-primary/20 transition-all flex items-center gap-2">
          <Plus size={18}  aria-hidden="true"/>
          Add Trigger
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left: Trigger List */}
        <div className="lg:col-span-4 space-y-3">
          <p className="text-[10px] font-black text-foreground-muted uppercase tracking-widest px-2">Trigger Events</p>
          <div className="space-y-2">
            {templates?.map((t: any) => (
              <motion.div 
                key={t.id}
                onClick={() => setSelectedId(t.id)}
                className={cn(
                  "p-5 rounded-3xl border cursor-pointer transition-all flex items-center justify-between group",
                  selectedId === t.id 
                    ? "bg-primary/10 border-primary/20 text-primary-light shadow-lg shadow-primary/5" 
                    : "bg-surface-subtle border-border text-foreground-muted hover:border-border hover:text-foreground-muted"
                )}
              >
                <div>
                   <p className="text-[10px] font-black uppercase tracking-widest mb-1">ID: {t.id}</p>
                   <h3 className="font-bold">{t.trigger}</h3>
                </div>
                <div className="flex gap-1.5">
                   {t.channels?.includes('PUSH') && <Smartphone size={14} className="opacity-40" aria-hidden="true" />}
                   {t.channels?.includes('EMAIL') && <Mail size={14} className="opacity-40" aria-hidden="true" />}
                   {t.channels?.includes('SMS') && <MessageSquare size={14} className="opacity-40" aria-hidden="true" />}
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Right: Template Editor */}
        <div className="lg:col-span-8 glass-card p-10 rounded-[48px] border-border space-y-10">
           {selectedTemplate ? (
             <>
               <div className="flex items-center justify-between">
                  <div className="space-y-1">
                     <h3 className="text-xl font-black text-foreground-muted">{selectedTemplate.trigger}</h3>
                     <p className="text-xs text-foreground-muted">Configure messaging for this event</p>
                  </div>
                  <div className="flex items-center gap-2">
                     <button 
                        type="button"
                        onClick={() => setFormData({
                          subject: selectedTemplate.subject,
                          content: selectedTemplate.content,
                          channels: selectedTemplate.channels || []
                        })}
                        aria-label="Reset notification template"
                        title="Reset notification template"
                        className="p-3 rounded-xl bg-surface-subtle text-foreground-muted hover:text-foreground transition-all"
                      >
                        <RotateCcw size={18} aria-hidden="true" />
                     </button>
                     <button 
                        onClick={handleSave}
                        disabled={updateMutation.isPending}
                        className="flex items-center gap-2 px-6 py-3 rounded-xl bg-success text-on-success font-black text-xs uppercase tracking-widest hover:bg-success transition-all disabled:opacity-60"
                      >
                        {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Save size={18} aria-hidden="true" />}
                        Save Changes
                     </button>
                  </div>
               </div>

               <div className="space-y-8">
                  {/* Channels */}
                  <div className="space-y-4">
                     <p className="text-[10px] font-black text-foreground-muted uppercase tracking-widest">Active Channels</p>
                     <div className="flex gap-4">
                        {[
                          { id: 'PUSH', icon: Smartphone, label: 'Push' },
                          { id: 'EMAIL', icon: Mail, label: 'Email' },
                          { id: 'SMS', icon: MessageSquare, label: 'SMS' },
                        ].map(ch => (
                          <button 
                            key={ch.id}
                            onClick={() => toggleChannel(ch.id)}
                            className={cn(
                              "flex-1 flex items-center justify-center gap-3 p-4 rounded-2xl border transition-all",
                              formData.channels.includes(ch.id)
                                ? "bg-primary/5 border-primary/20 text-primary-light"
                                : "bg-surface-subtle border-border text-foreground-muted grayscale opacity-50"
                            )}
                          >
                            <ch.icon size={18} aria-hidden="true" />
                            <span className="text-sm font-bold tracking-wide">{ch.label}</span>
                          </button>
                        ))}
                     </div>
                  </div>

                  {/* Subject */}
                  <div className="space-y-3">
                     <label className="text-sm font-bold tracking-wide text-foreground-muted">Message Subject</label>
                     <input 
                        type="text" 
                        value={formData.subject}
                        onChange={(e) => setFormData(prev => ({ ...prev, subject: e.target.value }))}
                        className="w-full bg-surface-subtle border border-border rounded-2xl p-4 text-sm font-bold text-foreground-muted focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                     />
                  </div>

                  {/* Content */}
                  <div className="space-y-3">
                     <div className="flex items-center justify-between">
                        <label className="text-sm font-bold tracking-wide text-foreground-muted">Template Content</label>
                        <div className="flex items-center gap-2 px-2 py-1 rounded-lg bg-surface-subtle text-foreground-muted">
                           <Code size={12} aria-hidden="true" />
                           <span className="text-[9px] font-black uppercase tracking-widest">Dynamic Vars</span>
                        </div>
                     </div>
                     <textarea 
                        rows={6}
                        value={formData.content}
                        onChange={(e) => setFormData(prev => ({ ...prev, content: e.target.value }))}
                        className="w-full bg-surface-subtle border border-border rounded-2xl p-6 text-sm font-medium text-foreground-muted focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all resize-none leading-relaxed"
                     />
                     <div className="flex flex-wrap gap-2 pt-2">
                        {['{order_id}', '{customer_name}', '{pickup}', '{courier_name}', '{eta}'].map(v => (
                          <span 
                            key={v} 
                            onClick={() => setFormData(prev => ({ ...prev, content: prev.content + v }))}
                            className="px-3 py-1.5 rounded-lg bg-surface border border-border text-[10px] font-mono text-primary-light/60 hover:text-primary-light hover:border-primary/20 cursor-pointer transition-all"
                          >
                             {v}
                          </span>
                        ))}
                     </div>
                  </div>
               </div>
             </>
           ) : (
             <div className="h-[400px] flex items-center justify-center text-foreground-muted font-black uppercase tracking-widest italic">
                Select a trigger to edit template
             </div>
           )}
        </div>
      </div>
    </div>
  )
}

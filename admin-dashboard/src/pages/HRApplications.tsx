import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Loader2, ExternalLink, Mail, Phone, User } from 'lucide-react';
import { toast } from 'sonner';

export default function HRApplications() {
  const queryClient = useQueryClient();
  const [filterStatus, setFilterStatus] = useState('all');

  const { data: applications, isLoading } = useQuery({
    queryKey: ['hr-applications'],
    queryFn: async () => {
      const res = await api.get('/admin/hr/applications');
      return res.data;
    }
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string, status: string }) => 
      await api.put(`/admin/hr/applications/${id}/status`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hr-applications'] });
      toast.success('Application status updated');
    }
  });

  const filteredApps = applications?.filter((app: any) => 
    filterStatus === 'all' ? true : app.status === filterStatus
  );

  return (
    <div className="space-y-8 animate-in">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-zinc-100 tracking-tight">HR - Job Applications</h1>
          <p className="text-zinc-500 mt-1">Review and manage candidates.</p>
        </div>
      </div>

      <div className="flex gap-2">
        {['all', 'new', 'reviewed', 'interviewing', 'offered', 'hired', 'rejected'].map(s => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={`px-4 py-2 rounded-xl text-xs font-bold uppercase transition-all ${filterStatus === s ? 'bg-primary text-white' : 'bg-white/5 text-zinc-400 hover:text-white'}`}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4">
        {isLoading ? (
          <div className="text-center py-20"><Loader2 className="animate-spin inline-block text-primary w-8 h-8" /></div>
        ) : filteredApps?.length === 0 ? (
          <div className="text-center py-20 text-zinc-500 font-bold uppercase tracking-widest text-xs">No applications found</div>
        ) : filteredApps?.map((app: any) => (
          <div key={app.id} className="glass-card p-6 rounded-3xl border-white/5 shadow-xl flex flex-col md:flex-row justify-between gap-6">
            <div className="space-y-3 flex-1">
              <div className="flex items-center gap-3">
                <h3 className="text-xl font-bold text-zinc-100">{app.full_name}</h3>
                <span className={`px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-widest ${
                  app.status === 'new' ? 'bg-blue-500/10 text-blue-400' : 
                  app.status === 'hired' ? 'bg-emerald-500/10 text-emerald-400' :
                  app.status === 'rejected' ? 'bg-red-500/10 text-red-400' : 'bg-amber-500/10 text-amber-400'
                }`}>
                  {app.status}
                </span>
              </div>
              <p className="text-primary-light font-bold text-sm">Applying for: {app.job_title}</p>
              
              <div className="flex flex-wrap gap-4 text-xs text-zinc-400">
                <span className="flex items-center gap-1"><Mail size={14} /> {app.email}</span>
                <span className="flex items-center gap-1"><Phone size={14} /> {app.phone_number}</span>
                {app.portfolio_url && (
                  <a href={app.portfolio_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-blue-400 hover:underline">
                    <ExternalLink size={14} /> Portfolio / LinkedIn
                  </a>
                )}
              </div>
              {app.cover_letter && (
                <div className="mt-4 p-4 bg-white/[0.02] rounded-xl border border-white/5">
                  <p className="text-xs text-zinc-300 italic">"{app.cover_letter}"</p>
                </div>
              )}
            </div>
            
            <div className="flex flex-col gap-2 min-w-[200px]">
              <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1">Update Status</p>
              <select 
                value={app.status} 
                onChange={e => updateStatus.mutate({ id: app.id, status: e.target.value })}
                className="bg-zinc-900 border border-white/10 rounded-xl px-4 py-2 text-white text-sm"
              >
                <option value="new">New</option>
                <option value="reviewed">Reviewed</option>
                <option value="interviewing">Interviewing</option>
                <option value="offered">Offered</option>
                <option value="hired">Hired</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

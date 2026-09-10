import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Loader2, ExternalLink, Mail, Phone, User } from 'lucide-react';
import { toast } from 'sonner';
import { StatusBadge } from '../components/StatusBadge';

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
          <h1 className="text-3xl font-bold text-foreground-muted tracking-tight">HR - Job Applications</h1>
          <p className="text-foreground-muted mt-1">Review and manage candidates.</p>
        </div>
      </div>

      <div className="flex gap-2">
        {['all', 'new', 'reviewed', 'interviewing', 'offered', 'hired', 'rejected'].map(s => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={`px-4 py-2 rounded-xl text-xs font-bold uppercase transition-all ${filterStatus === s ? 'bg-primary text-on-primary' : 'bg-surface-subtle text-foreground-secondary hover:text-foreground'}`}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4">
        {isLoading ? (
          <div className="text-center py-20"><Loader2 className="animate-spin inline-block text-primary w-8 h-8"  aria-hidden="true"/></div>
        ) : filteredApps?.length === 0 ? (
          <div className="text-center py-20 text-foreground-muted font-bold uppercase tracking-widest text-xs">No applications found</div>
        ) : filteredApps?.map((app: any) => (
          <div key={app.id} className="glass-card p-6 rounded-3xl border-border shadow-xl flex flex-col md:flex-row justify-between gap-6">
            <div className="space-y-3 flex-1">
              <div className="flex items-center gap-3">
                <h3 className="text-xl font-bold text-foreground-muted">{app.full_name}</h3>
                  <StatusBadge status={app.status} labelPrefix="Application status" className="rounded-md" />
              </div>
              <p className="text-primary-light font-bold text-sm">Applying for: {app.job_title}</p>
              
              <div className="flex flex-wrap gap-4 text-xs text-foreground-muted">
                <span className="flex items-center gap-1"><Mail size={14} aria-hidden="true" /> {app.email}</span>
                <span className="flex items-center gap-1"><Phone size={14} aria-hidden="true" /> {app.phone_number}</span>
                {app.portfolio_url && (
                  <a href={app.portfolio_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-info hover:underline">
                    <ExternalLink size={14} aria-hidden="true" /> Portfolio / LinkedIn
                  </a>
                )}
              </div>
              {app.cover_letter && (
                <div className="mt-4 p-4 bg-surface/[0.02] rounded-xl border border-border">
                  <p className="text-xs text-foreground-muted italic">"{app.cover_letter}"</p>
                </div>
              )}
            </div>
            
            <div className="flex flex-col gap-2 min-w-[200px]">
              <p className="text-[10px] font-black text-foreground-muted uppercase tracking-widest mb-1">Update Status</p>
              <select 
                value={app.status} 
                onChange={e => updateStatus.mutate({ id: app.id, status: e.target.value })}
                className="bg-surface border border-border rounded-xl px-4 py-2 text-foreground text-sm"
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

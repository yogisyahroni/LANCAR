import { useState } from 'react';
import { motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Briefcase, Plus, Loader2, Trash2, Edit } from 'lucide-react';
import { toast } from 'sonner';
import { StatusBadge } from '../components/StatusBadge';
import { FocusTrap } from '../components/a11y/FocusTrap';

export default function HRJobs() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    department: '',
    location: '',
    employment_type: 'Full-time',
    description: '',
    requirements: '',
    status: 'active'
  });

  const queryClient = useQueryClient();

  const { data: jobs, isLoading } = useQuery({
    queryKey: ['hr-jobs'],
    queryFn: async () => {
      const res = await api.get('/admin/hr/jobs');
      return res.data;
    }
  });

  const createJob = useMutation({
    mutationFn: async (data: any) => await api.post('/admin/hr/jobs', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hr-jobs'] });
      toast.success('Job created successfully');
      setIsModalOpen(false);
    }
  });

  const updateJob = useMutation({
    mutationFn: async (data: any) => await api.put(`/admin/hr/jobs/${editingId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hr-jobs'] });
      toast.success('Job updated successfully');
      setIsModalOpen(false);
      setEditingId(null);
    }
  });

  const deleteJob = useMutation({
    mutationFn: async (id: string) => await api.delete(`/admin/hr/jobs/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hr-jobs'] });
      toast.success('Job deleted successfully');
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId) {
      updateJob.mutate(formData);
    } else {
      createJob.mutate(formData);
    }
  };

  const openEdit = (job: any) => {
    setFormData({
      title: job.title,
      department: job.department,
      location: job.location,
      employment_type: job.employment_type,
      description: job.description,
      requirements: job.requirements,
      status: job.status
    });
    setEditingId(job.id);
    setIsModalOpen(true);
  };

  return (
    <div className="space-y-8 animate-in">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-foreground-muted tracking-tight">HR - Job Postings</h1>
          <p className="text-foreground-muted mt-1">Manage active career opportunities.</p>
        </div>
        <button
          onClick={() => {
            setEditingId(null);
            setFormData({ title: '', department: '', location: '', employment_type: 'Full-time', description: '', requirements: '', status: 'active' });
            setIsModalOpen(true);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-on-primary rounded-xl font-bold"
        >
          <Plus size={18} aria-hidden="true" /> Add Job
        </button>
      </div>

      <div className="glass-card rounded-[40px] border-border overflow-hidden">
        <div role="region" aria-label="Job postings table" tabIndex={0} className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-border bg-surface/[0.01]">
              <th scope="col" className="px-8 py-6 text-xs font-black text-foreground-muted uppercase">Title</th>
              <th scope="col" className="px-8 py-6 text-xs font-black text-foreground-muted uppercase">Department</th>
              <th scope="col" className="px-8 py-6 text-xs font-black text-foreground-muted uppercase">Status</th>
              <th scope="col" className="px-8 py-6 text-xs font-black text-foreground-muted uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading ? (
              <tr><td colSpan={4} className="text-center py-10"><Loader2 className="animate-spin inline-block text-primary" aria-hidden="true" /></td></tr>
            ) : jobs?.map((job: any) => (
              <tr key={job.id} className="hover:bg-surface/[0.02]">
                <td className="px-8 py-6 font-bold text-foreground-muted">{job.title}</td>
                <td className="px-8 py-6 text-foreground-muted">{job.department}</td>
                <td className="px-8 py-6">
                  <StatusBadge status={job.status} labelPrefix="Job status" className="text-xs uppercase" />
                </td>
                <td className="px-8 py-6 flex gap-3">
                  <button type="button" onClick={() => openEdit(job)} aria-label={`Edit job ${job.title}`} title="Edit job" className="text-foreground-muted hover:text-foreground"><Edit size={18} aria-hidden="true" /></button>
                  <button type="button" onClick={() => deleteJob.mutate(job.id)} aria-label={`Delete job ${job.title}`} title="Delete job" className="inline-flex items-center gap-1 text-xs font-bold text-error hover:text-error"><Trash2 size={18} aria-hidden="true" /><span>Delete</span></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-scrim/80 backdrop-blur-sm">
          <FocusTrap active={isModalOpen} className="glass-card w-full max-w-2xl p-8 rounded-3xl overflow-y-auto max-h-[90vh]">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="job-form-title"
            onKeyDown={(event) => {
              if (event.key === 'Escape') setIsModalOpen(false);
            }}
            className="h-full"
          >
            <h2 id="job-form-title" className="text-2xl font-bold text-foreground mb-6">{editingId ? 'Edit Job' : 'Create Job'}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-foreground-muted mb-2">Title (wajib)</label>
                  <input aria-label="Title (wajib)" aria-required="true" required value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} className="w-full bg-surface border border-border rounded-xl px-4 py-2 text-foreground" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-foreground-muted mb-2">Department (wajib)</label>
                  <input aria-label="Department (wajib)" aria-required="true" required value={formData.department} onChange={e => setFormData({ ...formData, department: e.target.value })} className="w-full bg-surface border border-border rounded-xl px-4 py-2 text-foreground" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-foreground-muted mb-2">Location (wajib)</label>
                  <input aria-label="Location (wajib)" aria-required="true" required value={formData.location} onChange={e => setFormData({ ...formData, location: e.target.value })} className="w-full bg-surface border border-border rounded-xl px-4 py-2 text-foreground" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-foreground-muted mb-2">Employment Type (wajib)</label>
                  <input aria-label="Employment Type (wajib)" aria-required="true" required value={formData.employment_type} onChange={e => setFormData({ ...formData, employment_type: e.target.value })} className="w-full bg-surface border border-border rounded-xl px-4 py-2 text-foreground" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-foreground-muted mb-2">Description (wajib)</label>
                <textarea aria-label="Description (wajib)" aria-required="true" required rows={4} value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} className="w-full bg-surface border border-border rounded-xl px-4 py-2 text-foreground" />
              </div>
              <div>
                <label className="block text-xs font-bold text-foreground-muted mb-2">Requirements (wajib)</label>
                <textarea aria-label="Requirements (wajib)" aria-required="true" required rows={4} value={formData.requirements} onChange={e => setFormData({ ...formData, requirements: e.target.value })} className="w-full bg-surface border border-border rounded-xl px-4 py-2 text-foreground" />
              </div>
              <div>
                <label className="block text-xs font-bold text-foreground-muted mb-2">Status</label>
                <select aria-label="Status" value={formData.status} onChange={e => setFormData({ ...formData, status: e.target.value })} className="w-full bg-surface border border-border rounded-xl px-4 py-2 text-foreground">
                  <option value="active">Active</option>
                  <option value="draft">Draft</option>
                  <option value="closed">Closed</option>
                </select>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-foreground-muted hover:text-foreground">Cancel</button>
                <button type="submit" className="px-6 py-2 bg-primary text-on-primary rounded-xl font-bold">Save</button>
              </div>
            </form>
          </motion.div>
          </FocusTrap>
        </div>
      )}
    </div>
  );
}

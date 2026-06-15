import { useState } from 'react';
import { motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Briefcase, Plus, Loader2, Trash2, Edit } from 'lucide-react';
import { toast } from 'sonner';

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
          <h1 className="text-3xl font-bold text-zinc-100 tracking-tight">HR - Job Postings</h1>
          <p className="text-zinc-500 mt-1">Manage active career opportunities.</p>
        </div>
        <button
          onClick={() => {
            setEditingId(null);
            setFormData({ title: '', department: '', location: '', employment_type: 'Full-time', description: '', requirements: '', status: 'active' });
            setIsModalOpen(true);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl font-bold"
        >
          <Plus size={18} /> Add Job
        </button>
      </div>

      <div className="glass-card rounded-[40px] border-white/5 overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-white/5 bg-white/[0.01]">
              <th className="px-8 py-6 text-xs font-black text-zinc-500 uppercase">Title</th>
              <th className="px-8 py-6 text-xs font-black text-zinc-500 uppercase">Department</th>
              <th className="px-8 py-6 text-xs font-black text-zinc-500 uppercase">Status</th>
              <th className="px-8 py-6 text-xs font-black text-zinc-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {isLoading ? (
              <tr><td colSpan={4} className="text-center py-10"><Loader2 className="animate-spin inline-block text-primary" /></td></tr>
            ) : jobs?.map((job: any) => (
              <tr key={job.id} className="hover:bg-white/[0.02]">
                <td className="px-8 py-6 font-bold text-zinc-100">{job.title}</td>
                <td className="px-8 py-6 text-zinc-400">{job.department}</td>
                <td className="px-8 py-6">
                  <span className={`px-3 py-1 rounded-full text-xs font-black uppercase ${job.status === 'active' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-zinc-800 text-zinc-400'}`}>
                    {job.status}
                  </span>
                </td>
                <td className="px-8 py-6 flex gap-3">
                  <button onClick={() => openEdit(job)} className="text-zinc-400 hover:text-white"><Edit size={18} /></button>
                  <button onClick={() => deleteJob.mutate(job.id)} className="text-red-400 hover:text-red-300"><Trash2 size={18} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="glass-card w-full max-w-2xl p-8 rounded-3xl overflow-y-auto max-h-[90vh]">
            <h2 className="text-2xl font-bold text-white mb-6">{editingId ? 'Edit Job' : 'Create Job'}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-zinc-400 mb-2">Title</label>
                  <input required value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} className="w-full bg-zinc-900 border border-white/10 rounded-xl px-4 py-2 text-white" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-400 mb-2">Department</label>
                  <input required value={formData.department} onChange={e => setFormData({ ...formData, department: e.target.value })} className="w-full bg-zinc-900 border border-white/10 rounded-xl px-4 py-2 text-white" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-zinc-400 mb-2">Location</label>
                  <input required value={formData.location} onChange={e => setFormData({ ...formData, location: e.target.value })} className="w-full bg-zinc-900 border border-white/10 rounded-xl px-4 py-2 text-white" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-400 mb-2">Employment Type</label>
                  <input required value={formData.employment_type} onChange={e => setFormData({ ...formData, employment_type: e.target.value })} className="w-full bg-zinc-900 border border-white/10 rounded-xl px-4 py-2 text-white" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-400 mb-2">Description</label>
                <textarea required rows={4} value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} className="w-full bg-zinc-900 border border-white/10 rounded-xl px-4 py-2 text-white" />
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-400 mb-2">Requirements</label>
                <textarea required rows={4} value={formData.requirements} onChange={e => setFormData({ ...formData, requirements: e.target.value })} className="w-full bg-zinc-900 border border-white/10 rounded-xl px-4 py-2 text-white" />
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-400 mb-2">Status</label>
                <select value={formData.status} onChange={e => setFormData({ ...formData, status: e.target.value })} className="w-full bg-zinc-900 border border-white/10 rounded-xl px-4 py-2 text-white">
                  <option value="active">Active</option>
                  <option value="draft">Draft</option>
                  <option value="closed">Closed</option>
                </select>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-zinc-400 hover:text-white">Cancel</button>
                <button type="submit" className="px-6 py-2 bg-primary text-white rounded-xl font-bold">Save</button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
}

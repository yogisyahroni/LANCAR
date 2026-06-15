import { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Newspaper, Plus, Loader2, Trash2, Edit, Image as ImageIcon } from 'lucide-react';
import { toast } from 'sonner';

export default function News() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    status: 'draft'
  });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const queryClient = useQueryClient();

  const { data: news, isLoading } = useQuery({
    queryKey: ['news'],
    queryFn: async () => {
      const res = await api.get('/admin/news');
      return res.data.data;
    }
  });

  const createMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const res = await api.post('/admin/news', data, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['news'] });
      toast.success('Berita berhasil ditambahkan');
      closeModal();
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Gagal menambahkan berita');
    }
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string, data: FormData }) => {
      const res = await api.put(`/admin/news/${id}`, data, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['news'] });
      toast.success('Berita berhasil diperbarui');
      closeModal();
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Gagal memperbarui berita');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/admin/news/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['news'] });
      toast.success('Berita berhasil dihapus');
    },
    onError: () => {
      toast.error('Gagal menghapus berita');
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const submitData = new FormData();
    submitData.append('title', formData.title);
    submitData.append('content', formData.content);
    submitData.append('status', formData.status);
    if (imageFile) {
      submitData.append('photo', imageFile);
    }

    if (editingId) {
      updateMutation.mutate({ id: editingId, data: submitData });
    } else {
      createMutation.mutate(submitData);
    }
  };

  const openEditModal = (item: any) => {
    setEditingId(item.id);
    setFormData({
      title: item.title,
      content: item.content,
      status: item.status
    });
    setImageFile(null);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
    setFormData({
      title: '',
      content: '',
      status: 'draft'
    });
    setImageFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Manajemen Berita</h1>
          <p className="text-zinc-400 mt-1">Kelola berita dan update untuk ditampilkan di landing page</p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl hover:bg-primary/90 transition-colors"
        >
          <Plus size={20} />
          Tambah Berita
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {news?.map((item: any) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-zinc-900/50 backdrop-blur-xl border border-white/5 rounded-2xl p-6 flex flex-col"
            >
              {item.image_url && (
                <div className="mb-4 rounded-xl overflow-hidden h-40 bg-zinc-800">
                  <img src={item.image_url} alt={item.title} className="w-full h-full object-cover" />
                </div>
              )}
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <h3 className="font-bold text-lg">{item.title}</h3>
                  <div className="flex items-center gap-2 mt-2">
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                      item.status === 'published' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 
                      'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'
                    }`}>
                      {item.status}
                    </span>
                    <span className="text-xs text-zinc-500">
                      {new Date(item.created_at).toLocaleDateString('id-ID')}
                    </span>
                  </div>
                </div>
              </div>
              <p className="text-sm text-zinc-400 line-clamp-3 mb-6 flex-1">
                {item.content}
              </p>
              <div className="flex items-center gap-2 mt-auto pt-4 border-t border-white/5">
                <button
                  onClick={() => openEditModal(item)}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 rounded-xl transition-colors text-sm"
                >
                  <Edit size={16} /> Edit
                </button>
                <button
                  onClick={() => {
                    if (window.confirm('Hapus berita ini?')) {
                      deleteMutation.mutate(item.id);
                    }
                  }}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-xl transition-colors text-sm"
                >
                  <Trash2 size={16} /> Hapus
                </button>
              </div>
            </motion.div>
          ))}
          {(!news || news.length === 0) && (
            <div className="col-span-full py-12 text-center text-zinc-500">
              Belum ada berita.
            </div>
          )}
        </div>
      )}

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-zinc-950 border border-white/10 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden max-h-[90vh] flex flex-col"
          >
            <div className="p-6 border-b border-white/5 flex items-center justify-between">
              <h2 className="text-xl font-bold">
                {editingId ? 'Edit Berita' : 'Tambah Berita'}
              </h2>
              <button onClick={closeModal} className="text-zinc-500 hover:text-white">
                ✕
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1">
              <form id="news-form" onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1.5">Judul</label>
                  <input
                    type="text"
                    required
                    value={formData.title}
                    onChange={e => setFormData({ ...formData, title: e.target.value })}
                    className="w-full bg-zinc-900 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-primary"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1.5">Gambar (Opsional)</label>
                  <div className="flex items-center gap-4">
                    <input
                      type="file"
                      ref={fileInputRef}
                      accept="image/jpeg, image/png, image/webp"
                      onChange={e => {
                        if (e.target.files && e.target.files.length > 0) {
                          setImageFile(e.target.files[0]);
                        }
                      }}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-2 px-4 py-2.5 bg-zinc-900 border border-white/10 hover:bg-white/5 rounded-xl transition-colors"
                    >
                      <ImageIcon size={18} />
                      {imageFile ? imageFile.name : 'Pilih Gambar'}
                    </button>
                    {imageFile && (
                      <button type="button" onClick={() => setImageFile(null)} className="text-red-400 text-sm hover:underline">
                        Hapus
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-zinc-500 mt-2">Format didukung: JPG, PNG, WEBP. Maks 5MB.</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1.5">Status</label>
                  <select
                    value={formData.status}
                    onChange={e => setFormData({ ...formData, status: e.target.value })}
                    className="w-full bg-zinc-900 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-primary"
                  >
                    <option value="draft">Draft</option>
                    <option value="published">Published</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1.5">Konten</label>
                  <textarea
                    required
                    rows={8}
                    value={formData.content}
                    onChange={e => setFormData({ ...formData, content: e.target.value })}
                    className="w-full bg-zinc-900 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-primary resize-y"
                  />
                </div>
              </form>
            </div>

            <div className="p-6 border-t border-white/5 flex justify-end gap-3 bg-zinc-900/50">
              <button
                type="button"
                onClick={closeModal}
                className="px-4 py-2 hover:bg-white/5 rounded-xl transition-colors"
              >
                Batal
              </button>
              <button
                form="news-form"
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
                className="px-6 py-2 bg-primary text-white rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {(createMutation.isPending || updateMutation.isPending) && <Loader2 size={16} className="animate-spin" />}
                Simpan
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

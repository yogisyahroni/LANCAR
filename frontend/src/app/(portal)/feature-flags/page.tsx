'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ToggleLeft, ToggleRight, Settings2, ShieldAlert, FileJson } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useNotificationStore } from '@/store/useNotificationStore';
import { api } from '@/lib/api';
import FlagEditor from '@/components/FeatureFlags/FlagEditor';

interface FeatureFlag {
  id: string;
  key: string;
  category: string;
  is_enabled: boolean;
  config: any;
  require_checklist: boolean;
  updated_at: string;
}

export default function FeatureFlagsPage() {
  const { user } = useAuthStore();
  const { addNotification } = useNotificationStore();

  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [editingFlag, setEditingFlag] = useState<FeatureFlag | null>(null);
  
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    fetchFlags();
  }, []);

  const fetchFlags = async () => {
    try {
      setLoading(true);
      const res = await api.get('/admin/flags');
      setFlags(res.data || []);
    } catch (error) {
      addNotification({ title: 'Error', message: 'Gagal mengambil data Feature Flags', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleToggleClick = (flag: FeatureFlag) => {
    const reason = window.prompt(`Masukkan alasan untuk mengubah status ${flag.key}:`);
    if (reason && reason.length >= 10) {
      submitToggle(flag.key, !flag.is_enabled, reason);
    } else if (reason !== null) {
      addNotification({ title: 'Validasi', message: 'Alasan minimal 10 karakter', type: 'error' });
    }
  };

  const submitToggle = async (key: string, newEnabled: boolean, reason: string) => {
    try {
      setIsUpdating(true);
      await api.put(`/admin/flags/${key}/toggle`, {
        new_enabled: newEnabled,
        reason
      });
      addNotification({ title: 'Sukses', message: `Berhasil mengubah status ${key}`, type: 'success' });
      fetchFlags();
    } catch (error: any) {
      addNotification({ title: 'Gagal', message: error.response?.data?.error || 'Gagal mengubah flag', type: 'error' });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleSaveConfig = async (newConfigJson: string, reason: string) => {
    if (!editingFlag) return;
    try {
      const parsedConfig = JSON.parse(newConfigJson);
      await api.put(`/admin/flags/${editingFlag.key}/config`, {
        config: parsedConfig,
        reason
      });
      addNotification({ title: 'Sukses', message: 'Konfigurasi berhasil disimpan', type: 'success' });
      setEditingFlag(null);
      fetchFlags();
    } catch (error: any) {
      throw new Error(error.response?.data?.error || 'Gagal menyimpan konfigurasi');
    }
  };

  const visibleFlags = flags.filter((flag) => !['model_two_legs', 'model_three_legs', 'three_legs_relay'].includes(flag.key));

  if (user?.role !== 'super_admin' && user?.role !== 'admin') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
        <ShieldAlert className="h-16 w-16 text-destructive mb-4" />
        <h2 className="text-xl font-bold text-foreground">Akses Ditolak</h2>
        <p className="text-muted-foreground mt-2 max-w-md">Halaman Feature Flags Management hanya dapat diakses oleh Super Admin untuk mencegah perubahan arsitektur yang tidak sah.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 select-none pb-10">
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col md:flex-row md:items-center justify-between gap-6"
      >
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <Settings2 className="h-8 w-8 text-primary" /> Feature Flags
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manajemen operasional sistem, dynamic pricing, dan model rute tanpa deployment ulang.
          </p>
        </div>
      </motion.div>

      {/* Flag Categories / Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[1,2,3,4].map(i => (
             <div key={i} className="h-40 bg-muted/40 animate-pulse rounded-2xl border border-border/40" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {visibleFlags.map((flag) => (
            <motion.div 
              key={flag.key}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className={`p-6 rounded-2xl border transition-all glass-card ${
                flag.is_enabled 
                  ? 'border-emerald-500/30 shadow-[0_4px_20px_-10px_rgba(16,185,129,0.15)]' 
                  : 'border-border/60 grayscale-[0.2]'
              }`}
            >
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="font-bold text-lg text-foreground flex items-center gap-2">
                    {flag.key}
                    {flag.require_checklist && <span title="Requires Double Confirmation"><ShieldAlert className="h-4 w-4 text-amber-500" /></span>}
                  </h3>
                  <span className="text-[10px] font-mono px-2 py-0.5 bg-muted rounded-full mt-1 inline-block text-muted-foreground">
                    {flag.category}
                  </span>
                </div>
                
                <button 
                  onClick={() => handleToggleClick(flag)}
                  className={`transition-all hover:scale-110 active:scale-95 ${flag.is_enabled ? 'text-emerald-500' : 'text-muted-foreground'}`}
                >
                  {flag.is_enabled ? <ToggleRight className="h-10 w-10" /> : <ToggleLeft className="h-10 w-10" />}
                </button>
              </div>

              <p className="text-xs text-muted-foreground line-clamp-2 h-8 mb-4">
                {flag.key === 'model_p2p' ? 'Model Point-to-Point: satu kurir dari pickup ke delivery.' : 'Toggle operasional sistem dinamis.'}
              </p>

              <div className="flex items-center justify-between border-t border-border/40 pt-4 mt-2">
                <div className="text-[10px] text-muted-foreground">
                  Last updated: <br/> {new Date(flag.updated_at).toLocaleDateString('id-ID')}
                </div>
                <button 
                  onClick={() => setEditingFlag(flag)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-muted/50 hover:bg-muted text-xs font-medium rounded-lg text-foreground transition-all"
                >
                  <FileJson className="h-3.5 w-3.5" /> Config
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Editor Modal */}
      <AnimatePresence>
        {editingFlag && (
          <FlagEditor 
            flagKey={editingFlag.key}
            initialConfig={JSON.stringify(editingFlag.config, null, 2)}
            isEnabled={editingFlag.is_enabled}
            onSave={handleSaveConfig}
            onClose={() => setEditingFlag(null)}
          />
        )}
      </AnimatePresence>

    </div>
  );
}

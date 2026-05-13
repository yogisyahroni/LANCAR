'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ToggleLeft, ToggleRight, Settings2, ShieldAlert, CheckCircle, FileJson, AlertTriangle } from 'lucide-react';
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
  
  // 3-Leg Confirmation Modal State
  const [showConfirmModal, setShowConfirmModal] = useState<FeatureFlag | null>(null);
  const [confirmReason, setConfirmReason] = useState('');
  const [checklistChecks, setChecklistChecks] = useState({
    sla: false,
    couriers: false,
    points: false,
    orders: false
  });
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
      console.error('Failed to fetch feature flags:', error);
      addNotification('Gagal mengambil data Feature Flags', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleClick = (flag: FeatureFlag) => {
    if (flag.key === 'model_three_legs' && !flag.is_enabled) {
      // Show double confirmation modal for 3-legs
      setShowConfirmModal(flag);
    } else {
      // Directly ask for reason for normal toggle
      const reason = window.prompt(`Masukkan alasan untuk mengubah status ${flag.key}:`);
      if (reason && reason.length >= 10) {
        submitToggle(flag.key, !flag.is_enabled, reason);
      } else if (reason !== null) {
        addNotification('Alasan minimal 10 karakter', 'error');
      }
    }
  };

  const submitToggle = async (key: string, newEnabled: boolean, reason: string, checklistData?: any) => {
    try {
      setIsUpdating(true);
      await api.put(`/admin/flags/${key}/toggle`, {
        new_enabled: newEnabled,
        reason,
        checklist_data: checklistData
      });
      addNotification(`Berhasil mengubah status ${key}`, 'success');
      setShowConfirmModal(null);
      setConfirmReason('');
      setChecklistChecks({ sla: false, couriers: false, points: false, orders: false });
      fetchFlags();
    } catch (error: any) {
      addNotification(error.response?.data?.error || 'Gagal mengubah flag', 'error');
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
      addNotification('Konfigurasi berhasil disimpan', 'success');
      setEditingFlag(null);
      fetchFlags();
    } catch (error: any) {
      throw new Error(error.response?.data?.error || 'Gagal menyimpan konfigurasi');
    }
  };

  const isChecklistComplete = Object.values(checklistChecks).every(Boolean);

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
          {flags.map((flag) => (
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
                    {flag.require_checklist && <ShieldAlert className="h-4 w-4 text-amber-500" title="Requires Double Confirmation" />}
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
                {flag.key === 'model_p2p' ? 'Model Point-to-Point: 1 kurir dari pickup ke delivery (<15 km).' : 
                 flag.key === 'model_two_legs' ? 'Model Transfer 2-Kaki: 2 kurir untuk rute menengah (15–25 km).' :
                 flag.key === 'model_three_legs' ? 'Model Relay 3-Kaki: 3 kurir untuk rute panjang (>25 km).' :
                 'Toggle operasional sistem dinamis.'}
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

      {/* 3-Leg Double Confirmation Modal */}
      <AnimatePresence>
        {showConfirmModal && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
          >
            <motion.div 
              initial={{ y: 20, scale: 0.95 }} animate={{ y: 0, scale: 1 }}
              className="bg-card border border-destructive/50 shadow-[0_0_40px_-10px_rgba(239,68,68,0.3)] rounded-2xl w-full max-w-xl overflow-hidden flex flex-col"
            >
              <div className="bg-destructive/10 p-5 border-b border-destructive/20 flex items-center gap-3">
                <AlertTriangle className="h-6 w-6 text-destructive" />
                <div>
                  <h3 className="text-lg font-bold text-destructive">CRITICAL ACTION: 3-Leg Activation</h3>
                  <p className="text-xs text-destructive/80">Aktivasi model 3-Kaki membutuhkan validasi operasional lapangan.</p>
                </div>
              </div>

              <div className="p-6 space-y-5">
                <div>
                  <h4 className="text-sm font-bold text-foreground mb-3">3-Leg Activation Readiness Checklist</h4>
                  <div className="space-y-3 bg-muted/30 p-4 rounded-xl border border-border/50">
                    <label className="flex items-start gap-3 cursor-pointer group">
                      <input type="checkbox" className="mt-0.5" checked={checklistChecks.sla} onChange={(e) => setChecklistChecks(p => ({...p, sla: e.target.checked}))} />
                      <div className="text-sm text-foreground group-hover:text-primary transition-colors">
                        SLA 2-Kaki ≥93% selama 4 minggu berturut-turut
                      </div>
                    </label>
                    <label className="flex items-start gap-3 cursor-pointer group">
                      <input type="checkbox" className="mt-0.5" checked={checklistChecks.couriers} onChange={(e) => setChecklistChecks(p => ({...p, couriers: e.target.checked}))} />
                      <div className="text-sm text-foreground group-hover:text-primary transition-colors">
                        Kurir aktif ≥30 orang per zona
                      </div>
                    </label>
                    <label className="flex items-start gap-3 cursor-pointer group">
                      <input type="checkbox" className="mt-0.5" checked={checklistChecks.points} onChange={(e) => setChecklistChecks(p => ({...p, points: e.target.checked}))} />
                      <div className="text-sm text-foreground group-hover:text-primary transition-colors">
                        Titik Temu antar zona telah divalidasi (≥5 titik/pair)
                      </div>
                    </label>
                    <label className="flex items-start gap-3 cursor-pointer group">
                      <input type="checkbox" className="mt-0.5" checked={checklistChecks.orders} onChange={(e) => setChecklistChecks(p => ({...p, orders: e.target.checked}))} />
                      <div className="text-sm text-foreground group-hover:text-primary transition-colors">
                        Volume operasional stabil (≥200 order/hari)
                      </div>
                    </label>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-foreground">Alasan Aktivasi <span className="text-destructive">*</span></label>
                  <textarea
                    className="w-full p-3 bg-muted/30 border border-border/50 rounded-xl focus:ring-2 focus:ring-destructive focus:border-transparent transition-all text-sm text-foreground"
                    placeholder="Wajib diisi (minimal 20 karakter)..."
                    value={confirmReason}
                    onChange={(e) => setConfirmReason(e.target.value)}
                    rows={3}
                  />
                </div>
              </div>

              <div className="p-5 border-t border-border/40 bg-muted/10 flex justify-end gap-3">
                <button 
                  onClick={() => { setShowConfirmModal(null); setConfirmReason(''); }}
                  className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground rounded-xl"
                  disabled={isUpdating}
                >
                  Batal
                </button>
                <button 
                  onClick={() => submitToggle(showConfirmModal.key, true, confirmReason, { admin_manual_confirm: true })}
                  disabled={!isChecklistComplete || confirmReason.length < 20 || isUpdating}
                  className="px-6 py-2 text-sm font-bold bg-destructive hover:bg-destructive/90 text-white rounded-xl shadow-md transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isUpdating ? 'Memproses...' : 'SAYA KONFIRMASI AKTIVASI'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

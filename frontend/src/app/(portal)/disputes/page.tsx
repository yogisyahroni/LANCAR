'use client';

import { createElement, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { 
  AlertTriangle, 
  CircleHelp,
  MessageSquare, 
  Clock, 
  CheckCircle, 
  Search,
  Loader2,
  ChevronRight,
  X,
  XCircle,
  RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import DisputeChat from '@/components/DisputeChat';
import { CustomerPageSkeleton } from '@/components/ui/Skeleton';
import { FocusTrap } from '@/components/a11y/FocusTrap';

const getDisputeStatusPresentation = (status?: string) => {
  const normalizedStatus = (status || '').toLowerCase();
  switch (normalizedStatus) {
    case 'open': return { label: 'Terbuka', icon: MessageSquare, className: 'bg-info-surface text-info border-info' };
    case 'investigating':
    case 'in_review': return { label: 'Sedang ditinjau', icon: Clock, className: 'bg-warning-surface text-warning border-warning' };
    case 'attention_required': return { label: 'Butuh perhatian', icon: AlertTriangle, className: 'bg-error-surface text-error border-error' };
    case 'resolved': return { label: 'Selesai', icon: CheckCircle, className: 'bg-success-surface text-success border-success' };
    case 'closed': return { label: 'Ditutup', icon: XCircle, className: 'bg-surface-subtle text-foreground-muted border-border' };
    case 'rejected': return { label: 'Ditolak', icon: XCircle, className: 'bg-error-surface text-error border-error' };
    default: return {
      label: status ? status.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) : 'Status belum tersedia',
      icon: CircleHelp,
      className: 'bg-surface-subtle text-foreground-muted border-border',
    };
  }
};

function DisputeStatusBadge({ status }: { status?: string }) {
  const presentation = getDisputeStatusPresentation(status);
  return (
    <span aria-label={`Status dispute: ${presentation.label}`} data-status-badge="true" className={cn('inline-flex items-center gap-1.5 rounded-lg border px-3 py-1 text-xs font-bold', presentation.className)}>
      {createElement(presentation.icon, { size: 13, 'aria-hidden': true })}
      {presentation.label}
    </span>
  );
}

export default function DisputesPage() {
  const [selectedDispute, setSelectedDispute] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'attention'>('all');

  const { data: disputesRes, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['my-disputes'],
    queryFn: async () => {
      const res = await api.get('/auth/web/disputes');
      return res.data;
    }
  });

  const disputes = disputesRes?.data || [];
  
  const filteredDisputes = disputes.filter((d: any) => {
    const matchesSearch = String(d.order_number || '').toLowerCase().includes(search.toLowerCase()) ||
                          String(d.category || '').toLowerCase().includes(search.toLowerCase());
    const matchesAttention = filterMode === 'all' || 
                             d.category?.toLowerCase()?.includes('butuh perhatian') || 
                             d.status === 'investigating' ||
                             d.status === 'attention_required';
    return matchesSearch && matchesAttention;
  });
  const errorMessage = (error as any)?.response?.data?.message || (error as any)?.message || 'Data dispute belum bisa dimuat dari database.';

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-foreground">Pusat Bantuan & Dispute</h1>
          <p className="text-muted-foreground text-sm mt-1">Lacak status klaim dan hubungi admin untuk bantuan teknis.</p>
        </div>
        <div className="relative w-full md:w-64">
          <Search aria-hidden="true" className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input 
            type="text" 
            aria-label="Cari dispute berdasarkan nomor order"
            placeholder="Cari No. Order..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-muted/50 border border-border rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>
      </div>

      <div className="flex bg-muted/60 p-1 rounded-xl border border-border/40 select-none w-fit">
        <button
          onClick={() => setFilterMode('all')}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-all cursor-pointer ${
            filterMode === 'all' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Semua Tiket
        </button>
        <button
          onClick={() => setFilterMode('attention')}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-all cursor-pointer flex items-center gap-2 ${
            filterMode === 'attention' ? 'bg-error-surface text-error shadow-sm' : 'text-muted-foreground hover:text-error'
          }`}
        >
          <AlertTriangle aria-hidden="true" className="h-4 w-4" />
          Butuh Perhatian (Aggregator)
        </button>
      </div>

      {isLoading ? (
        <CustomerPageSkeleton />
      ) : isError ? (
        <div className="p-16 text-center bg-destructive/5 border border-destructive/20 rounded-[32px] flex flex-col items-center gap-4">
          <AlertTriangle aria-hidden="true" size={48} className="text-destructive" />
          <div>
            <p className="text-lg font-bold text-foreground">Dispute gagal dimuat</p>
            <p className="text-sm text-muted-foreground mt-1">{errorMessage}</p>
          </div>
          <button
            type="button"
            onClick={() => refetch()}
            className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs font-bold hover:bg-destructive/20 transition-all"
          >
            <RefreshCw aria-hidden="true" size={14} />
            Coba Lagi
          </button>
        </div>
      ) : filteredDisputes.length === 0 ? (
        <div className="p-16 text-center bg-muted/20 border border-dashed border-border rounded-[32px] flex flex-col items-center gap-4">
          <AlertTriangle aria-hidden="true" size={48} className="text-muted-foreground opacity-20" />
          <p className="text-lg font-bold text-foreground">Tidak ada dispute ditemukan</p>
          <p className="text-sm text-muted-foreground">Tiket bantuan Anda akan muncul di sini jika Anda mengajukan klaim atas pesanan.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filteredDisputes.map((dispute: any) => (
            <motion.button
              type="button"
              key={dispute.id}
              whileHover={{ scale: 1.01 }}
              aria-label={`Buka detail dispute ${dispute.order_number || dispute.id}`}
              className="w-full p-6 bg-surface-raised rounded-[24px] border border-border text-left hover:border-primary/30 transition-all cursor-pointer group"
              onClick={() => setSelectedDispute(dispute)}
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex-1 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-primary px-2 py-1 bg-primary/10 rounded-md">
                      {dispute.order_number}
                    </span>
                    <span className="text-xs font-bold text-muted-foreground">
                      {new Date(dispute.created_at).toLocaleDateString('id-ID', { dateStyle: 'medium' })}
                    </span>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-foreground group-hover:text-primary transition-colors">{dispute.category}</h3>
                    <p className="text-sm text-muted-foreground line-clamp-1 italic" title={dispute.description}>"{dispute.description}"</p>
                  </div>
                </div>

                <div className="flex items-center gap-6">
                  <div className="text-right hidden md:block">
                    <p className="text-xs font-bold text-muted-foreground mb-1">Status</p>
                    <DisputeStatusBadge status={dispute.status} />
                  </div>
                  <ChevronRight aria-hidden="true" size={20} className="text-muted-foreground group-hover:text-primary transition-all" />
                </div>
              </div>
            </motion.button>
          ))}
        </div>
      )}

      {/* Detail & Chat Modal */}
      <AnimatePresence>
        {selectedDispute && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedDispute(null)}
              className="absolute inset-0 bg-scrim/60 backdrop-blur-md"
            />
            <FocusTrap active={Boolean(selectedDispute)} className="w-full max-w-4xl max-h-[90vh]">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                role="dialog"
                aria-modal="true"
                aria-labelledby="customer-dispute-detail-title"
                onKeyDown={(event) => {
                  if (event.key === 'Escape') setSelectedDispute(null);
                }}
                className="bg-background w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-[40px] shadow-2xl relative z-10 border border-border p-8 md:p-12"
              >
              <div className="space-y-10">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                       <span className="text-xs font-black text-primary uppercase tracking-wide">{selectedDispute.order_number}</span>
                       <span className="text-foreground-muted">/</span>
                       <DisputeStatusBadge status={selectedDispute.status} />
                    </div>
                    <h2 id="customer-dispute-detail-title" className="text-3xl font-black text-foreground tracking-tight">{selectedDispute.category}</h2>
                  </div>
                  <button type="button" onClick={() => setSelectedDispute(null)} aria-label="Tutup detail sengketa" title="Tutup detail sengketa" className="p-3 rounded-2xl bg-muted hover:bg-muted/80 text-muted-foreground transition-all">
                    <X aria-hidden="true" size={24} />
                  </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                  <div className="space-y-8">
                    <div className="space-y-4">
                      <h4 className="text-xs font-black text-muted-foreground uppercase tracking-wide">Detail Laporan</h4>
                      <div className="p-6 rounded-3xl bg-muted/30 border border-border">
                        <p className="text-sm text-foreground leading-relaxed italic">
                          "{selectedDispute.description}"
                        </p>
                      </div>
                    </div>
                    
                    {selectedDispute.resolution_note && (
                      <div className="space-y-4 animate-in slide-in-from-left duration-300">
                        <h4 className="text-xs font-black text-success uppercase tracking-wide flex items-center gap-2">
                          <CheckCircle aria-hidden="true" size={14} /> Solusi dari Admin
                        </h4>
                        <div className="p-6 rounded-3xl bg-success-surface border border-success">
                          <p className="text-sm text-foreground leading-relaxed">
                            {selectedDispute.resolution_note}
                          </p>
                        </div>
                      </div>
                    )}

                    <div className="flex items-center gap-4 p-4 rounded-2xl bg-muted/20 border border-border">
                      <div className="p-2 rounded-lg bg-primary/10 text-primary">
                        <Clock aria-hidden="true" size={16} />
                      </div>
                      <div className="text-xs">
                        <p className="font-bold text-foreground">Terakhir diperbarui</p>
                        <p className="text-muted-foreground">{new Date(selectedDispute.updated_at || selectedDispute.created_at).toLocaleString('id-ID')}</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col">
                    <DisputeChat 
                      disputeId={selectedDispute.id} 
                      onClose={() => setSelectedDispute(null)} 
                    />
                  </div>
                </div>
              </div>
              </motion.div>
            </FocusTrap>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

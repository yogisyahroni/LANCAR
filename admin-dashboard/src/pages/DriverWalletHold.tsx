import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { toast } from 'sonner';
import { Search, ShieldOff, Loader2, CheckCircle, XCircle } from 'lucide-react';

// FOOD-BIKE-054: Visibilitas admin ke hold_balance wallet driver,
// driver_penalty_log, dan status appeal — investigasi manual banding.

interface Penalty {
  id: string;
  order_id: string;
  violation_type: string;
  amount_deducted: number;
  appeal_status: string;
  created_at: string;
}

interface DriverWalletHold {
  wallet_id: string;
  courier_id: string;
  balance: number;
  hold_balance: number;
  hold_minimum_required: number;
  wallet_status: string;
  driver_name: string;
  phone: string;
  email: string;
  vehicle_type: string | null;
  penalties: Penalty[];
}

const fetchHolds = async (search: string = '') => {
  const res = await api.get('/admin/driver-wallet-holds', { params: { search } });
  return res.data.drivers as DriverWalletHold[];
};

const updateAppeal = async ({ penaltyId, appealStatus, note }: { penaltyId: string, appealStatus: string, note: string }) => {
  const res = await api.patch(`/admin/driver-penalties/${penaltyId}/appeal`, {
    appeal_status: appealStatus,
    resolution_note: note
  });
  return res.data;
};

const formatIDR = (n: number) => `Rp ${Number(n || 0).toLocaleString('id-ID')}`;
const violationLabel: Record<string, string> = {
  silent_cancel: 'Batal Diam-diam',
  soft_ghosting: 'Ghosting Lembut',
  coerced_cancel: 'Batal Terpaksa',
  no_show_pickup: 'No-show Pickup',
};

export default function DriverWalletHold() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selected, setSelected] = useState<DriverWalletHold | null>(null);
  const [appealAction, setAppealAction] = useState<Penalty | null>(null);
  const [note, setNote] = useState('');
  const queryClient = useQueryClient();

  const { data: drivers, isLoading, error } = useQuery({
    queryKey: ['driverWalletHolds', searchTerm],
    queryFn: () => fetchHolds(searchTerm)
  });

  const mutation = useMutation({
    mutationFn: updateAppeal,
    onSuccess: () => {
      toast.success('Status banding diperbarui');
      queryClient.invalidateQueries({ queryKey: ['driverWalletHolds'] });
      setAppealAction(null);
      setNote('');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Gagal update banding');
    }
  });

  return (
    <div className="p-6 sm:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground-muted">Driver Wallet Hold</h1>
          <p className="text-xs text-foreground-muted mt-1">Hold balance (anti-ghosting), penalty log, dan status appeal driver</p>
        </div>
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground-muted"  aria-hidden="true"/>
          <input
            type="text"
            aria-label="Search driver wallet holds by name, phone, or email"
            placeholder="Search driver name, phone, email..."
            className="w-full bg-surface-subtle border border-border rounded-2xl py-2.5 pl-11 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all font-medium text-foreground-muted placeholder:text-foreground-muted shadow-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {isLoading ? (
        <div className="glass-card rounded-3xl p-12 flex flex-col items-center justify-center space-y-4">
          <Loader2 className="w-8 h-8 text-primary animate-spin" aria-hidden="true" />
          <p className="text-xs font-bold text-foreground-muted uppercase tracking-widest">Loading wallet holds...</p>
        </div>
      ) : error ? (
        <div className="glass-card rounded-3xl p-8 border-error bg-error-surface text-error font-semibold text-center">
          Failed to load wallet holds
        </div>
      ) : !drivers || drivers.length === 0 ? (
        <div className="glass-card rounded-3xl p-12 text-center">
          <ShieldOff className="w-12 h-12 text-foreground-muted mx-auto mb-3" aria-hidden="true" />
          <p className="text-foreground-muted font-bold text-sm">Tidak ada driver dengan hold balance atau penalty</p>
        </div>
      ) : (
        <div className="space-y-6">
          {drivers.map((d) => (
            <div key={d.wallet_id} className="glass-card rounded-3xl border border-border p-6 sm:p-8">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3">
                    <h3 className="text-lg font-bold text-foreground-muted">{d.driver_name || 'Unknown'}</h3>
                    <span className={`px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest rounded-full border ${
                      d.hold_balance > 0
                        ? 'bg-warning-surface text-warning border-warning'
                        : 'bg-success-surface text-success border-success'
                    }`}>
                      {d.hold_balance > 0 ? 'HOLD AKTIF' : 'BERSIH'}
                    </span>
                  </div>
                  <p className="text-xs text-foreground-muted mt-1 font-mono">{d.phone || d.email || d.courier_id}</p>
                  <p className="text-[11px] text-foreground-muted mt-0.5 capitalize">{d.vehicle_type || 'motor'} • {d.wallet_status}</p>
                </div>
                <div className="flex gap-6 text-right">
                  <div>
                    <div className="text-[10px] font-black text-foreground-muted uppercase tracking-widest">Saldo Bebas</div>
                    <div className="text-sm font-bold text-foreground-muted mt-0.5">{formatIDR(d.balance)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-black text-foreground-muted uppercase tracking-widest">Hold</div>
                    <div className="text-sm font-bold text-warning mt-0.5">{formatIDR(d.hold_balance)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-black text-foreground-muted uppercase tracking-widest">Min. Hold</div>
                    <div className="text-sm font-bold text-foreground-muted mt-0.5">{formatIDR(d.hold_minimum_required)}</div>
                  </div>
                </div>
              </div>

              {(d.penalties?.length || 0) > 0 && (
                <div className="mt-5 border-t border-border pt-4 space-y-2">
                  <div className="text-[10px] font-black text-foreground-muted uppercase tracking-widest mb-2">Riwayat Penalty</div>
                  {d.penalties!.map((p) => (
                    <div key={p.id} className="flex items-center justify-between gap-4 bg-surface/[0.02] rounded-xl px-4 py-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-[10px] font-black text-foreground-muted uppercase tracking-widest font-mono">{p.order_id.slice(0, 8)}</span>
                        <span className="text-xs font-bold text-foreground-muted">{violationLabel[p.violation_type] || p.violation_type}</span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-xs font-bold text-error">{formatIDR(p.amount_deducted)}</span>
                        <span className={`px-2 py-0.5 text-[10px] font-black uppercase rounded-full border ${
                          p.appeal_status === 'approved' ? 'bg-success-surface text-success border-success' :
                          p.appeal_status === 'rejected' ? 'bg-error-surface text-error border-error' :
                          p.appeal_status === 'submitted' ? 'bg-info-surface text-info border-info' :
                          'bg-surface-subtle text-foreground-muted border-border'
                        }`}>
                          {p.appeal_status === 'none' ? 'BELUM BANDING' : p.appeal_status.toUpperCase()}
                        </span>
                        {p.appeal_status === 'submitted' && (
                          <button
                            onClick={() => { setAppealAction(p); setNote(''); }}
                            className="px-3 py-1.5 rounded-lg bg-surface-subtle border border-border text-[11px] font-bold text-foreground-muted hover:bg-surface-subtle transition-all active:scale-95"
                          >
                            Proses
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {appealAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-scrim/80 backdrop-blur-sm" onClick={() => setAppealAction(null)} />
          <div className="glass-card bg-surface-subtle border border-border rounded-[32px] shadow-2xl max-w-md w-full p-8 relative z-10">
            <h2 className="text-xl font-bold text-foreground-muted mb-1">Proses Banding Penalty</h2>
            <p className="text-xs text-foreground-muted font-mono mb-4 break-all">Order {appealAction.order_id.slice(0, 8)} • {violationLabel[appealAction.violation_type] || appealAction.violation_type} • {formatIDR(appealAction.amount_deducted)}</p>
            <textarea
              className="w-full bg-surface-subtle border border-border rounded-xl p-3 text-sm text-foreground-muted focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all placeholder:text-foreground-muted mb-6"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Catatan keputusan (wajib untuk audit trail)"
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setAppealAction(null)}
                className="px-5 py-2.5 rounded-xl border border-border text-sm font-bold text-foreground-muted hover:bg-surface-subtle hover:text-foreground-muted active:scale-95 transition-all"
              >
                Batal
              </button>
              <button
                onClick={() => mutation.mutate({ penaltyId: appealAction.id, appealStatus: 'rejected', note })}
                disabled={mutation.isPending}
                className="px-5 py-2.5 rounded-xl bg-error-surface text-on-error text-sm font-bold hover:bg-error active:scale-95 transition-all disabled:opacity-50 inline-flex items-center gap-2"
              >
                <XCircle size={16} aria-hidden="true" /> Tolak
              </button>
              <button
                onClick={() => mutation.mutate({ penaltyId: appealAction.id, appealStatus: 'approved', note })}
                disabled={mutation.isPending}
                className="px-5 py-2.5 rounded-xl bg-success-surface text-on-success text-sm font-bold hover:bg-success active:scale-95 transition-all disabled:opacity-50 inline-flex items-center gap-2"
              >
                <CheckCircle size={16} aria-hidden="true" /> Setujui & Rilis Hold
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

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
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100">Driver Wallet Hold</h1>
          <p className="text-xs text-zinc-400 mt-1">Hold balance (anti-ghosting), penalty log, dan status appeal driver</p>
        </div>
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
          <input
            type="text"
            placeholder="Search driver name, phone, email..."
            className="w-full bg-white/5 border border-white/10 rounded-2xl py-2.5 pl-11 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all font-medium text-zinc-200 placeholder:text-zinc-600 shadow-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {isLoading ? (
        <div className="glass-card rounded-3xl p-12 flex flex-col items-center justify-center space-y-4">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
          <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Loading wallet holds...</p>
        </div>
      ) : error ? (
        <div className="glass-card rounded-3xl p-8 border-red-500/20 bg-red-500/5 text-red-400 font-semibold text-center">
          Failed to load wallet holds
        </div>
      ) : !drivers || drivers.length === 0 ? (
        <div className="glass-card rounded-3xl p-12 text-center">
          <ShieldOff className="w-12 h-12 text-zinc-700 mx-auto mb-3" />
          <p className="text-zinc-500 font-bold text-sm">Tidak ada driver dengan hold balance atau penalty</p>
        </div>
      ) : (
        <div className="space-y-6">
          {drivers.map((d) => (
            <div key={d.wallet_id} className="glass-card rounded-3xl border border-white/10 p-6 sm:p-8">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3">
                    <h3 className="text-lg font-bold text-zinc-100">{d.driver_name || 'Unknown'}</h3>
                    <span className={`px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest rounded-full border ${
                      d.hold_balance > 0
                        ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                        : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    }`}>
                      {d.hold_balance > 0 ? 'HOLD AKTIF' : 'BERSIH'}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500 mt-1 font-mono">{d.phone || d.email || d.courier_id}</p>
                  <p className="text-[11px] text-zinc-600 mt-0.5 capitalize">{d.vehicle_type || 'motor'} • {d.wallet_status}</p>
                </div>
                <div className="flex gap-6 text-right">
                  <div>
                    <div className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Saldo Bebas</div>
                    <div className="text-sm font-bold text-zinc-200 mt-0.5">{formatIDR(d.balance)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Hold</div>
                    <div className="text-sm font-bold text-amber-400 mt-0.5">{formatIDR(d.hold_balance)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Min. Hold</div>
                    <div className="text-sm font-bold text-zinc-300 mt-0.5">{formatIDR(d.hold_minimum_required)}</div>
                  </div>
                </div>
              </div>

              {(d.penalties?.length || 0) > 0 && (
                <div className="mt-5 border-t border-white/5 pt-4 space-y-2">
                  <div className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-2">Riwayat Penalty</div>
                  {d.penalties!.map((p) => (
                    <div key={p.id} className="flex items-center justify-between gap-4 bg-white/[0.02] rounded-xl px-4 py-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-[10px] font-black text-zinc-600 uppercase tracking-widest font-mono">{p.order_id.slice(0, 8)}</span>
                        <span className="text-xs font-bold text-zinc-200">{violationLabel[p.violation_type] || p.violation_type}</span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-xs font-bold text-red-400">{formatIDR(p.amount_deducted)}</span>
                        <span className={`px-2 py-0.5 text-[10px] font-black uppercase rounded-full border ${
                          p.appeal_status === 'approved' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                          p.appeal_status === 'rejected' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                          p.appeal_status === 'submitted' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                          'bg-zinc-500/10 text-zinc-400 border-zinc-500/20'
                        }`}>
                          {p.appeal_status === 'none' ? 'BELUM BANDING' : p.appeal_status.toUpperCase()}
                        </span>
                        {p.appeal_status === 'submitted' && (
                          <button
                            onClick={() => { setAppealAction(p); setNote(''); }}
                            className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[11px] font-bold text-zinc-300 hover:bg-white/10 transition-all active:scale-95"
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
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setAppealAction(null)} />
          <div className="glass-card bg-zinc-900/95 border border-white/10 rounded-[32px] shadow-2xl max-w-md w-full p-8 relative z-10">
            <h2 className="text-xl font-bold text-zinc-100 mb-1">Proses Banding Penalty</h2>
            <p className="text-xs text-zinc-500 font-mono mb-4 break-all">Order {appealAction.order_id.slice(0, 8)} • {violationLabel[appealAction.violation_type] || appealAction.violation_type} • {formatIDR(appealAction.amount_deducted)}</p>
            <textarea
              className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all placeholder:text-zinc-600 mb-6"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Catatan keputusan (wajib untuk audit trail)"
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setAppealAction(null)}
                className="px-5 py-2.5 rounded-xl border border-white/10 text-sm font-bold text-zinc-400 hover:bg-white/5 hover:text-zinc-200 active:scale-95 transition-all"
              >
                Batal
              </button>
              <button
                onClick={() => mutation.mutate({ penaltyId: appealAction.id, appealStatus: 'rejected', note })}
                disabled={mutation.isPending}
                className="px-5 py-2.5 rounded-xl bg-red-500/80 text-white text-sm font-bold hover:bg-red-500 active:scale-95 transition-all disabled:opacity-50 inline-flex items-center gap-2"
              >
                <XCircle size={16} /> Tolak
              </button>
              <button
                onClick={() => mutation.mutate({ penaltyId: appealAction.id, appealStatus: 'approved', note })}
                disabled={mutation.isPending}
                className="px-5 py-2.5 rounded-xl bg-emerald-500/80 text-white text-sm font-bold hover:bg-emerald-500 active:scale-95 transition-all disabled:opacity-50 inline-flex items-center gap-2"
              >
                <CheckCircle size={16} /> Setujui & Rilis Hold
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

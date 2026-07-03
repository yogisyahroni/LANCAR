import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { toast } from 'sonner';
import { Search, Award, Loader2 } from 'lucide-react';

interface CourierPerformanceStats {
  courier_id: string;
  courier_name?: string;
  ontime_deliveries_count: number;
  total_deliveries_count: number;
  docs_complete_pct: number;
  avg_partner_rating: number;
  complaint_ratio_pct: number;
  relay_score: number;
  tier: string;
}

const fetchPerformance = async (search: string = '') => {
  const res = await api.get(`/admin/couriers/performance`, {
    params: { search }
  });
  return res.data.data as CourierPerformanceStats[];
};

const overrideTier = async ({ courierId, tier, note }: { courierId: string, tier: string, note: string }) => {
  const res = await api.put(`/admin/couriers/${courierId}/tier`, 
    { new_tier: tier, note }
  );
  return res.data;
};

export default function CourierPerformance() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCourier, setSelectedCourier] = useState<CourierPerformanceStats | null>(null);
  const [newTier, setNewTier] = useState('silver');
  const [note, setNote] = useState('');
  const queryClient = useQueryClient();

  const { data: stats, isLoading, error } = useQuery({
    queryKey: ['courierPerformance', searchTerm],
    queryFn: () => fetchPerformance(searchTerm)
  });

  const mutation = useMutation({
    mutationFn: overrideTier,
    onSuccess: () => {
      toast.success('Tier updated successfully');
      queryClient.invalidateQueries({ queryKey: ['courierPerformance'] });
      setSelectedCourier(null);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Failed to update tier');
    }
  });

  return (
    <div className="p-6 sm:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100">Courier Performance</h1>
          <p className="text-xs text-zinc-400 mt-1">Monitor real-time delivery scores, partner ratings, and manage courier tiers</p>
        </div>
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
          <input 
            type="text" 
            placeholder="Search by name, ID, or tier..." 
            className="w-full bg-white/5 border border-white/10 rounded-2xl py-2.5 pl-11 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all font-medium text-zinc-200 placeholder:text-zinc-600 shadow-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {isLoading ? (
        <div className="glass-card rounded-3xl p-12 flex flex-col items-center justify-center space-y-4">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
          <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Loading performance stats...</p>
        </div>
      ) : error ? (
        <div className="glass-card rounded-3xl p-8 border-red-500/20 bg-red-500/5 text-red-400 font-semibold text-center">
          Failed to load performance stats
        </div>
      ) : !stats || stats.length === 0 ? (
        <div className="glass-card rounded-3xl p-12 text-center">
          <Award className="w-12 h-12 text-zinc-700 mx-auto mb-3" />
          <p className="text-zinc-500 font-bold text-sm">No courier performance records found</p>
        </div>
      ) : (
        <div className="glass-card rounded-3xl overflow-hidden border border-white/10 shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-white/5 text-zinc-500 text-[10px] font-black uppercase tracking-[0.2em] bg-white/[0.02]">
                  <th className="px-6 py-4">Courier</th>
                  <th className="px-6 py-4">Tier</th>
                  <th className="px-6 py-4">Rating</th>
                  <th className="px-6 py-4">Total Orders</th>
                  <th className="px-6 py-4">Score</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {stats.map((stat, idx) => {
                  const tierStr = String(stat?.tier || 'silver').toLowerCase();
                  const displayTier = String(stat?.tier || 'SILVER').toUpperCase();
                  const rating = Number(stat?.avg_partner_rating || 0).toFixed(1);
                  const score = Number(stat?.relay_score || 0).toFixed(1);
                  const deliveries = stat?.total_deliveries_count || 0;
                  const name = stat?.courier_name || `Courier ${String(stat?.courier_id || '').slice(0, 8)}`;
                  return (
                    <tr key={stat?.courier_id || idx} className="group hover:bg-white/[0.03] transition-all duration-200">
                      <td className="px-6 py-5">
                        <div className="font-bold text-zinc-100 text-sm">{name}</div>
                        <div className="text-[11px] text-zinc-500 font-mono mt-0.5">{stat?.courier_id || 'N/A'}</div>
                      </td>
                      <td className="px-6 py-5 whitespace-nowrap">
                        <span className={`px-3 py-1 inline-flex text-xs font-bold rounded-full border ${
                          tierStr === 'god_mode' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 
                          tierStr === 'gold' ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' : 
                          tierStr === 'silver' ? 'bg-zinc-500/10 text-zinc-300 border-zinc-500/20' :
                          'bg-blue-500/10 text-blue-400 border-blue-500/20'
                        }`}>
                          {displayTier}
                        </span>
                      </td>
                      <td className="px-6 py-5 whitespace-nowrap text-sm font-semibold text-zinc-300">⭐ {rating}</td>
                      <td className="px-6 py-5 whitespace-nowrap text-sm font-semibold text-zinc-300">{deliveries}</td>
                      <td className="px-6 py-5 whitespace-nowrap text-sm font-semibold text-primary-light">{score}</td>
                      <td className="px-6 py-5 whitespace-nowrap text-right text-sm font-medium">
                        <button 
                          onClick={() => setSelectedCourier(stat)}
                          className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-bold text-zinc-300 hover:bg-white/10 hover:text-white transition-all active:scale-95"
                        >
                          Override Tier
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selectedCourier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div 
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => setSelectedCourier(null)}
          />
          <div className="glass-card bg-zinc-900/95 border border-white/10 rounded-[32px] shadow-2xl max-w-md w-full p-8 relative z-10">
            <h2 className="text-xl font-bold text-zinc-100 mb-1">Override Tier for Courier</h2>
            <p className="text-sm font-semibold text-zinc-300 mb-0.5">{selectedCourier.courier_name || `Courier ${String(selectedCourier.courier_id || '').slice(0, 8)}`}</p>
            <p className="text-xs text-zinc-500 font-mono mb-6 break-all">ID: {selectedCourier.courier_id}</p>
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">New Tier</label>
                <select 
                  className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all appearance-none"
                  value={newTier}
                  onChange={(e) => setNewTier(e.target.value)}
                >
                  <option value="standart" className="bg-zinc-900 text-zinc-200">Standart</option>
                  <option value="silver" className="bg-zinc-900 text-zinc-200">Silver</option>
                  <option value="gold" className="bg-zinc-900 text-zinc-200">Gold</option>
                  <option value="god_mode" className="bg-zinc-900 text-zinc-200">God Mode</option>
                </select>
              </div>
              
              <div>
                <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">Reason (Optional)</label>
                <textarea 
                  className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all placeholder:text-zinc-600"
                  rows={3}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. Manual promotion due to excellent offline behavior"
                ></textarea>
              </div>
            </div>

            <div className="mt-8 flex justify-end gap-3">
              <button 
                onClick={() => setSelectedCourier(null)}
                className="px-5 py-2.5 rounded-xl border border-white/10 text-sm font-bold text-zinc-400 hover:bg-white/5 hover:text-zinc-200 active:scale-95 transition-all"
              >
                Cancel
              </button>
              <button 
                onClick={() => mutation.mutate({ courierId: selectedCourier.courier_id, tier: newTier, note })}
                disabled={mutation.isPending}
                className="px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-bold shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
              >
                {mutation.isPending ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

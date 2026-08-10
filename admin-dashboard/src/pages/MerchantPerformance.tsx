import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Search, Store, Loader2 } from 'lucide-react';

// FOOD-BIKE-051: Dashboard performa merchant (food delivery)
// Completion rate, rata-rata prep time, rating, volume order.

interface MerchantPerformanceStats {
  merchant_id: string;
  nama_toko: string;
  is_open: boolean;
  verification_status: string;
  completion_rate_pct: number;
  total_orders: number;
  completed_orders: number;
  avg_prep_minutes: number | null;
  avg_rating: number;
  rating_count: number;
}

const fetchMerchantPerformance = async (search: string = '') => {
  const res = await api.get('/admin/merchants/performance', {
    params: { search }
  });
  return res.data.merchants as MerchantPerformanceStats[];
};

export default function MerchantPerformance() {
  const [searchTerm, setSearchTerm] = useState('');

  const { data: merchants, isLoading, error } = useQuery({
    queryKey: ['merchantPerformance', searchTerm],
    queryFn: () => fetchMerchantPerformance(searchTerm)
  });

  return (
    <div className="p-6 sm:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100">Merchant Performance</h1>
          <p className="text-xs text-zinc-400 mt-1">Completion rate, prep time, dan rating merchant food delivery</p>
        </div>
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
          <input 
            type="text" 
            placeholder="Search by name, phone, or email..." 
            className="w-full bg-white/5 border border-white/10 rounded-2xl py-2.5 pl-11 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all font-medium text-zinc-200 placeholder:text-zinc-600 shadow-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {isLoading ? (
        <div className="glass-card rounded-3xl p-12 flex flex-col items-center justify-center space-y-4">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
          <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Loading merchant performance...</p>
        </div>
      ) : error ? (
        <div className="glass-card rounded-3xl p-8 border-red-500/20 bg-red-500/5 text-red-400 font-semibold text-center">
          Failed to load merchant performance
        </div>
      ) : !merchants || merchants.length === 0 ? (
        <div className="glass-card rounded-3xl p-12 text-center">
          <Store className="w-12 h-12 text-zinc-700 mx-auto mb-3" />
          <p className="text-zinc-500 font-bold text-sm">No merchant performance records found</p>
        </div>
      ) : (
        <div className="glass-card rounded-3xl overflow-hidden border border-white/10 shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-white/5 text-zinc-500 text-[10px] font-black uppercase tracking-[0.2em] bg-white/[0.02]">
                  <th className="px-6 py-4">Merchant</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Completion</th>
                  <th className="px-6 py-4">Avg Prep</th>
                  <th className="px-6 py-4">Rating</th>
                  <th className="px-6 py-4 text-right">Orders</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {merchants.map((m, idx) => {
                  const completion = Number(m?.completion_rate_pct || 0).toFixed(1);
                  const rating = Number(m?.avg_rating || 0).toFixed(1);
                  const prep = m?.avg_prep_minutes != null ? `${Number(m.avg_prep_minutes).toFixed(0)} mnt` : '—';
                  const open = m?.is_open;
                  const verified = String(m?.verification_status || '').toLowerCase();
                  return (
                    <tr key={m?.merchant_id || idx} className="group hover:bg-white/[0.03] transition-all duration-200">
                      <td className="px-6 py-5">
                        <div className="font-bold text-zinc-100 text-sm">{m?.nama_toko || 'Unnamed'}</div>
                        <div className="text-[11px] text-zinc-500 font-mono mt-0.5">{m?.merchant_id || 'N/A'}</div>
                      </td>
                      <td className="px-6 py-5 whitespace-nowrap">
                        <span className={`px-3 py-1 inline-flex text-xs font-bold rounded-full border ${
                          verified === 'approved'
                            ? (open ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-zinc-500/10 text-zinc-300 border-zinc-500/20')
                            : verified === 'pending' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                            : 'bg-red-500/10 text-red-400 border-red-500/20'
                        }`}>
                          {open ? 'BUKA' : 'TUTUP'} • {verified.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-6 py-5 whitespace-nowrap text-sm font-semibold text-zinc-300">{completion}%</td>
                      <td className="px-6 py-5 whitespace-nowrap text-sm font-semibold text-zinc-300">{prep}</td>
                      <td className="px-6 py-5 whitespace-nowrap text-sm font-semibold text-zinc-300">⭐ {rating} <span className="text-[11px] text-zinc-500">({m?.rating_count || 0})</span></td>
                      <td className="px-6 py-5 whitespace-nowrap text-right text-sm font-semibold text-primary-light">
                        {m?.completed_orders || 0}<span className="text-zinc-600 font-normal"> / {m?.total_orders || 0}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

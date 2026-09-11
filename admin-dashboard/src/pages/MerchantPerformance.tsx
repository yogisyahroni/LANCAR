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
          <h1 className="text-2xl font-bold tracking-tight text-foreground-muted">Merchant Performance</h1>
          <p className="text-xs text-foreground-muted mt-1">Completion rate, prep time, dan rating merchant food delivery</p>
        </div>
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground-muted"  aria-hidden="true"/>
          <input 
            type="text" 
            aria-label="Search merchant performance by name, phone, or email"
            placeholder="Search by name, phone, or email..." 
            className="w-full bg-surface-subtle border border-border rounded-2xl py-2.5 pl-11 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all font-medium text-foreground-muted placeholder:text-foreground-muted shadow-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {isLoading ? (
        <div className="glass-card rounded-3xl p-12 flex flex-col items-center justify-center space-y-4">
          <Loader2 className="w-8 h-8 text-primary animate-spin" aria-hidden="true" />
          <p className="text-xs font-bold text-foreground-muted uppercase tracking-wide">Loading merchant performance...</p>
        </div>
      ) : error ? (
        <div className="glass-card rounded-3xl p-8 border-error bg-error-surface text-error font-semibold text-center">
          Failed to load merchant performance
        </div>
      ) : !merchants || merchants.length === 0 ? (
        <div className="glass-card rounded-3xl p-12 text-center">
          <Store className="w-12 h-12 text-foreground-muted mx-auto mb-3" aria-hidden="true" />
          <p className="text-foreground-muted font-bold text-sm">No merchant performance records found</p>
        </div>
      ) : (
        <div className="glass-card rounded-3xl overflow-hidden border border-border shadow-2xl">
          <div role="region" aria-label="Merchant performance table" tabIndex={0} className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border text-foreground-muted text-xs font-black uppercase tracking-wide bg-surface/[0.02]">
                  <th scope="col" className="px-6 py-4">Merchant</th>
                  <th scope="col" className="px-6 py-4">Status</th>
                  <th scope="col" className="px-6 py-4">Completion</th>
                  <th scope="col" className="px-6 py-4">Avg Prep</th>
                  <th scope="col" className="px-6 py-4">Rating</th>
                  <th scope="col" className="px-6 py-4 text-right">Orders</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {merchants.map((m, idx) => {
                  const completion = Number(m?.completion_rate_pct || 0).toFixed(1);
                  const rating = Number(m?.avg_rating || 0).toFixed(1);
                  const prep = m?.avg_prep_minutes != null ? `${Number(m.avg_prep_minutes).toFixed(0)} mnt` : '—';
                  const open = m?.is_open;
                  const verified = String(m?.verification_status || '').toLowerCase();
                  return (
                    <tr key={m?.merchant_id || idx} className="group hover:bg-surface/[0.03] transition-all duration-200">
                      <td className="px-6 py-5">
                        <div className="font-bold text-foreground-muted text-sm">{m?.nama_toko || 'Unnamed'}</div>
                        <div className="text-xs text-foreground-muted font-mono mt-0.5">{m?.merchant_id || 'N/A'}</div>
                      </td>
                      <td className="px-6 py-5 whitespace-nowrap">
                        <span className={`px-3 py-1 inline-flex text-xs font-bold rounded-full border ${
                          verified === 'approved'
                            ? (open ? 'bg-success-surface text-success border-success' : 'bg-surface-subtle text-foreground-muted border-border')
                            : verified === 'pending' ? 'bg-warning-surface text-warning border-warning'
                            : 'bg-error-surface text-error border-error'
                        }`}>
                          {open ? 'BUKA' : 'TUTUP'} • {verified.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-6 py-5 whitespace-nowrap text-sm font-semibold text-foreground-muted">{completion}%</td>
                      <td className="px-6 py-5 whitespace-nowrap text-sm font-semibold text-foreground-muted">{prep}</td>
                      <td className="px-6 py-5 whitespace-nowrap text-sm font-semibold text-foreground-muted">⭐ {rating} <span className="text-xs text-foreground-muted">({m?.rating_count || 0})</span></td>
                      <td className="px-6 py-5 whitespace-nowrap text-right text-sm font-semibold text-primary-light">
                        {m?.completed_orders || 0}<span className="text-foreground-muted font-normal"> / {m?.total_orders || 0}</span>
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

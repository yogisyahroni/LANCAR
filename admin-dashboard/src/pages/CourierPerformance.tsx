import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { toast } from 'sonner';

interface CourierPerformanceStats {
  courier_id: string;
  ontime_deliveries_count: number;
  total_deliveries_count: number;
  docs_complete_pct: number;
  avg_partner_rating: number;
  complaint_ratio_pct: number;
  relay_score: number;
  tier: string;
}

const fetchPerformance = async (search: string = '') => {
  const token = localStorage.getItem('token');
  const res = await axios.get(`http://localhost:8080/api/v1/admin/couriers/performance`, {
    headers: { 'X-User-ID': token || 'e5a1b3f9-8c2a-4a6f-9817-21b8c2c1f4e1' },
    params: { search }
  });
  return res.data.data as CourierPerformanceStats[];
};

const overrideTier = async ({ courierId, tier, note }: { courierId: string, tier: string, note: string }) => {
  const token = localStorage.getItem('token');
  const res = await axios.put(`http://localhost:8080/api/v1/admin/couriers/${courierId}/tier`, 
    { new_tier: tier, note },
    { headers: { 'X-User-ID': token || 'e5a1b3f9-8c2a-4a6f-9817-21b8c2c1f4e1' } }
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
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Courier Performance</h1>
        <input 
          type="text" 
          placeholder="Search by tier..." 
          className="px-4 py-2 border rounded-md shadow-sm"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {isLoading ? (
        <div className="animate-pulse bg-muted rounded-md h-64 w-full"></div>
      ) : error ? (
        <div className="text-destructive">Failed to load performance stats</div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Courier ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tier</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rating</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Orders</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Score</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {stats?.map((stat) => (
                <tr key={stat.courier_id} className="hover:bg-gray-50 transition-colors duration-200">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 truncate max-w-[150px]">{stat.courier_id}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      stat.tier.toLowerCase() === 'god_mode' ? 'bg-yellow-100 text-yellow-800' : 
                      stat.tier.toLowerCase() === 'gold' ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-800'
                    }`}>
                      {stat.tier.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{stat.avg_partner_rating.toFixed(1)}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{stat.total_deliveries_count}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{stat.relay_score.toFixed(1)}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button 
                      onClick={() => setSelectedCourier(stat)}
                      className="text-blue-600 hover:text-blue-900 transition-colors"
                    >
                      Override Tier
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedCourier && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 transition-all">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h2 className="text-xl font-bold mb-4">Override Tier for Courier</h2>
            <p className="text-sm text-gray-500 mb-4 break-all">ID: {selectedCourier.courier_id}</p>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">New Tier</label>
                <select 
                  className="w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 p-2 border"
                  value={newTier}
                  onChange={(e) => setNewTier(e.target.value)}
                >
                  <option value="standart">Standart</option>
                  <option value="silver">Silver</option>
                  <option value="gold">Gold</option>
                  <option value="god_mode">God Mode</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reason (Optional)</label>
                <textarea 
                  className="w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 p-2 border"
                  rows={3}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. Manual promotion due to excellent offline behavior"
                ></textarea>
              </div>
            </div>

            <div className="mt-6 flex justify-end space-x-3">
              <button 
                onClick={() => setSelectedCourier(null)}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 active:scale-95 transition-all"
              >
                Cancel
              </button>
              <button 
                onClick={() => mutation.mutate({ courierId: selectedCourier.courier_id, tier: newTier, note })}
                disabled={mutation.isPending}
                className="px-4 py-2 bg-blue-600 border border-transparent rounded-md text-sm font-medium text-white hover:bg-blue-700 active:scale-95 transition-all flex items-center"
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

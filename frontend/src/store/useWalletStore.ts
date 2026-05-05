import { create } from 'zustand';
import { api } from '@/lib/api';

interface WalletState {
  balance: number;
  currency: string;
  isLoading: boolean;
  error: string | null;
  fetchBalance: () => Promise<void>;
}

export const useWalletStore = create<WalletState>((set) => ({
  balance: 0,
  currency: 'IDR',
  isLoading: false,
  error: null,
  fetchBalance: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.get('/auth/web/wallet/balance');
      set({ 
        balance: response.data.balance, 
        currency: response.data.currency,
        isLoading: false 
      });
    } catch (err: any) {
      set({ 
        error: err.response?.data?.error || 'Failed to fetch balance', 
        isLoading: false 
      });
    }
  },
}));

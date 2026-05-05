import { create } from 'zustand';
import { api } from '@/lib/api';

interface WalletState {
  balance: number;
  currency: string;
  isLoading: boolean;
  error: string | null;
  fetchBalance: () => Promise<void>;
  topUp: (amount: number) => Promise<{ snap_token: string }>;
  withdraw: (details: { amount: number; bank_name: string; account_number: string; account_holder: string }) => Promise<void>;
}

export const useWalletStore = create<WalletState>((set, get) => ({
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
  topUp: async (amount: number) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.post('/auth/web/wallet/topup', { amount });
      set({ isLoading: false });
      return response.data;
    } catch (err: any) {
      const error = err.response?.data?.error || 'Failed to initiate top up';
      set({ error, isLoading: false });
      throw new Error(error);
    }
  },
  withdraw: async (details) => {
    set({ isLoading: true, error: null });
    try {
      await api.post('/auth/web/wallet/withdraw', details);
      set({ isLoading: false });
      // Refresh balance after withdrawal request (balance will be deducted)
      get().fetchBalance();
    } catch (err: any) {
      const error = err.response?.data?.error || 'Failed to request withdrawal';
      set({ error, isLoading: false });
      throw new Error(error);
    }
  },
}));

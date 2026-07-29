import { create } from 'zustand';
import { api } from '@/lib/api';

interface WalletState {
  balance: number;
  currency: string;
  isLoading: boolean;
  error: string | null;
  fetchBalance: () => Promise<void>;
  topUp: (amount: number, idempotencyKey?: string) => Promise<{ snap_token: string }>;
  withdraw: (details: { 
    amount: number; 
    bank_name?: string; 
    bank_code: string; 
    account_number: string; 
    account_holder: string;
    idempotency_key?: string;
  }) => Promise<void>;
}

export const useWalletStore = create<WalletState>((set, get) => ({
  balance: 0,
  currency: 'IDR',
  isLoading: false,
  error: null,
  fetchBalance: async () => {
    const state = get();
    // Prevent concurrent calls
    if (state.isLoading) return;
    set({ isLoading: true, error: null });
    try {
      const response = await api.get('/wallet/balance');
      set({ 
        balance: response.data.balance, 
        currency: response.data.currency,
        isLoading: false 
      });
    } catch (err: any) {
      // 401: wallet service has separate auth — show Rp 0, don't spam error
      if (err?.response?.status === 401 || err?.response?.status === 403) {
        set({ balance: 0, isLoading: false, error: null });
        return;
      }
      set({ 
        error: err.response?.data?.error || 'Failed to fetch balance', 
        isLoading: false 
      });
    }
  },

  topUp: async (amount: number, idempotencyKey?: string) => {
    set({ isLoading: true, error: null });
    try {
      const key = idempotencyKey || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `topup-${Date.now()}-${Math.random()}`);
      const response = await api.post('/wallet/topup', { 
        amount,
        idempotency_key: key 
      }, {
        headers: { 'X-Idempotency-Key': key }
      });
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
      const key = details.idempotency_key || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `withdraw-${Date.now()}-${Math.random()}`);
      await api.post('/wallet/withdraw', {
        ...details,
        idempotency_key: key
      }, {
        headers: { 'X-Idempotency-Key': key }
      });
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

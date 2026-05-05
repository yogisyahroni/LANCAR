'use client';

import { useEffect } from 'react';
import { useWalletStore } from '@/store/useWalletStore';
import { Wallet, Plus, ArrowUpRight, RefreshCw } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface WalletWidgetProps {
  isCollapsed?: boolean;
}

export default function WalletWidget({ isCollapsed }: WalletWidgetProps) {
  const { balance, currency, isLoading, fetchBalance } = useWalletStore();

  useEffect(() => {
    fetchBalance();
    // Refresh balance every 30 seconds
    const interval = setInterval(fetchBalance, 30000);
    return () => clearInterval(interval);
  }, [fetchBalance]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(value);
  };

  if (isCollapsed) {
    return (
      <div className="px-3 py-4 flex flex-col items-center gap-2">
        <div className="relative group">
          <div className="p-2 rounded-xl bg-primary/10 text-primary hover:bg-primary hover:text-white transition-all duration-300 cursor-pointer shadow-sm hover:shadow-primary/25">
            <Wallet size={20} />
          </div>
          {/* Tooltip for collapsed state */}
          <div className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50">
            {formatCurrency(balance)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-4 my-4 p-4 rounded-2xl bg-gradient-to-br from-gray-900/5 to-gray-900/10 dark:from-white/5 dark:to-white/10 border border-black/5 dark:border-white/10 backdrop-blur-md"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
          <Wallet size={14} className="text-primary" />
          <span className="text-[10px] font-bold uppercase tracking-wider">LANCAR Wallet</span>
        </div>
        <button 
          onClick={() => fetchBalance()}
          className={cn(
            "p-1 rounded-full hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-gray-400",
            isLoading && "animate-spin"
          )}
        >
          <RefreshCw size={12} />
        </button>
      </div>

      <div className="mb-4">
        <h3 className="text-xl font-bold tracking-tight text-gray-900 dark:text-white">
          {formatCurrency(balance)}
        </h3>
        <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">Saldo Tersedia</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button className="flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg bg-primary text-white text-[11px] font-semibold hover:scale-[1.02] active:scale-[0.98] transition-all shadow-sm shadow-primary/25">
          <Plus size={12} />
          Top Up
        </button>
        <button className="flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg bg-white/50 dark:bg-white/5 border border-black/5 dark:border-white/10 text-gray-700 dark:text-gray-300 text-[11px] font-semibold hover:bg-black/5 dark:hover:bg-white/10 transition-all">
          <ArrowUpRight size={12} />
          Tarik
        </button>
      </div>
    </motion.div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useWalletStore } from '@/store/useWalletStore';
import { Wallet, Plus, ArrowUpRight, RefreshCw, X, Loader2, Landmark, User, CreditCard } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

interface WalletWidgetProps {
  isCollapsed?: boolean;
}

declare global {
  interface Window {
    snap?: any;
  }
}

export default function WalletWidget({ isCollapsed }: WalletWidgetProps) {
  const { balance, currency, isLoading, fetchBalance, topUp, withdraw, error } = useWalletStore();
  const [showTopUp, setShowTopUp] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [amount, setAmount] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Withdrawal form state
  const [withdrawForm, setWithdrawForm] = useState({
    amount: '',
    bank_name: '',
    account_number: '',
    account_holder: ''
  });

  useEffect(() => {
    fetchBalance();
    const interval = setInterval(fetchBalance, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, [fetchBalance]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(value);
  };

  const handleTopUp = async () => {
    const numAmount = parseInt(amount);
    if (isNaN(numAmount) || numAmount < 10000) {
      alert('Minimal top up adalah Rp 10.000');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await topUp(numAmount);
      if (window.snap) {
        window.snap.pay(result.snap_token, {
          onSuccess: function(result: any) {
            alert('Top up berhasil!');
            fetchBalance();
            setShowTopUp(false);
            setAmount('');
          },
          onPending: function(result: any) {
            alert('Menunggu pembayaran...');
            setShowTopUp(false);
          },
          onError: function(result: any) {
            alert('Top up gagal!');
          },
          onClose: function() {
            console.log('Snap popup closed');
          }
        });
      } else {
        alert('Payment Gateway belum siap. Silakan coba lagi.');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleWithdraw = async () => {
    const numAmount = parseInt(withdrawForm.amount);
    if (isNaN(numAmount) || numAmount < 50000) {
      alert('Minimal penarikan adalah Rp 50.000');
      return;
    }
    
    if (!withdrawForm.bank_name || !withdrawForm.account_number || !withdrawForm.account_holder) {
      alert('Harap isi semua detail rekening');
      return;
    }

    if (numAmount + 5000 > balance) {
      alert('Saldo tidak cukup (termasuk biaya admin Rp 5.000)');
      return;
    }

    setIsSubmitting(true);
    try {
      await withdraw({
        amount: numAmount,
        bank_name: withdrawForm.bank_name,
        account_number: withdrawForm.account_number,
        account_holder: withdrawForm.account_holder
      });
      alert('Permintaan penarikan berhasil diajukan dan sedang diproses.');
      setShowWithdraw(false);
      setWithdrawForm({ amount: '', bank_name: '', account_number: '', account_holder: '' });
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isCollapsed) {
    return (
      <div className="px-3 py-4 flex flex-col items-center gap-2">
        <div className="relative group">
          <div className="p-2 rounded-xl bg-primary/10 text-primary hover:bg-primary hover:text-white transition-all duration-300 cursor-pointer shadow-sm hover:shadow-primary/25">
            <Wallet size={20} />
          </div>
          <div className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50">
            {formatCurrency(balance)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mx-4 my-4 p-4 rounded-2xl bg-gradient-to-br from-gray-900/5 to-gray-900/10 dark:from-white/5 dark:to-white/10 border border-black/5 dark:border-white/10 backdrop-blur-md shadow-lg"
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
            <div className="p-1.5 rounded-lg bg-primary/10">
              <Wallet size={14} className="text-primary" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider">TEMBUS Wallet</span>
          </div>
          <button 
            onClick={() => fetchBalance()}
            disabled={isLoading}
            className={cn(
              "p-1 rounded-full hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-gray-400",
              isLoading && "animate-spin"
            )}
          >
            <RefreshCw size={12} />
          </button>
        </div>

        <div className="mb-4">
          <h3 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
            {formatCurrency(balance)}
          </h3>
          <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">Saldo Tersedia</p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button 
            onClick={() => setShowTopUp(true)}
            className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-primary text-white text-[11px] font-bold hover:brightness-110 active:scale-[0.98] transition-all shadow-md shadow-primary/25"
          >
            <Plus size={14} />
            Top Up
          </button>
          <button 
            onClick={() => setShowWithdraw(true)}
            className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-white dark:bg-white/10 border border-black/5 dark:border-white/10 text-gray-700 dark:text-gray-200 text-[11px] font-bold hover:bg-gray-50 dark:hover:bg-white/20 transition-all shadow-sm"
          >
            <ArrowUpRight size={14} />
            Tarik
          </button>
        </div>
      </motion.div>

      {/* Top Up Modal */}
      <AnimatePresence>
        {showTopUp && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowTopUp(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-sm bg-white dark:bg-gray-900 rounded-3xl p-6 shadow-2xl border border-black/5 dark:border-white/10"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">Top Up Saldo</h2>
                <button onClick={() => setShowTopUp(false)} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-white/10 transition-colors">
                  <X size={20} className="text-gray-500" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">Pilih atau Input Nominal</label>
                  <div className="grid grid-cols-3 gap-2 mb-4">
                    {['50000', '100000', '200000'].map((val) => (
                      <button 
                        key={val}
                        onClick={() => setAmount(val)}
                        className={cn(
                          "py-2 rounded-xl border text-xs font-bold transition-all",
                          amount === val 
                            ? "bg-primary/10 border-primary text-primary" 
                            : "border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-400 hover:border-primary/50"
                        )}
                      >
                        {parseInt(val) / 1000}rb
                      </button>
                    ))}
                  </div>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">Rp</span>
                    <input 
                      type="number"
                      placeholder="0"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="w-full pl-12 pr-4 py-4 rounded-2xl bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 focus:outline-none focus:ring-2 focus:ring-primary/50 text-lg font-bold"
                    />
                  </div>
                </div>

                <p className="text-[10px] text-gray-400 text-center italic">
                  * Minimal top up Rp 10.000. Metode pembayaran tersedia: QRIS, VA, E-Wallet.
                </p>

                <button 
                  onClick={handleTopUp}
                  disabled={isSubmitting || !amount}
                  className="w-full py-4 rounded-2xl bg-primary text-white font-bold text-sm shadow-lg shadow-primary/25 disabled:opacity-50 disabled:shadow-none hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                >
                  {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : 'Lanjutkan Pembayaran'}
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Withdrawal Modal */}
        {showWithdraw && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowWithdraw(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-sm bg-white dark:bg-gray-900 rounded-3xl p-6 shadow-2xl border border-black/5 dark:border-white/10 overflow-y-auto max-h-[90vh]"
            >
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">Tarik Saldo</h2>
                  <p className="text-xs text-gray-500 mt-1">Saldo: {formatCurrency(balance)}</p>
                </div>
                <button onClick={() => setShowWithdraw(false)} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-white/10 transition-colors">
                  <X size={20} className="text-gray-500" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5 block">Nominal Penarikan</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-sm">Rp</span>
                    <input 
                      type="number"
                      placeholder="0"
                      value={withdrawForm.amount}
                      onChange={(e) => setWithdrawForm({...withdrawForm, amount: e.target.value})}
                      className="w-full pl-10 pr-4 py-3 rounded-xl bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 focus:outline-none focus:ring-2 focus:ring-primary/50 font-bold"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5 block">Informasi Rekening</label>
                  
                  <div className="relative">
                    <Landmark size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input 
                      type="text"
                      placeholder="Nama Bank (BCA, Mandiri, dll)"
                      value={withdrawForm.bank_name}
                      onChange={(e) => setWithdrawForm({...withdrawForm, bank_name: e.target.value})}
                      className="w-full pl-10 pr-4 py-3 rounded-xl bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 text-sm focus:outline-none"
                    />
                  </div>

                  <div className="relative">
                    <CreditCard size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input 
                      type="text"
                      placeholder="Nomor Rekening"
                      value={withdrawForm.account_number}
                      onChange={(e) => setWithdrawForm({...withdrawForm, account_number: e.target.value})}
                      className="w-full pl-10 pr-4 py-3 rounded-xl bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 text-sm focus:outline-none"
                    />
                  </div>

                  <div className="relative">
                    <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input 
                      type="text"
                      placeholder="Nama Pemilik Rekening"
                      value={withdrawForm.account_holder}
                      onChange={(e) => setWithdrawForm({...withdrawForm, account_holder: e.target.value})}
                      className="w-full pl-10 pr-4 py-3 rounded-xl bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 text-sm focus:outline-none"
                    />
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/50">
                  <p className="text-[10px] text-amber-700 dark:text-amber-400 leading-relaxed">
                    * Penarikan akan diproses dalam 1-3 hari kerja. Biaya admin flat **Rp 5.000** per transaksi.
                  </p>
                </div>

                <button 
                  onClick={handleWithdraw}
                  disabled={isSubmitting || !withdrawForm.amount}
                  className="w-full py-4 rounded-2xl bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-bold text-sm shadow-xl disabled:opacity-50 hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                >
                  {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : 'Ajukan Penarikan'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

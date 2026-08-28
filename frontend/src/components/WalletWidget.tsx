'use client';

import { useEffect, useState } from 'react';
import { useWalletStore } from '@/store/useWalletStore';
import { useAuthStore } from '@/store/authStore';

import { Wallet, Plus, ArrowUpRight, RefreshCw, X, Loader2, Landmark, User, CreditCard, CheckCircle2, AlertCircle, Info, ShieldCheck, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { clientLog } from '@/lib/clientLogger';

interface WalletWidgetProps {
  isCollapsed?: boolean;
}

declare global {
  interface Window {
    snap?: any;
  }
}

const BANK_OPTIONS = [
  { code: 'BCA', name: 'Bank BCA (Bank Central Asia)', type: 'BANK' },
  { code: 'MANDIRI', name: 'Bank Mandiri', type: 'BANK' },
  { code: 'BNI', name: 'Bank BNI', type: 'BANK' },
  { code: 'BRI', name: 'Bank BRI', type: 'BANK' },
  { code: 'BSI', name: 'Bank BSI (Syariah Indonesia)', type: 'BANK' },
  { code: 'CIMB', name: 'Bank CIMB Niaga', type: 'BANK' },
  { code: 'PERMATA', name: 'Bank Permata', type: 'BANK' },
  { code: 'GOPAY', name: 'GoPay E-Wallet', type: 'EWALLET' },
  { code: 'OVO', name: 'OVO E-Wallet', type: 'EWALLET' },
  { code: 'DANA', name: 'DANA E-Wallet', type: 'EWALLET' },
  { code: 'SHOPEEPAY', name: 'ShopeePay E-Wallet', type: 'EWALLET' },
];

export default function WalletWidget({ isCollapsed }: WalletWidgetProps) {
  const { balance, currency, isLoading, fetchBalance, topUp, withdraw, error } = useWalletStore();
  const [showTopUp, setShowTopUp] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [amountRaw, setAmountRaw] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Floating notification state (replaces browser alert())
  const [notification, setNotification] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);

  // Withdrawal form state
  const [withdrawForm, setWithdrawForm] = useState({
    amountRaw: '',
    bank_code: 'BCA',
    account_number: '',
    account_holder: ''
  });

  const showNotification = (type: 'success' | 'error' | 'info', message: string) => {
    setNotification({ type, message });
    setTimeout(() => {
      setNotification(null);
    }, 4500);
  };

  const { isAuthenticated } = useAuthStore();

  useEffect(() => {
    if (!isAuthenticated) return; // Don't fetch if not logged in — prevents 401 loop
    fetchBalance();
    const interval = setInterval(fetchBalance, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, [fetchBalance, isAuthenticated]);


  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(value);
  };

  const formatNumberInput = (raw: string) => {
    return raw.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  };

  const handleTopUp = async () => {
    const numAmount = parseInt(amountRaw, 10);
    if (isNaN(numAmount) || numAmount < 10000) {
      showNotification('error', 'Minimal top up saldo adalah Rp 10.000');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await topUp(numAmount);
      if (window.snap) {
        window.snap.pay(result.snap_token, {
          onSuccess: function() {
            showNotification('success', 'Top up saldo berhasil ditambahkan!');
            fetchBalance();
            setShowTopUp(false);
            setAmountRaw('');
          },
          onPending: function() {
            showNotification('info', 'Menunggu penyelesaian pembayaran oleh sistem...');
            setShowTopUp(false);
          },
          onError: function() {
            showNotification('error', 'Transaksi top up gagal atau dibatalkan.');
          },
          onClose: function() {
            clientLog.debug('Snap popup closed');
          }
        });
      } else {
        showNotification('error', 'Payment Gateway belum siap. Silakan coba beberapa saat lagi.');
      }
    } catch (err: any) {
      clientLog.error('Top up request failed', { error: err });
      showNotification('error', err.message || 'Gagal memulai transaksi top up.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleWithdraw = async () => {
    const numAmount = parseInt(withdrawForm.amountRaw, 10);
    if (isNaN(numAmount) || numAmount < 50000) {
      showNotification('error', 'Minimal penarikan dana adalah Rp 50.000');
      return;
    }
    
    if (!withdrawForm.account_number.trim() || !withdrawForm.account_holder.trim()) {
      showNotification('error', 'Harap lengkapi nomor rekening dan nama pemilik rekening.');
      return;
    }

    if (numAmount + 5000 > balance) {
      showNotification('error', 'Saldo tidak mencukupi (termasuk biaya admin BI-FAST Rp 5.000).');
      return;
    }

    const selectedBank = BANK_OPTIONS.find(b => b.code === withdrawForm.bank_code) || BANK_OPTIONS[0];

    setIsSubmitting(true);
    try {
      await withdraw({
        amount: numAmount,
        bank_code: selectedBank.code,
        bank_name: selectedBank.name,
        account_number: withdrawForm.account_number,
        account_holder: withdrawForm.account_holder
      });
      showNotification('success', 'Permintaan penarikan berhasil diajukan dan sedang diproses via BI-FAST.');
      setShowWithdraw(false);
      setWithdrawForm({ amountRaw: '', bank_code: 'BCA', account_number: '', account_holder: '' });
    } catch (err: any) {
      clientLog.error('Withdraw request failed', { error: err });
      showNotification('error', err.message || 'Gagal memproses penarikan dana.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const numWithdrawAmount = parseInt(withdrawForm.amountRaw || '0', 10);
  const adminFee = numWithdrawAmount > 0 ? 5000 : 0;
  const totalDeduction = numWithdrawAmount + adminFee;
  const isInsufficientBalance = totalDeduction > balance && numWithdrawAmount > 0;

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
          <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5 flex items-center gap-1">
            <ShieldCheck size={12} className="text-success" /> Saldo Terverifikasi (BI-FAST)
          </p>
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

      {/* Floating Notification Toast */}
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className="fixed top-6 right-6 z-[200] max-w-sm w-full p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-black/10 dark:border-white/10 shadow-2xl flex items-start gap-3 backdrop-blur-xl"
          >
            <div className={cn(
              "p-2 rounded-xl flex-shrink-0",
              notification.type === 'success' && "bg-success/10 text-success",
              notification.type === 'error' && "bg-rose-500/10 text-rose-500",
              notification.type === 'info' && "bg-info/10 text-info"
            )}>
              {notification.type === 'success' && <CheckCircle2 size={18} />}
              {notification.type === 'error' && <AlertCircle size={18} />}
              {notification.type === 'info' && <Info size={18} />}
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-xs font-bold uppercase tracking-wider text-gray-900 dark:text-white">
                {notification.type === 'success' ? 'Berhasil' : notification.type === 'error' ? 'Perhatian' : 'Informasi'}
              </h4>
              <p className="text-xs text-gray-600 dark:text-gray-300 mt-0.5 leading-relaxed">
                {notification.message}
              </p>
            </div>
            <button 
              onClick={() => setNotification(null)}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors p-1"
            >
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

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
              className="relative w-full max-w-md bg-white dark:bg-zinc-900 rounded-3xl p-6 shadow-2xl border border-black/5 dark:border-white/10 overflow-hidden"
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-primary/10 text-primary">
                    <Sparkles size={18} />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white leading-none">Top Up Saldo</h2>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">Sistem Otomatis Instant 24 Jam</p>
                  </div>
                </div>
                <button onClick={() => setShowTopUp(false)} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-white/10 transition-colors">
                  <X size={18} className="text-gray-500" />
                </button>
              </div>

              <div className="space-y-5">
                <div>
                  <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 block">Pilih Nominal Cepat</label>
                  <div className="grid grid-cols-3 gap-2 mb-4">
                    {['20000', '50000', '100000', '200000', '500000', '1000000'].map((val) => (
                      <button 
                        key={val}
                        onClick={() => setAmountRaw(val)}
                        className={cn(
                          "py-2.5 rounded-xl border text-xs font-bold transition-all flex flex-col items-center justify-center gap-0.5",
                          amountRaw === val 
                            ? "bg-primary/10 border-primary text-primary shadow-sm" 
                            : "border-gray-200 dark:border-zinc-800 text-gray-700 dark:text-gray-300 hover:border-primary/50 dark:bg-zinc-800/50"
                        )}
                      >
                        <span>{parseInt(val, 10) >= 1000000 ? `${parseInt(val, 10)/1000000} Juta` : `${parseInt(val, 10)/1000} Ribu`}</span>
                      </button>
                    ))}
                  </div>
                  <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 block">Atau Ketik Nominal Lain (Rp)</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">Rp</span>
                    <input 
                      type="text"
                      placeholder="0"
                      value={formatNumberInput(amountRaw)}
                      onChange={(e) => setAmountRaw(e.target.value.replace(/\D/g, ''))}
                      className="w-full pl-12 pr-4 py-3.5 rounded-2xl bg-gray-50 dark:bg-zinc-800/80 border border-gray-200 dark:border-white/10 focus:outline-none focus:ring-2 focus:ring-primary/50 text-lg font-bold text-gray-900 dark:text-white"
                    />
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl bg-info/5 dark:bg-info/10 border border-info/10 dark:border-info/20 flex items-start gap-2.5">
                  <ShieldCheck size={16} className="text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                  <p className="text-[11px] text-blue-700 dark:text-blue-300 leading-relaxed">
                    Mendukung pembayaran via **QRIS**, Virtual Account (BCA, Mandiri, BNI, BRI), dan E-Wallet (GoPay, OVO, DANA).
                  </p>
                </div>

                <button 
                  onClick={handleTopUp}
                  disabled={isSubmitting || !amountRaw || parseInt(amountRaw, 10) < 10000}
                  className="w-full py-4 rounded-2xl bg-primary text-white font-bold text-sm shadow-lg shadow-primary/25 disabled:opacity-50 disabled:shadow-none hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                >
                  {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : `Bayar ${amountRaw ? formatCurrency(parseInt(amountRaw, 10)) : ''}`}
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
              className="relative w-full max-w-md bg-white dark:bg-zinc-900 rounded-3xl p-6 shadow-2xl border border-black/5 dark:border-white/10 overflow-y-auto max-h-[90vh]"
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-success/10 text-success">
                    <ArrowUpRight size={18} />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white leading-none">Tarik Dana BI-FAST</h2>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">Saldo Tersedia: {formatCurrency(balance)}</p>
                  </div>
                </div>
                <button onClick={() => setShowWithdraw(false)} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-white/10 transition-colors">
                  <X size={18} className="text-gray-500" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 block">Nominal Penarikan</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-sm">Rp</span>
                    <input 
                      type="text"
                      placeholder="0"
                      value={formatNumberInput(withdrawForm.amountRaw)}
                      onChange={(e) => setWithdrawForm({...withdrawForm, amountRaw: e.target.value.replace(/\D/g, '')})}
                      className="w-full pl-10 pr-4 py-3 rounded-2xl bg-gray-50 dark:bg-zinc-800/80 border border-gray-200 dark:border-white/10 focus:outline-none focus:ring-2 focus:ring-primary/50 font-bold text-gray-900 dark:text-white"
                    />
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1">* Minimal pencairan Rp 50.000</p>
                </div>

                <div className="space-y-3">
                  <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 block">Tujuan Pencairan (Bank / E-Wallet)</label>
                  
                  <div className="relative">
                    <Landmark size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    <select 
                      value={withdrawForm.bank_code}
                      onChange={(e) => setWithdrawForm({...withdrawForm, bank_code: e.target.value})}
                      className="w-full pl-10 pr-4 py-3 rounded-2xl bg-gray-50 dark:bg-zinc-800/80 border border-gray-200 dark:border-white/10 text-sm font-semibold text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/50 appearance-none cursor-pointer"
                    >
                      <optgroup label="Bank Nasional & Syariah">
                        {BANK_OPTIONS.filter(b => b.type === 'BANK').map(bank => (
                          <option key={bank.code} value={bank.code} className="bg-white dark:bg-zinc-900 text-gray-900 dark:text-white py-1">
                            {bank.name}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="E-Wallet">
                        {BANK_OPTIONS.filter(b => b.type === 'EWALLET').map(ewallet => (
                          <option key={ewallet.code} value={ewallet.code} className="bg-white dark:bg-zinc-900 text-gray-900 dark:text-white py-1">
                            {ewallet.name}
                          </option>
                        ))}
                      </optgroup>
                    </select>
                  </div>

                  <div className="relative">
                    <CreditCard size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input 
                      type="text"
                      placeholder="Nomor Rekening / No. HP E-Wallet"
                      value={withdrawForm.account_number}
                      onChange={(e) => setWithdrawForm({...withdrawForm, account_number: e.target.value.replace(/\D/g, '')})}
                      className="w-full pl-10 pr-4 py-3 rounded-2xl bg-gray-50 dark:bg-zinc-800/80 border border-gray-200 dark:border-white/10 text-sm font-semibold text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                  </div>

                  <div className="relative">
                    <User size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input 
                      type="text"
                      placeholder="Nama Pemilik Rekening (Sesuai Buku Tabungan / KTP)"
                      value={withdrawForm.account_holder}
                      onChange={(e) => setWithdrawForm({...withdrawForm, account_holder: e.target.value})}
                      className="w-full pl-10 pr-4 py-3 rounded-2xl bg-gray-50 dark:bg-zinc-800/80 border border-gray-200 dark:border-white/10 text-sm font-semibold text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                  </div>
                </div>

                {/* Interactive Fee Breakdown Card */}
                <div className="p-3.5 rounded-2xl bg-gray-50 dark:bg-zinc-800/50 border border-black/5 dark:border-white/10 space-y-2">
                  <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                    <span>Nominal Penarikan</span>
                    <span className="font-semibold text-gray-900 dark:text-white">{formatCurrency(numWithdrawAmount)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                    <span>Biaya Admin (BI-FAST Flat)</span>
                    <span className="font-semibold text-amber-600 dark:text-amber-400">{formatCurrency(adminFee)}</span>
                  </div>
                  <div className="pt-2 border-t border-black/5 dark:border-white/10 flex justify-between text-xs font-bold text-gray-900 dark:text-white">
                    <span>Total Potongan Saldo</span>
                    <span className={isInsufficientBalance ? "text-rose-500" : "text-success"}>
                      {formatCurrency(totalDeduction)}
                    </span>
                  </div>
                  {isInsufficientBalance && (
                    <p className="text-[10px] text-rose-500 font-medium pt-1 flex items-center gap-1">
                      <AlertCircle size={12} /> Saldo tidak cukup untuk penarikan + biaya admin.
                    </p>
                  )}
                </div>

                <button 
                  onClick={handleWithdraw}
                  disabled={isSubmitting || !withdrawForm.amountRaw || isInsufficientBalance || parseInt(withdrawForm.amountRaw, 10) < 50000}
                  className="w-full py-4 rounded-2xl bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-bold text-sm shadow-xl disabled:opacity-50 hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                >
                  {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : `Ajukan Penarikan ${numWithdrawAmount ? formatCurrency(numWithdrawAmount) : ''}`}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

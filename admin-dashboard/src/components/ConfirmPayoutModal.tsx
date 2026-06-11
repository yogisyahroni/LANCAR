import { useState, useRef, useEffect } from 'react';
import { AlertTriangle, CheckCircle2, XCircle, Ban, Loader2, ShieldCheck } from 'lucide-react';
import { cn } from '../lib/utils';

// ─────────────────────────────────────────────────────────────────────────────
// S3-AD-01 Fix: Replace window.prompt() with a proper React modal.
//
// Problems solved:
//  1. window.prompt() can be blocked by enterprise browsers → action proceeds
//     with empty reason and no real confirmation.
//  2. No visual context — admin can't see courier name + amount before acting.
//  3. No input sanitization on reason field before it enters the audit log.
//  4. No XSS injection guard on the reason string.
// ─────────────────────────────────────────────────────────────────────────────

export type PayoutReviewAction = 'approve' | 'reject' | 'suspend_payout_account';

interface ConfirmPayoutModalProps {
  isOpen: boolean;
  action: PayoutReviewAction;
  courierName?: string;
  amountIdr?: number;
  reviewId: string;
  isPending?: boolean;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}

const ACTION_CONFIG = {
  approve: {
    title: 'Konfirmasi Approve Payout',
    description: 'Tindakan ini akan menyetujui payout dan memicu disbursement ke rekening kurir.',
    buttonLabel: 'Ya, Approve Payout',
    buttonClass: 'bg-emerald-600 hover:bg-emerald-500 text-white',
    icon: CheckCircle2,
    iconClass: 'text-emerald-400',
    severity: 'success' as const,
    defaultReason: 'Payout disetujui setelah verifikasi manual oleh treasury',
  },
  reject: {
    title: 'Konfirmasi Reject Payout',
    description: 'Tindakan ini akan menolak payout. Kurir dapat mengajukan ulang.',
    buttonLabel: 'Ya, Reject Payout',
    buttonClass: 'bg-red-600 hover:bg-red-500 text-white',
    icon: XCircle,
    iconClass: 'text-red-400',
    severity: 'danger' as const,
    defaultReason: 'Ditolak oleh treasury — verifikasi data lebih lanjut diperlukan',
  },
  suspend_payout_account: {
    title: 'Konfirmasi Suspend Akun Payout',
    description: 'Tindakan ini akan menangguhkan akun payout kurir. Semua payout akan diblokir sampai akun aktif kembali.',
    buttonLabel: 'Ya, Suspend Akun',
    buttonClass: 'bg-amber-600 hover:bg-amber-500 text-white',
    icon: Ban,
    iconClass: 'text-amber-400',
    severity: 'warning' as const,
    defaultReason: 'Akun payout ditangguhkan karena indikasi aktivitas mencurigakan',
  },
};

/**
 * Sanitizes a reason string before it enters the audit log.
 * Prevents control characters, excessive length, and leading formula chars
 * that could be executed in Excel (CSV injection).
 */
function sanitizeReason(input: string): string {
  // Strip control characters and null bytes
  // eslint-disable-next-line no-control-regex
  let safe = input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  // Prevent CSV formula injection (=, +, -, @, tab at start)
  if (/^[=+\-@\t]/.test(safe)) {
    safe = "'" + safe;
  }
  // Limit length (audit log field)
  return safe.slice(0, 500).trim();
}

export function ConfirmPayoutModal({
  isOpen,
  action,
  courierName,
  amountIdr,
  reviewId,
  isPending,
  onConfirm,
  onCancel,
}: ConfirmPayoutModalProps) {
  const config = ACTION_CONFIG[action];
  const [reason, setReason] = useState(config.defaultReason);
  const [reasonError, setReasonError] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const Icon = config.icon;

  // Reset reason when action changes
  useEffect(() => {
    setReason(ACTION_CONFIG[action].defaultReason);
    setReasonError('');
  }, [action, isOpen]);

  // Focus textarea when modal opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isPending) onCancel();
    };
    if (isOpen) document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, isPending, onCancel]);

  if (!isOpen) return null;

  const handleConfirm = () => {
    const sanitized = sanitizeReason(reason);
    if (sanitized.length < 10) {
      setReasonError('Alasan minimal 10 karakter');
      return;
    }
    setReasonError('');
    onConfirm(sanitized);
  };

  const formattedAmount = amountIdr
    ? `Rp ${Number(amountIdr).toLocaleString('id-ID')}`
    : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="payout-modal-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={!isPending ? onCancel : undefined}
      />

      {/* Modal card */}
      <div className="relative w-full max-w-md bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-start gap-4 p-6 border-b border-zinc-800">
          <div className={cn(
            'flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center',
            config.severity === 'success' ? 'bg-emerald-500/15' :
            config.severity === 'danger' ? 'bg-red-500/15' :
            'bg-amber-500/15'
          )}>
            <Icon className={cn('w-5 h-5', config.iconClass)} />
          </div>
          <div>
            <h2
              id="payout-modal-title"
              className="text-base font-bold text-zinc-100"
            >
              {config.title}
            </h2>
            <p className="text-sm text-zinc-400 mt-0.5">
              {config.description}
            </p>
          </div>
        </div>

        {/* Context info */}
        <div className="p-6 space-y-4">
          {/* Payout details */}
          <div className="rounded-xl bg-zinc-800/50 border border-zinc-700/50 divide-y divide-zinc-700/50">
            {courierName && (
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-xs text-zinc-500 uppercase tracking-wider">Kurir</span>
                <span className="text-sm font-semibold text-zinc-200">{courierName}</span>
              </div>
            )}
            {formattedAmount && (
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-xs text-zinc-500 uppercase tracking-wider">Nominal</span>
                <span className={cn(
                  'text-sm font-bold',
                  action === 'approve' ? 'text-emerald-400' : 'text-zinc-200'
                )}>{formattedAmount}</span>
              </div>
            )}
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-xs text-zinc-500 uppercase tracking-wider">Review ID</span>
              <span className="text-xs font-mono text-zinc-400">{reviewId.slice(0, 12)}…</span>
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-xs text-zinc-500 uppercase tracking-wider">Tindakan</span>
              <span className={cn(
                'text-xs font-bold uppercase tracking-wide px-2 py-0.5 rounded',
                config.severity === 'success' ? 'bg-emerald-500/15 text-emerald-400' :
                config.severity === 'danger' ? 'bg-red-500/15 text-red-400' :
                'bg-amber-500/15 text-amber-400'
              )}>
                {action}
              </span>
            </div>
          </div>

          {/* Reason input */}
          <div>
            <label
              htmlFor="payout-reason"
              className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2"
            >
              Alasan Review <span className="text-red-400">*</span>
            </label>
            <textarea
              id="payout-reason"
              ref={textareaRef}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                if (reasonError) setReasonError('');
              }}
              disabled={isPending}
              rows={3}
              maxLength={500}
              placeholder="Masukkan alasan review yang jelas dan terperinci..."
              className={cn(
                'w-full rounded-xl bg-zinc-800 border px-4 py-3 text-sm text-zinc-100',
                'placeholder:text-zinc-600 resize-none',
                'focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                reasonError ? 'border-red-500/70' : 'border-zinc-700'
              )}
            />
            {reasonError && (
              <p className="mt-1 text-xs text-red-400 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                {reasonError}
              </p>
            )}
            <p className="mt-1 text-xs text-zinc-600 text-right">
              {reason.length}/500
            </p>
          </div>

          {/* High-value warning */}
          {formattedAmount && amountIdr && amountIdr >= 5_000_000 && action === 'approve' && (
            <div className="flex items-start gap-3 rounded-xl bg-amber-500/10 border border-amber-500/20 px-4 py-3">
              <ShieldCheck className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-300">
                <strong>Nominal besar (&ge;Rp 5jt).</strong> Pastikan Anda telah memverifikasi
                identitas kurir, history pengiriman, dan tidak ada tanda fraud sebelum approve.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 pb-6">
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-all disabled:opacity-50"
          >
            Batal
          </button>
          <button
            id="payout-confirm-btn"
            type="button"
            onClick={handleConfirm}
            disabled={isPending || reason.trim().length < 10}
            className={cn(
              'px-5 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              config.buttonClass
            )}
          >
            {isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Memproses...
              </>
            ) : (
              <>
                <Icon className="w-4 h-4" />
                {config.buttonLabel}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

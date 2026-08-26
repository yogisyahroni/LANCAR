import { useState } from 'react'
import type { SectionProps } from './types'
import { serviceLabel, payoutStatusLabel, riskActionLabel } from './FinanceHelpers'

export function TreasurySection({ view }: SectionProps) {
  const {
    financialData, payouts, payoutAccounts, payoutRequests, payoutOps, payoutReviewQueue,
    payoutReviewDetail, serviceSettlementSummary, cashPosition, pnlReport, taxDashboard,
    pphReport, trialBalanceData, ledgerEntriesData, reconciliationSummary, unitEconomicsData,
    closingPeriods, closingPnl, closingTB, closingCashLiability, closingTaxSummary,
    closingSettlementOutstanding,
    isLoadingStats, isLoadingServiceSettlement, isLoadingPnl, isLoadingTax, isLoadingPph,
    isLoadingTrialBalance, isLoadingLedgerEntries, isLoadingRecon, isLoadingUnitEconomics,
    isLoadingPeriods, isLoadingClosingPnl, isLoadingClosingTB, isLoadingCashLiability,
    isLoadingTaxSummary, isLoadingSettlementOutstanding, isLoadingCashPosition,
    stats, revenueBreakdown, emergencyFund, opsCounts, latestReconItems, formatCurrency,
    serviceSettlementRows, serviceSettlementTotals, activeReviewId, reviewRequest,
    reviewRisk, reviewAccount,
    pnlPeriod, pphPeriod, closingPeriod, totpInput, ledgerStartDate, ledgerEndDate,
    ledgerAccountFilter, ledgerJournalTypeFilter, simInfraCost, simSalaryCost, simReserveCost,
    setActiveTab, setSelectedReviewId, setPnlPeriod, setPphPeriod, setClosingPeriod,
    setTotpInput, setLedgerStartDate, setLedgerEndDate, setLedgerAccountFilter,
    setLedgerJournalTypeFilter, setSimInfraCost, setSimSalaryCost, setSimReserveCost,
    runReviewAction, handleExportEfaktur, handleExportPPh23,
    updatePayoutAccountMutation, updatePayoutRequestMutation, payoutReviewActionMutation,
    dispatchApprovedPayoutsMutation, reconcilePayoutsMutation, releaseMutation,
    batchReleaseMutation, topUpMutation, lockPeriodMutation, runReconciliationMutation,
  } = view

  return (
      <div className="space-y-8">

      <div className="glass-card rounded-[44px] border-white/5 overflow-hidden">
        <div className="p-8 border-b border-white/5 flex flex-col xl:flex-row xl:items-center justify-between gap-6">
          <div>
            <h3 className="text-2xl font-black text-zinc-100 italic uppercase flex items-center gap-3">
              <Receipt className="text-emerald-400" size={26} />
              Service Settlement Snapshot
            </h3>
            <p className="text-sm text-zinc-500 mt-1">Gross, fee platform, earning kurir, settlement merchant, adjustment, refund, dan cancel fee 30 hari terakhir.</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 min-w-0 xl:min-w-[720px]">
            {[
              { label: 'Gross', value: serviceSettlementTotals.gross_idr, color: 'text-emerald-400' },
              { label: 'Platform Fee', value: serviceSettlementTotals.platform_fee_idr, color: 'text-primary-light' },
              { label: 'Courier Earning', value: serviceSettlementTotals.courier_earning_idr, color: 'text-blue-300' },
              { label: 'Merchant Settle', value: serviceSettlementTotals.merchant_settlement_idr, color: 'text-amber-300' },
              { label: 'Adjustment', value: serviceSettlementTotals.adjustment_idr, color: 'text-violet-300' },
              { label: 'Refund', value: serviceSettlementTotals.refund_idr, color: 'text-red-300' },
              { label: 'Cancel Fee', value: serviceSettlementTotals.cancel_fee_idr, color: 'text-orange-300' },
              { label: 'Net', value: serviceSettlementTotals.net_after_settlement_idr, color: 'text-zinc-100' },
            ].map((item) => (
              <div key={item.label} className="rounded-2xl bg-white/[0.03] border border-white/5 p-4">
                <p className="text-[9px] font-black uppercase tracking-widest text-zinc-600">{item.label}</p>
                <p className={cn("mt-2 text-sm font-black leading-tight", item.color)}>{formatCurrency(item.value || 0)}</p>
              </div>
            ))}
          </div>
        </div>

        {isLoadingServiceSettlement ? (
          <div className="py-16 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
            <p className="text-xs font-black text-zinc-500 uppercase tracking-widest">Menghitung settlement snapshot...</p>
          </div>
        ) : serviceSettlementRows.length === 0 ? (
          <div className="py-16 text-center">
            <Receipt className="mx-auto text-zinc-700" size={42} />
            <p className="mt-4 text-sm font-black text-zinc-500 uppercase tracking-widest">Belum ada order delivered/completed 30 hari terakhir.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-white/5 text-zinc-600 text-[10px] font-black uppercase tracking-[0.2em]">
                  <th className="px-8 py-4">Service</th>
                  <th className="px-6 py-4 text-right">Gross</th>
                  <th className="px-6 py-4 text-right">Platform Fee</th>
                  <th className="px-6 py-4 text-right">Courier</th>
                  <th className="px-6 py-4 text-right">Merchant</th>
                  <th className="px-6 py-4 text-right">Refund</th>
                  <th className="px-6 py-4 text-right">Cancel Fee</th>
                  <th className="px-8 py-4 text-right">Net</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {serviceSettlementRows.map((row: any) => (
                  <tr key={row.service_bucket} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-8 py-5">
                      <p className="text-sm font-black text-zinc-100">{serviceLabel(row.service_bucket)}</p>
                      <p className="mt-1 text-[10px] font-black uppercase tracking-widest text-zinc-600">
                        {row.delivered_orders || 0} delivered
                        {row.open_settlement_count ? ` • ${row.open_settlement_count} open settlement` : ''}
                      </p>
                    </td>
                    <td className="px-6 py-5 text-right text-sm font-black text-emerald-300">{formatCurrency(row.gross_idr)}</td>
                    <td className="px-6 py-5 text-right text-sm font-black text-primary-light">{formatCurrency(row.platform_fee_idr)}</td>
                    <td className="px-6 py-5 text-right text-sm font-black text-blue-300">{formatCurrency(row.courier_earning_idr)}</td>
                    <td className="px-6 py-5 text-right text-sm font-black text-amber-300">{formatCurrency(row.merchant_settlement_idr)}</td>
                    <td className="px-6 py-5 text-right text-sm font-black text-red-300">
                      {formatCurrency(row.refund_idr)}
                      {row.refund_count ? <span className="block text-[10px] text-zinc-600">{row.refund_count} refund</span> : null}
                    </td>
                    <td className="px-6 py-5 text-right text-sm font-black text-orange-300">
                      {formatCurrency(row.cancel_fee_idr)}
                      {row.cancel_fee_count ? <span className="block text-[10px] text-zinc-600">{row.cancel_fee_count} fee</span> : null}
                    </td>
                    <td className="px-8 py-5 text-right text-sm font-black text-zinc-100">{formatCurrency(row.net_after_settlement_idr)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">

        <div className="glass-card p-8 rounded-[40px] border-white/5 space-y-6">
          <h3 className="text-xl font-black text-zinc-100 italic uppercase">Auto Payout Control</h3>
          <div className="grid grid-cols-3 gap-3">
            {[
              ['Auto', opsCounts.auto_approved_count || 0, 'text-emerald-400'],
              ['Manual', opsCounts.manual_review_count || 0, 'text-amber-400'],
              ['Blocked', opsCounts.blocked_count || 0, 'text-red-400'],
            ].map(([label, value, color]) => (
              <div key={label as string} className="rounded-2xl bg-white/[0.03] border border-white/5 p-4">
                <p className="text-[9px] font-black uppercase tracking-widest text-zinc-600">{label}</p>
                <p className={cn("text-3xl font-black mt-2", color as string)}>{value}</p>
              </div>
            ))}
          </div>
          <div className="rounded-2xl bg-black/20 border border-white/5 p-4">
            <p className="text-[9px] font-black uppercase tracking-widest text-zinc-600">Failed Monitor</p>
            <div className="mt-3 grid grid-cols-3 gap-3 text-center">
              <span className="text-xs text-zinc-400">1h <b className="text-red-400">{payoutOps?.failed_monitor?.failed_last_hour || 0}</b></span>
              <span className="text-xs text-zinc-400">24h <b className="text-red-400">{payoutOps?.failed_monitor?.failed_last_day || 0}</b></span>
              <span className="text-xs text-zinc-400">Stale <b className="text-amber-400">{payoutOps?.failed_monitor?.stale_processing || 0}</b></span>
            </div>
          </div>
        </div>

        <div className="glass-card p-8 rounded-[40px] border-white/5 space-y-5">
          <h3 className="text-xl font-black text-zinc-100 italic uppercase">Risk Reason Breakdown</h3>
          <div className="space-y-3 max-h-[240px] overflow-y-auto pr-1">
            {payoutOps?.risk_reason_breakdown?.map((item: any) => (
              <div key={item.reason} className="flex items-center justify-between gap-4 rounded-2xl bg-white/[0.03] border border-white/5 p-4">
                <p className="text-xs font-bold text-zinc-300 line-clamp-2">{item.reason}</p>
                <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-black text-primary-light">{item.count}</span>
              </div>
            ))}
            {(!payoutOps?.risk_reason_breakdown || payoutOps.risk_reason_breakdown.length === 0) && (
              <p className="py-8 text-center text-sm font-bold text-zinc-500">Belum ada alasan risk aktif.</p>
            )}
          </div>
        </div>

        <div className="glass-card p-8 rounded-[40px] border-white/5 space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-black text-zinc-100 italic uppercase">Reconciliation</h3>
            <span className={cn(
              "rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest",
              (payoutOps?.reconciliation?.mismatch_count || 0) > 0 ? "bg-red-500/10 text-red-400" : "bg-emerald-500/10 text-emerald-400"
            )}>
              {payoutOps?.reconciliation?.mismatch_count || 0} mismatch
            </span>
          </div>
          <div className="space-y-3 max-h-[240px] overflow-y-auto pr-1">
            {latestReconItems.slice(0, 6).map((item: any) => (
              <div key={item.id} className="rounded-2xl bg-white/[0.03] border border-white/5 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-black text-zinc-200 uppercase">{String(item.check_type || '').replaceAll('_', ' ')}</p>
                  <span className={cn("text-[10px] font-black uppercase", item.severity === 'critical' ? "text-red-400" : "text-amber-400")}>{item.severity}</span>
                </div>
                <p className="mt-2 text-[11px] text-zinc-500">{item.expected_value || '-'} {'->'} {item.actual_value || '-'}</p>
              </div>
            ))}
            {latestReconItems.length === 0 && (
              <p className="py-8 text-center text-sm font-bold text-zinc-500">Belum ada mismatch pada run terakhir.</p>
            )}
          </div>
        </div>
      </div>

      <div className="glass-card rounded-[44px] border-white/5 overflow-hidden">
        <div className="p-8 border-b border-white/5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h3 className="text-2xl font-black text-zinc-100 italic uppercase flex items-center gap-3">
              <FileSearch className="text-amber-400" size={26} />
              Manual Review Queue
            </h3>
            <p className="text-sm text-zinc-500 mt-1">Prioritas berdasarkan risk score, status hold/block, nominal, dan aging request.</p>
          </div>
          <div className="grid grid-cols-3 gap-3 min-w-[320px]">
            <div className="rounded-2xl bg-white/[0.03] border border-white/5 p-3">
              <p className="text-[9px] font-black uppercase tracking-widest text-zinc-600">Queue</p>
              <p className="text-2xl font-black text-zinc-100">{payoutReviewQueue?.length || 0}</p>
            </div>
            <div className="rounded-2xl bg-red-500/10 border border-red-500/10 p-3">
              <p className="text-[9px] font-black uppercase tracking-widest text-red-400/70">Critical</p>
              <p className="text-2xl font-black text-red-400">
                {payoutReviewQueue?.filter((item: any) => item.status === 'blocked' || item.risk_level === 'critical').length || 0}
              </p>
            </div>
            <div className="rounded-2xl bg-amber-500/10 border border-amber-500/10 p-3">
              <p className="text-[9px] font-black uppercase tracking-widest text-amber-400/70">High</p>
              <p className="text-2xl font-black text-amber-400">
                {payoutReviewQueue?.filter((item: any) => item.risk_level === 'high').length || 0}
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[420px_1fr]">
          <div className="border-r border-white/5 p-6 space-y-3 max-h-[720px] overflow-y-auto">
            {payoutReviewQueue?.map((item: any) => (
              <button
                key={item.id}
                onClick={() => setSelectedReviewId(item.id)}
                className={cn(
                  "w-full text-left rounded-[28px] border p-5 transition-all",
                  activeReviewId === item.id
                    ? "bg-amber-500/10 border-amber-500/30"
                    : "bg-white/[0.02] border-white/5 hover:bg-white/[0.04]"
                )}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-zinc-100">{item.courier_name}</p>
                    <p className="mt-1 text-[11px] font-mono text-zinc-500">{item.request_number}</p>
                  </div>
                  <span className={cn(
                    "rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest",
                    item.status === 'blocked' ? "bg-red-500/10 text-red-400" :
                    item.risk_level === 'high' || item.risk_level === 'critical' ? "bg-amber-500/10 text-amber-400" :
                    "bg-white/5 text-zinc-400"
                  )}>
                    {item.risk_score || 0}
                  </span>
                </div>
                <div className="mt-4 flex items-center justify-between gap-3">
                  <p className="text-sm font-black text-zinc-100">{formatCurrency(item.amount_idr)}</p>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">{payoutStatusLabel(item)}</p>
                </div>
                {item.risk_reasons?.length > 0 && (
                  <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-zinc-400">{item.risk_reasons.slice(0, 2).join(' • ')}</p>
                )}
              </button>
            ))}
            {(!payoutReviewQueue || payoutReviewQueue.length === 0) && (
              <div className="py-16 text-center text-sm font-bold text-zinc-500">Tidak ada payout yang perlu manual review.</div>
            )}
          </div>

          <div className="p-8 space-y-6">
            {reviewRequest ? (
              <>
                <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-6">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.24em] text-zinc-600">Review Case</p>
                    <h4 className="mt-2 text-3xl font-black text-zinc-100">{reviewRequest.courier_name}</h4>
                    <p className="mt-1 text-sm text-zinc-500">{reviewRequest.request_number} • {format(new Date(reviewRequest.requested_at), 'dd MMM yyyy HH:mm')}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3 min-w-[320px]">
                    <div className="rounded-2xl bg-black/20 border border-white/5 p-4">
                      <p className="text-[9px] font-black uppercase tracking-widest text-zinc-600">Risk Score</p>
                      <p className={cn("mt-2 text-3xl font-black", (reviewRisk?.score || 0) >= 80 ? "text-red-400" : "text-amber-400")}>{reviewRisk?.score || 0}</p>
                    </div>
                    <div className="rounded-2xl bg-black/20 border border-white/5 p-4">
                      <p className="text-[9px] font-black uppercase tracking-widest text-zinc-600">Nominal</p>
                      <p className="mt-3 text-lg font-black text-zinc-100">{formatCurrency(reviewRequest.amount_idr)}</p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div className="rounded-[28px] border border-red-500/10 bg-red-500/[0.03] p-5 lg:col-span-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-red-400 flex items-center gap-2">
                      <AlertTriangle size={14} />
                      Alasan Hold / Block
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {(reviewRisk?.reasons || []).map((reason: string) => (
                        <span key={reason} className="rounded-full bg-black/20 border border-white/5 px-3 py-2 text-xs font-bold text-zinc-300">{reason}</span>
                      ))}
                      {(!reviewRisk?.reasons || reviewRisk.reasons.length === 0) && (
                        <span className="text-sm font-bold text-zinc-500">Tidak ada alasan risk aktif.</span>
                      )}
                    </div>
                  </div>
                  <div className="rounded-[28px] border border-white/5 bg-white/[0.02] p-5">
                    <p className="text-[10px] font-black uppercase tracking-widest text-zinc-600">Rekening Tujuan</p>
                    <p className="mt-4 text-lg font-black text-zinc-100">{reviewAccount?.bank_code || '-'}</p>
                    <p className="mt-1 text-sm text-zinc-400">{reviewAccount?.account_number || '-'}</p>
                    <p className="mt-1 text-xs text-zinc-500">{reviewAccount?.account_name || '-'}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="rounded-[28px] border border-white/5 bg-white/[0.02] p-5 space-y-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-zinc-600 flex items-center gap-2">
                      <Smartphone size={14} />
                      Device / IP Metadata
                    </p>
                    <div className="grid grid-cols-1 gap-3 text-sm">
                      <div className="flex justify-between gap-4"><span className="text-zinc-500">Device</span><b className="text-zinc-200 truncate">{reviewRisk?.device_id || '-'}</b></div>
                      <div className="flex justify-between gap-4"><span className="text-zinc-500">IP Address</span><b className="text-zinc-200">{reviewRisk?.ip_address || '-'}</b></div>
                      <div className="flex justify-between gap-4"><span className="text-zinc-500">User Agent</span><b className="text-zinc-200 truncate">{reviewRisk?.user_agent || '-'}</b></div>
                    </div>
                  </div>

                  <div className="rounded-[28px] border border-white/5 bg-white/[0.02] p-5 space-y-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-zinc-600">Ledger Source</p>
                    <div className="space-y-2 max-h-[180px] overflow-y-auto pr-1">
                      {payoutReviewDetail?.ledger_sources?.slice(0, 6).map((ledger: any) => (
                        <div key={ledger.id} className="flex items-center justify-between gap-4 rounded-2xl bg-black/20 border border-white/5 px-4 py-3">
                          <div>
                            <p className="text-xs font-black text-zinc-200">{ledger.transaction_type}</p>
                            <p className="text-[11px] text-zinc-500">{ledger.description || ledger.source}</p>
                          </div>
                          <span className={cn("text-sm font-black", ledger.direction === 'credit' ? "text-emerald-400" : "text-red-400")}>{formatCurrency(ledger.amount_idr)}</span>
                        </div>
                      ))}
                      {(!payoutReviewDetail?.ledger_sources || payoutReviewDetail.ledger_sources.length === 0) && (
                        <p className="py-8 text-center text-sm font-bold text-zinc-500">Belum ada ledger source.</p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="rounded-[28px] border border-white/5 bg-white/[0.02] p-5 space-y-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-zinc-600">History Payout Kurir</p>
                    <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                      {payoutReviewDetail?.payout_history?.map((history: any) => (
                        <div key={history.id} className="flex items-center justify-between gap-4 rounded-2xl bg-black/20 border border-white/5 px-4 py-3">
                          <div>
                            <p className="text-xs font-black text-zinc-200">{history.request_number}</p>
                            <p className="text-[11px] text-zinc-500">{format(new Date(history.requested_at), 'dd MMM HH:mm')}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-black text-zinc-100">{formatCurrency(history.amount_idr)}</p>
                            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">{history.status}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-[28px] border border-white/5 bg-white/[0.02] p-5 space-y-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-zinc-600">Audit Trail Terakhir</p>
                    <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                      {payoutReviewDetail?.security_events?.slice(0, 8).map((event: any) => (
                        <div key={event.id} className="rounded-2xl bg-black/20 border border-white/5 px-4 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-xs font-black text-zinc-200">{String(event.event_type || '').replaceAll('_', ' ')}</p>
                            <p className="text-[10px] font-bold text-zinc-500">{format(new Date(event.created_at), 'dd MMM HH:mm')}</p>
                          </div>
                          <p className="mt-1 text-[11px] text-zinc-500">{event.old_status || '-'} {'->'} {event.new_status || '-'}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="rounded-[28px] border border-amber-500/10 bg-amber-500/[0.03] p-5">
                  <p className="text-[10px] font-black uppercase tracking-widest text-amber-400">Admin Actions</p>
                  <p className="mt-2 text-sm text-zinc-500">Semua aksi di bawah wajib TOTP melalui middleware admin dan dicatat ke audit trail payout.</p>
                  <div className="mt-5 flex flex-wrap gap-3">
                    <button
                      onClick={() => runReviewAction('approve')}
                      disabled={payoutReviewActionMutation.isPending || reviewRequest.status === 'blocked'}
                      className="px-5 py-3 rounded-2xl bg-emerald-500 text-white font-black text-xs uppercase tracking-widest disabled:opacity-40"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => runReviewAction('reject')}
                      disabled={payoutReviewActionMutation.isPending}
                      className="px-5 py-3 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 font-black text-xs uppercase tracking-widest disabled:opacity-40"
                    >
                      Reject
                    </button>
                    <button
                      onClick={() => runReviewAction('request_more_verification')}
                      disabled={payoutReviewActionMutation.isPending}
                      className="px-5 py-3 rounded-2xl bg-white/5 border border-white/10 text-zinc-300 font-black text-xs uppercase tracking-widest disabled:opacity-40"
                    >
                      Request Verification
                    </button>
                    <button
                      onClick={() => runReviewAction('suspend_payout_account')}
                      disabled={payoutReviewActionMutation.isPending}
                      className="px-5 py-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 font-black text-xs uppercase tracking-widest disabled:opacity-40"
                    >
                      Suspend Account
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="py-28 text-center">
                <FileSearch className="mx-auto text-zinc-700" size={54} />
                <p className="mt-4 text-lg font-black text-zinc-400">Pilih request untuk investigasi.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Primary Financial Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {stats.map((stat: any, i: number) => {
          const icons: Record<string, any> = {
            'Gross Revenue': DollarSign,
            'Net Profit': TrendingUp,
            'Operational Cost': TrendingDown
          };
          const colors: Record<string, string> = {
            'Gross Revenue': 'text-emerald-400',
            'Net Profit': 'text-primary-light',
            'Operational Cost': 'text-red-400'
          };
          const Icon = icons[stat.label] || DollarSign;
          
          return (
            <div key={i} className="glass-card p-10 rounded-[48px] border-white/5 group hover:border-white/10 transition-all">
              <div className="flex items-start justify-between">
                  <div className={cn("p-4 rounded-2xl bg-white/5", colors[stat.label])}>
                    <Icon size={28} />
                  </div>
                  <div className={cn(
                    "flex items-center gap-1 text-[10px] font-black px-2 py-1 rounded-full",
                    stat.up ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
                  )}>
                    {stat.up ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
                    {stat.change}
                  </div>
              </div>
              <div className="mt-8">
                  <p className="text-xs font-black text-zinc-600 uppercase tracking-widest">{stat.label}</p>
                  <p className="text-4xl font-black text-zinc-100 mt-2 tracking-tighter">
                    Rp {stat.value.toLocaleString()}
                  </p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
         {/* Revenue Breakdown Donut */}
        <div className="glass-card p-10 rounded-[48px] border-white/5 space-y-10">
           <div className="flex items-center justify-between">
              <h3 className="text-xl font-black text-zinc-100 flex items-center gap-3">
                 <PieIcon className="text-primary-light" size={24} />
                 Model Breakdown
              </h3>
              <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Revenue Share %</p>
           </div>
           <div className="flex flex-col md:flex-row items-center gap-12">
              <div className="h-[280px] w-[280px] relative min-w-0 min-h-0">
                 <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                    <PieChart>
                       <Pie
                          data={revenueBreakdown}
                          cx="50%"
                          cy="50%"
                          innerRadius={80}
                          outerRadius={110}
                          paddingAngle={8}
                          dataKey="value"
                       >
                          {revenueBreakdown.map((_: any, index: number) => (
                             <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke="none" />
                          ))}
                       </Pie>
                       <Tooltip />
                    </PieChart>
                 </ResponsiveContainer>
                 <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <p className="text-4xl font-black text-zinc-100 tracking-tighter">100%</p>
                    <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">Gross</p>
                 </div>
              </div>
              <div className="flex-1 space-y-6 w-full">
                 {revenueBreakdown.map((item: any, i: number) => (
                   <div key={i} className="flex items-center justify-between p-4 rounded-2xl bg-white/[0.02] border border-white/5">
                      <div className="flex items-center gap-3">
                         <div className="h-3 w-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                         <span className="text-sm font-bold text-zinc-300">{item.name}</span>
                      </div>
                      <span className="text-sm font-black text-zinc-100">{item.percentage}%</span>
                   </div>
                 ))}
              </div>
           </div>
        </div>

        {/* Cost Breakdown Bar Chart - Using Payout Data */}
        <div className="glass-card p-10 rounded-[48px] border-white/5 space-y-10">
           <div className="flex items-center justify-between">
              <h3 className="text-xl font-black text-zinc-100 flex items-center gap-3">
                 <History className="text-red-400" size={24} />
                 Burn Analysis
              </h3>
              <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Payout History</p>
           </div>
           <div className="h-[300px] w-full min-w-0 min-h-0">
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                 <BarChart data={financialData?.burn_time_series}>
                    <XAxis 
                       dataKey="date" 
                       stroke="#52525b" 
                       fontSize={10} 
                       tickLine={false} 
                       axisLine={false}
                       tickFormatter={(date) => format(new Date(date), 'dd/MM')} 
                    />
                    <YAxis 
                       stroke="#52525b" 
                       fontSize={10} 
                       tickLine={false} 
                       axisLine={false}
                       tickFormatter={(value) => `Rp${(value/1000).toFixed(0)}k`} 
                    />
                    <Tooltip 
                       cursor={{ fill: 'rgba(255,255,255,0.02)' }}
                       contentStyle={{ backgroundColor: '#09090b', borderColor: '#27272a', borderRadius: '16px' }}
                       labelFormatter={(label) => format(new Date(label), 'dd MMM yyyy')}
                       formatter={(value: any) => [`Rp ${value.toLocaleString()}`, 'Payout Amount']}
                    />
                    <Bar dataKey="amount" fill="#ef4444" radius={[8, 8, 0, 0]} barSize={24} />
                 </BarChart>
              </ResponsiveContainer>
           </div>
        </div>
      </div>

      {/* Emergency Weather Fund */}
      <div className="glass-card p-10 rounded-[48px] border-amber-500/10 bg-amber-500/[0.02] overflow-hidden relative">
         <div className="absolute top-0 right-0 p-10 opacity-5">
            <CloudRain size={160} />
         </div>
         <div className="flex flex-col md:flex-row items-center justify-between gap-8 relative z-10">
            <div className="space-y-4 max-w-md">
               <div className="flex items-center gap-3 text-amber-400">
                  <ShieldAlert size={28} />
                  <h3 className="text-2xl font-black italic uppercase tracking-tight">Emergency Fund</h3>
               </div>
               <p className="text-sm text-zinc-400 leading-relaxed font-medium">
                  Reserved for weather spikes and high-demand surge coverage. This fund ensures courier satisfaction during extreme conditions.
               </p>
            </div>
            <div className="flex flex-col items-center md:items-end gap-6">
               <div className="text-center md:text-right">
                  <p className="text-[10px] font-black text-amber-500/60 uppercase tracking-[0.2em] mb-2">Available Balance</p>
                  <p className="text-5xl font-black text-zinc-100 tracking-tighter">Rp {emergencyFund.toLocaleString()}</p>
               </div>
               <div className="flex gap-3">
                  <button 
                    onClick={() => {
                      const amount = prompt('Enter top-up amount (IDR):');
                      if (amount && !isNaN(parseInt(amount))) {
                        topUpMutation.mutate(parseInt(amount));
                      }
                    }}
                    disabled={topUpMutation.isPending}
                    className="px-6 py-3 rounded-2xl bg-amber-500 text-black font-black text-xs uppercase tracking-widest hover:bg-amber-400 transition-all disabled:opacity-50"
                  >
                     {topUpMutation.isPending ? 'Topping up...' : 'Top Up Reserves'}
                  </button>
                  <button 
                    onClick={() => {
                      // Navigate to audit logs and filter by finance
                      window.location.hash = '/audit-logs'
                    }}
                    className="px-6 py-3 rounded-2xl bg-white/5 border border-white/10 text-zinc-300 font-black text-xs uppercase tracking-widest hover:bg-white/10 transition-all"
                  >
                     View Usage History
                  </button>
               </div>
            </div>
         </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        <div className="glass-card p-8 rounded-[40px] border-white/5 space-y-8">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-2xl font-black text-zinc-100 italic uppercase flex items-center gap-3">
                <Landmark className="text-primary-light" size={26} />
                Rekening Pencairan
              </h3>
              <p className="text-sm text-zinc-500 mt-1">Review rekening kurir sebelum saldo dapat dicairkan.</p>
            </div>
            <span className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] font-black text-zinc-400 uppercase tracking-widest">
              {payoutAccounts?.filter((item: any) => item.status === 'pending_review').length || 0} pending
            </span>
          </div>

          <div className="space-y-4 max-h-[560px] overflow-y-auto pr-2">
            {payoutAccounts?.map((account: any) => (
              <div key={account.id} className="p-5 rounded-[28px] bg-white/[0.02] border border-white/5 space-y-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-base font-black text-zinc-100 truncate">{account.courier_name}</p>
                    <p className="text-xs text-zinc-500 mt-1">{account.courier_phone || '-'} • {account.application_channel || 'courier'}</p>
                  </div>
                  <span className={cn(
                    "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest shrink-0",
                    account.status === 'verified' ? "bg-emerald-500/10 text-emerald-400" :
                    account.status === 'pending_review' ? "bg-amber-500/10 text-amber-400" :
                    "bg-red-500/10 text-red-400"
                  )}>
                    {account.status}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 rounded-2xl bg-black/20 border border-white/5">
                    <p className="text-[9px] text-zinc-600 font-black uppercase tracking-widest">Bank</p>
                    <p className="text-sm font-black text-zinc-200 mt-1">{account.bank_code}</p>
                  </div>
                  <div className="p-3 rounded-2xl bg-black/20 border border-white/5">
                    <p className="text-[9px] text-zinc-600 font-black uppercase tracking-widest">Nomor</p>
                    <p className="text-sm font-black text-zinc-200 mt-1">{account.account_number}</p>
                  </div>
                  <div className="p-3 rounded-2xl bg-black/20 border border-white/5 min-w-0">
                    <p className="text-[9px] text-zinc-600 font-black uppercase tracking-widest">Nama</p>
                    <p className="text-sm font-black text-zinc-200 mt-1 truncate">{account.account_name}</p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => updatePayoutAccountMutation.mutate({
                      id: account.id,
                      status: 'verified',
                      reason: 'Rekening sesuai dokumen onboarding dan siap untuk pencairan.'
                    })}
                    disabled={account.status === 'verified' || updatePayoutAccountMutation.isPending}
                    className="px-4 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-black text-[10px] uppercase tracking-widest hover:bg-emerald-500/20 disabled:opacity-40 flex items-center gap-2"
                  >
                    <CheckCircle2 size={14} />
                    Verifikasi
                  </button>
                  <button
                    onClick={() => {
                      const reason = prompt('Alasan penolakan rekening:') || 'Data rekening tidak sesuai dokumen.';
                      updatePayoutAccountMutation.mutate({ id: account.id, status: 'rejected', reason });
                    }}
                    disabled={account.status === 'rejected' || updatePayoutAccountMutation.isPending}
                    className="px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 font-black text-[10px] uppercase tracking-widest hover:bg-red-500/20 disabled:opacity-40 flex items-center gap-2"
                  >
                    <XCircle size={14} />
                    Tolak
                  </button>
                  <button
                    onClick={() => {
                      // Inline confirm for account-level suspend (no payout amount context here)
                      if (window.confirm(`Suspend rekening payout milik ${account.account_name || 'kurir ini'}? Aksi ini akan diaudit.`)) {
                        updatePayoutAccountMutation.mutate({ id: account.id, status: 'suspended', reason: 'Rekening ditahan untuk review keamanan oleh admin.' });
                      }
                    }}
                    disabled={account.status === 'suspended' || updatePayoutAccountMutation.isPending}
                    className="px-4 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 font-black text-[10px] uppercase tracking-widest hover:bg-amber-500/20 disabled:opacity-40 flex items-center gap-2"
                  >
                    <Ban size={14} />
                    Suspend
                  </button>
                </div>
              </div>
            ))}
            {(!payoutAccounts || payoutAccounts.length === 0) && (
              <div className="py-16 text-center text-zinc-500 font-bold">Belum ada rekening pencairan untuk direview.</div>
            )}
          </div>
        </div>

        <div className="glass-card p-8 rounded-[40px] border-white/5 space-y-8">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-2xl font-black text-zinc-100 italic uppercase flex items-center gap-3">
                <ShieldCheck className="text-primary-light" size={26} />
                Pengajuan Pencairan
              </h3>
              <p className="text-sm text-zinc-500 mt-1">Kontrol status settlement kurir dengan audit trail.</p>
            </div>
            <span className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] font-black text-zinc-400 uppercase tracking-widest">
              {payoutRequests?.filter((item: any) => activePayoutStatuses.includes(item.status)).length || 0} aktif
            </span>
          </div>

          <div className="space-y-4 max-h-[560px] overflow-y-auto pr-2">
            {payoutRequests?.map((request: any) => (
              <div key={request.id} className="p-5 rounded-[28px] bg-white/[0.02] border border-white/5 space-y-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-base font-black text-zinc-100 truncate">{request.courier_name}</p>
                    <p className="text-xs text-zinc-500 mt-1">{request.request_number} • {format(new Date(request.requested_at), 'dd MMM yyyy HH:mm')}</p>
                  </div>
                  <span className={cn(
                    "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest shrink-0",
                    request.status === 'paid' ? "bg-emerald-500/10 text-emerald-400" :
                    ['failed', 'rejected', 'blocked', 'cancelled'].includes(request.status) ? "bg-red-500/10 text-red-400" :
                    ['approved_auto', 'approved', 'processing'].includes(request.status) ? "bg-primary/10 text-primary-light" :
                    "bg-amber-500/10 text-amber-400"
                  )}>
                    {payoutStatusLabel(request)}
                  </span>
                </div>

                {request.risk_decision && (
                  <div className="rounded-2xl border border-white/5 bg-black/20 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[9px] font-black uppercase tracking-widest text-zinc-600">Risk Engine</p>
                      <span className={cn(
                        "rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-widest",
                        request.risk_decision === 'auto_approved' ? "bg-emerald-500/10 text-emerald-400" :
                        request.risk_decision === 'blocked' ? "bg-red-500/10 text-red-400" :
                        "bg-amber-500/10 text-amber-400"
                      )}>
                        {riskActionLabel(request)} • {request.risk_score ?? 0}
                      </span>
                    </div>
                    {request.risk_reasons?.length > 0 && (
                      <p className="mt-2 line-clamp-2 text-xs text-zinc-400">{request.risk_reasons.slice(0, 2).join(' • ')}</p>
                    )}
                  </div>
                )}

                {(request.provider_reference || request.provider_status || request.provider_payload_hash) && (
                  <div className="rounded-2xl border border-primary/10 bg-primary/5 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[9px] font-black uppercase tracking-widest text-zinc-600">Provider Dispatch</p>
                      <span className={cn(
                        "rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-widest",
                        request.provider_status === 'paid' || request.status === 'paid' ? "bg-emerald-500/10 text-emerald-400" :
                        request.provider_status === 'failed' || request.status === 'failed' ? "bg-red-500/10 text-red-400" :
                        "bg-blue-500/10 text-blue-400"
                      )}>
                        {request.provider_status || request.status}
                      </span>
                    </div>
                    <div className="mt-2 grid grid-cols-1 gap-1 text-xs text-zinc-400">
                      <span>Provider: <b className="text-zinc-200">{request.provider_name || '-'}</b></span>
                      <span>Reference: <b className="text-zinc-200">{request.provider_reference || '-'}</b></span>
                      <span>Payload: <b className="text-zinc-200">{String(request.provider_payload_hash || request.dispatch_payload_hash || '-').slice(0, 12)}</b></span>
                      <span>Response: <b className="text-zinc-200">{String(request.provider_response_hash || request.dispatch_response_hash || '-').slice(0, 12)}</b></span>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-2xl bg-black/20 border border-white/5">
                    <p className="text-[9px] text-zinc-600 font-black uppercase tracking-widest">Nominal</p>
                    <p className="text-lg font-black text-zinc-100 mt-1">{formatCurrency(request.amount_idr)}</p>
                  </div>
                  <div className="p-3 rounded-2xl bg-black/20 border border-white/5">
                    <p className="text-[9px] text-zinc-600 font-black uppercase tracking-widest">Tujuan</p>
                    <p className="text-sm font-black text-zinc-200 mt-1">
                      {request.destination_snapshot?.bank_code} • **** {request.destination_snapshot?.account_number_last4}
                    </p>
                  </div>
                </div>

                {!['paid', 'failed', 'rejected', 'blocked', 'cancelled'].includes(request.status) && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => updatePayoutRequestMutation.mutate({
                        id: request.id,
                        status: 'manual_review',
                        reason: 'Masuk proses review treasury.'
                      })}
                      disabled={!['requested', 'risk_screening', 'risk_hold'].includes(request.status) || updatePayoutRequestMutation.isPending}
                      className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-zinc-300 font-black text-[10px] uppercase tracking-widest hover:bg-white/10 disabled:opacity-40"
                    >
                      Review
                    </button>
                    <button
                      onClick={() => updatePayoutRequestMutation.mutate({
                        id: request.id,
                        status: 'approved',
                        reason: 'Disetujui untuk proses settlement.'
                      })}
                      disabled={!['requested', 'risk_screening', 'risk_hold', 'manual_review', 'under_review', 'approved_auto'].includes(request.status) || updatePayoutRequestMutation.isPending}
                      className="px-4 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-black text-[10px] uppercase tracking-widest hover:bg-emerald-500/20 disabled:opacity-40"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => updatePayoutRequestMutation.mutate({
                        id: request.id,
                        status: 'paid',
                        reason: 'Dana sudah dikirim ke rekening terverifikasi.'
                      })}
                      disabled={!['approved_auto', 'approved', 'processing'].includes(request.status) || updatePayoutRequestMutation.isPending}
                      className="px-4 py-2 rounded-xl bg-primary text-white font-black text-[10px] uppercase tracking-widest hover:bg-primary-light disabled:opacity-40"
                    >
                      Mark Paid
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm('Reject payout ini? Kurir dapat mengajukan ulang. Aksi ini dicatat ke audit trail.')) {
                          updatePayoutRequestMutation.mutate({ id: request.id, status: 'rejected', reason: 'Pencairan tidak lolos review treasury.' });
                        }
                      }}
                      disabled={updatePayoutRequestMutation.isPending}
                      className="px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 font-black text-[10px] uppercase tracking-widest hover:bg-red-500/20 disabled:opacity-40"
                    >
                      Reject
                    </button>
                  </div>
                )}
              </div>
            ))}
            {(!payoutRequests || payoutRequests.length === 0) && (
              <div className="py-16 text-center text-zinc-500 font-bold">Belum ada pengajuan pencairan.</div>
            )}
          </div>
        </div>
      </div>

      {/* Pending Settlements Table */}
      <div className="glass-card p-10 rounded-[48px] border-white/5 space-y-10">
         <div className="flex items-center justify-between">
            <h3 className="text-2xl font-black text-zinc-100 italic uppercase flex items-center gap-4">
               <CreditCard className="text-primary-light" size={28} />
               Payout Gateway
            </h3>
            <button 
              onClick={() => {
                if (confirm('Are you sure you want to release ALL pending payouts?')) {
                  batchReleaseMutation.mutate();
                }
              }}
              disabled={batchReleaseMutation.isPending}
              className="flex items-center gap-2 text-xs font-black text-primary-light uppercase tracking-widest hover:text-primary transition-all disabled:opacity-50"
            >
               {batchReleaseMutation.isPending ? 'Processing Batch...' : 'Batch Trigger All'}
               <ChevronRight size={14} />
            </button>
         </div>
         <div className="overflow-x-auto">
            <table className="w-full text-left">
               <thead>
                  <tr className="border-b border-white/5">
                     {['Payout ID', 'Courier Partner', 'Created', 'Amount', 'Status', 'Actions'].map(h => (
                       <th key={h} className="pb-6 text-[10px] font-black text-zinc-600 uppercase tracking-widest">{h}</th>
                     ))}
                  </tr>
               </thead>
               <tbody className="divide-y divide-white/5">
                  {payouts?.map((set: any) => (
                    <tr key={set.id} className="group hover:bg-white/[0.01] transition-all">
                       <td className="py-8 font-mono text-[10px] text-zinc-500 uppercase">{set.id.split('-')[0]}...</td>
                       <td className="py-8">
                          <div className="flex items-center gap-3">
                             <div className="h-8 w-8 rounded-lg bg-zinc-900 border border-white/10 flex items-center justify-center font-bold text-xs text-zinc-400">
                                {set.courier_name.charAt(0)}
                             </div>
                             <div className="flex flex-col">
                                <span className="font-bold text-zinc-200">{set.courier_name}</span>
                                <span className="text-[10px] text-zinc-500">{set.courier_phone}</span>
                             </div>
                          </div>
                       </td>
                       <td className="py-8 text-[10px] font-bold text-zinc-500">
                          {format(new Date(set.created_at), 'dd MMM yyyy HH:mm')}
                       </td>
                       <td className="py-8 text-sm font-black text-zinc-100">
                          Rp {parseInt(set.net_idr).toLocaleString()}
                       </td>
                       <td className="py-8">
                          <span className={cn(
                            "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest",
                            set.disbursement_status === 'pending' ? "bg-amber-500/10 text-amber-400" : "bg-emerald-500/10 text-emerald-400"
                          )}>
                             {set.disbursement_status}
                          </span>
                       </td>
                       <td className="py-8">
                          {set.disbursement_status === 'pending' && (
                            <button 
                              onClick={() => releaseMutation.mutate(set.id)}
                              disabled={releaseMutation.isPending}
                              className="px-4 py-2 rounded-xl bg-primary text-white font-black text-[10px] uppercase tracking-widest hover:bg-primary-light transition-all shadow-lg shadow-primary/10 disabled:opacity-50"
                            >
                               {releaseMutation.isPending ? 'Processing...' : 'Release'}
                            </button>
                          )}
                       </td>
                    </tr>
                  ))}
                  {(!payouts || payouts.length === 0) && (
                    <tr>
                      <td colSpan={6} className="py-20 text-center text-zinc-500 font-bold italic uppercase tracking-widest">
                        No pending payouts found
                      </td>
                    </tr>
                  )}
               </tbody>
            </table>
         </div>
      </div>

      {/* Tax Compliance Section */}
      <div className="grid grid-cols-1 gap-8">
         <div className="glass-card p-10 rounded-[48px] border-white/5 space-y-8">
            <h3 className="text-xl font-black text-zinc-100 italic uppercase">Tax Compliance (PPN) — Quick View</h3>
            <div className="p-8 rounded-[32px] bg-white/[0.02] border border-white/5 flex flex-col items-center justify-center text-center space-y-4">
               <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">Total PPN to be Remitted (Current Masa)</p>
               <p className="text-5xl font-black text-zinc-100 tracking-tighter">
                  Rp {(financialData?.ppn_total || 0).toLocaleString()}
               </p>
               <div className="flex gap-3 pt-4">
                  <button
                    onClick={async () => {
                      try {
                        const res = await api.get('/admin/finance/masa-report/export', { responseType: 'blob' })
                        const url = URL.createObjectURL(res.data)
                        const a = document.createElement('a')
                        a.href = url
                        a.download = `ppn_masa_report_${new Date().toISOString().split('T')[0]}.csv`
                        a.click()
                        URL.revokeObjectURL(url)
                      } catch { toast.error('Masa report export failed') }
                    }}
                    className="px-6 py-3 rounded-2xl bg-white/5 border border-white/10 text-zinc-300 font-black text-xs uppercase tracking-widest hover:bg-white/10 transition-all"
                  >
                     Export Masa Report
                  </button>
                  <button
                    onClick={() => setActiveTab('tax')}
                    className="px-6 py-3 rounded-2xl bg-primary text-white font-black text-xs uppercase tracking-widest hover:bg-primary-light transition-all flex items-center gap-2"
                  >
                    <Receipt size={14} />
                    Detail Tax Dashboard
                  </button>
               </div>
            </div>
         </div>
      </div>

      {/* close treasury tab */}
      </div>
  )
}

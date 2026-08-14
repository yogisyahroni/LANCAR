package service

import (
	"context"
	"encoding/csv"
	"errors"
	"fmt"
	"strconv"
	"strings"

	"tembus/merchant-service/internal/domain"
)

// ─────────────────────────────────────────────
// Report service (FB-086) — rekap penjualan merchant.
// Method GetSalesReport / ExportSalesReportCSV milik merchantServiceImpl
// (interface domain.MerchantService).
// ─────────────────────────────────────────────

// validReportPeriod — hanya daily | weekly.
func validReportPeriod(period string) bool {
	return period == "daily" || period == "weekly"
}

// resolveReportPeriod — kosong default daily (rekap hari ini).
func resolveReportPeriod(period string) (string, error) {
	if period == "" {
		return "daily", nil
	}
	if !validReportPeriod(period) {
		return "", errors.New("period harus daily atau weekly")
	}
	return period, nil
}

// GetSalesReport — rekap penjualan merchant untuk periode (daily | weekly).
// Merchant wajib terdaftar & approved (pola GetStruk).
func (s *merchantServiceImpl) GetSalesReport(ctx context.Context, userID, period string) (*domain.SalesReportSummary, error) {
	if s.reportRepo == nil {
		return nil, errors.New("report repository not wired")
	}
	p, err := resolveReportPeriod(period)
	if err != nil {
		return nil, err
	}
	m, err := s.merchantRepo.GetByUserID(ctx, userID)
	if err != nil {
		return nil, err
	}
	if m == nil {
		return nil, errors.New("merchant belum terdaftar")
	}
	if m.VerificationStatus != "approved" {
		return nil, errors.New("merchant belum disetujui")
	}
	return s.reportRepo.SalesReport(ctx, m.ID, p)
}

// ListSettlements — riwayat pencairan/payout merchant (FB-113).
// Total cair = status COMPLETED; ditahan = HOLDING/PROCESSING.
func (s *merchantServiceImpl) ListSettlements(ctx context.Context, userID string) (*domain.SettlementSummary, error) {
	if s.reportRepo == nil {
		return nil, errors.New("report repository not wired")
	}
	m, err := s.merchantRepo.GetByUserID(ctx, userID)
	if err != nil {
		return nil, err
	}
	if m == nil {
		return nil, errors.New("merchant belum terdaftar")
	}
	if m.VerificationStatus != "approved" {
		return nil, errors.New("merchant belum disetujui")
	}
	records, err := s.reportRepo.Settlements(ctx, m.ID, 50)
	if err != nil {
		return nil, err
	}
	summary := &domain.SettlementSummary{Records: records}
	for _, rec := range records {
		switch rec.Status {
		case "COMPLETED":
			summary.TotalIDR += rec.NetPayoutIDR
		case "HOLDING", "PROCESSING":
			summary.HoldingIDR += rec.NetPayoutIDR
		}
	}
	summary.AvailableIDR = summary.TotalIDR - summary.HoldingIDR
	return summary, nil
}

// RequestWithdrawal — ajukan pencairan saldo merchant (M7).
// Validasi: merchant approved, saldo tersedia (TotalIDR - HoldingIDR) cukup,
// nominal dalam range, idempotency_key wajib. Simpan ke
// merchant_withdrawal_requests lalu kembalikan record + saldo tersedia terkini.
func (s *merchantServiceImpl) RequestWithdrawal(ctx context.Context, userID string, input domain.CreateMerchantWithdrawalInput) (*domain.MerchantWithdrawalRecord, int64, error) {
	if s.reportRepo == nil || s.merchantRepo == nil {
		return nil, 0, errors.New("repository not wired")
	}
	if input.AmountIDR <= 0 {
		return nil, 0, errors.New("nominal penarikan harus > 0")
	}
	if len(input.IdempotencyKey) == 0 {
		return nil, 0, errors.New("idempotency_key wajib diisi")
	}
	if input.BankName == "" || input.BankAccountNumber == "" || input.BankAccountHolder == "" {
		return nil, 0, errors.New("data rekening tujuan wajib lengkap")
	}
	m, err := s.merchantRepo.GetByUserID(ctx, userID)
	if err != nil {
		return nil, 0, err
	}
	if m == nil {
		return nil, 0, errors.New("merchant belum terdaftar")
	}
	if m.VerificationStatus != "approved" {
		return nil, 0, errors.New("merchant belum disetujui")
	}
	// Hitung saldo tersedia dari riwayat settlement.
	records, err := s.reportRepo.Settlements(ctx, m.ID, 1000)
	if err != nil {
		return nil, 0, err
	}
	var total, holding int64
	for _, rec := range records {
		switch rec.Status {
		case "COMPLETED":
			total += rec.NetPayoutIDR
		case "HOLDING", "PROCESSING":
			holding += rec.NetPayoutIDR
		}
	}
	available := total - holding
	if available < input.AmountIDR {
		return nil, available, fmt.Errorf("saldo tersedia tidak cukup (tersedia Rp %d)", available)
	}
	if input.AmountIDR < 10_000 {
		return nil, available, errors.New("minimal penarikan Rp 10.000")
	}
	if input.AmountIDR > 50_000_000 {
		return nil, available, errors.New("maksimal penarikan Rp 50.000.000 per permintaan")
	}
	req := &domain.MerchantWithdrawalRequest{
		MerchantID:        m.ID,
		UserID:            userID,
		AmountIDR:         input.AmountIDR,
		BankName:          input.BankName,
		BankAccountNumber: input.BankAccountNumber,
		BankAccountHolder: input.BankAccountHolder,
		IdempotencyKey:    input.IdempotencyKey,
	}
	if err := s.reportRepo.CreateWithdrawal(ctx, req); err != nil {
		return nil, available, err
	}
	rec := &domain.MerchantWithdrawalRecord{
		ID:                req.IdempotencyKey, // sementara; repo isi id asli via return
		AmountIDR:         input.AmountIDR,
		BankName:          input.BankName,
		BankAccountNumber: input.BankAccountNumber,
		BankAccountHolder: input.BankAccountHolder,
		Status:            "pending",
	}
	return rec, available - input.AmountIDR, nil
}

// ListWithdrawals — riwayat permintaan pencairan merchant (M7).
func (s *merchantServiceImpl) ListWithdrawals(ctx context.Context, userID string, limit int) ([]*domain.MerchantWithdrawalRecord, error) {
	if s.reportRepo == nil || s.merchantRepo == nil {
		return nil, errors.New("repository not wired")
	}
	m, err := s.merchantRepo.GetByUserID(ctx, userID)
	if err != nil {
		return nil, err
	}
	if m == nil {
		return nil, errors.New("merchant belum terdaftar")
	}
	return s.reportRepo.ListWithdrawals(ctx, m.ID, limit)
}

// ExportSalesReportCSV — baris transaksi periode dalam format CSV.
// Header: order_number, created_at, status, item_name, quantity,
// item_price_idr, subtotal_idr, order_total_idr.
func (s *merchantServiceImpl) ExportSalesReportCSV(ctx context.Context, userID, period string) (string, error) {
	p, err := resolveReportPeriod(period)
	if err != nil {
		return "", err
	}
	m, err := s.merchantRepo.GetByUserID(ctx, userID)
	if err != nil {
		return "", err
	}
	if m == nil {
		return "", errors.New("merchant belum terdaftar")
	}
	if m.VerificationStatus != "approved" {
		return "", errors.New("merchant belum disetujui")
	}
	rows, err := s.reportRepo.SalesReportRows(ctx, m.ID, p)
	if err != nil {
		return "", err
	}

	var buf strings.Builder
	w := csv.NewWriter(&buf)
	_ = w.Write([]string{
		"order_number", "created_at", "status", "item_name",
		"quantity", "item_price_idr", "subtotal_idr", "order_total_idr",
	})
	for _, rw := range rows {
		if err := w.Write([]string{
			rw.OrderNumber, rw.CreatedAt, rw.Status, rw.ItemName,
			strconv.Itoa(rw.Quantity),
			strconv.FormatInt(rw.ItemPrice, 10),
			strconv.FormatInt(rw.Subtotal, 10),
			strconv.FormatInt(rw.OrderTotalIDR, 10),
		}); err != nil {
			return "", fmt.Errorf("write csv row: %w", err)
		}
	}
	w.Flush()
	if err := w.Error(); err != nil {
		return "", fmt.Errorf("csv flush: %w", err)
	}
	return buf.String(), nil
}

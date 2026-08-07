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

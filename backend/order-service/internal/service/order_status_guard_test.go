package service_test

import (
	"context"
	"strings"
	"testing"

	"tembus/order-service/internal/domain"
)

// ── AUDIT-FIX m5: guard transisi status final di orderSvc.UpdateStatus ──

// TestUpdateStatus_CancelledTidakBisaHidupLagi — resurrection guard:
// order cancelled (refund sudah jalan) TIDAK boleh diubah ke status lain.
func TestUpdateStatus_CancelledTidakBisaHidupLagi(t *testing.T) {
	ctx := context.Background()
	orderRepo := &mockOrderRepo{order: &domain.Order{ID: "order-x", Status: domain.StatusCancelled, CustomerID: "user-1"}}
	svc := newTestOrderService(&batchFoodRepo{}, orderRepo)

	err := svc.UpdateStatus(ctx, "order-x", domain.StatusDelivered)
	if err == nil {
		t.Fatal("expected error: order cancelled tidak boleh di-resurrect ke delivered")
	}
	if !strings.Contains(err.Error(), "sudah berstatus final") {
		t.Fatalf("expected 'sudah berstatus final', got: %v", err)
	}
	if orderRepo.order.Status != domain.StatusCancelled {
		t.Fatalf("status berubah jadi %s — guard gagal", orderRepo.order.Status)
	}
}

// TestUpdateStatus_DeliveredTidakBisaDiCancel — anti-refund order selesai:
// order delivered (uang sudah pindah ke kurir/merchant) TIDAK boleh di-cancel.
func TestUpdateStatus_DeliveredTidakBisaDiCancel(t *testing.T) {
	ctx := context.Background()
	orderRepo := &mockOrderRepo{order: &domain.Order{ID: "order-y", Status: domain.StatusDelivered, CustomerID: "user-1"}}
	svc := newTestOrderService(&batchFoodRepo{}, orderRepo)

	err := svc.UpdateStatus(ctx, "order-y", domain.StatusCancelled)
	if err == nil {
		t.Fatal("expected error: order delivered tidak boleh di-cancel")
	}
	if !strings.Contains(err.Error(), "sudah berstatus final") {
		t.Fatalf("expected 'sudah berstatus final', got: %v", err)
	}
}

// TestUpdateStatus_IdempotentSameStatus — cancel dua kali → no-op sukses
// (tidak trigger refund kedua; C1 idempotensi refund juga melindungi).
func TestUpdateStatus_IdempotentSameStatus(t *testing.T) {
	ctx := context.Background()
	orderRepo := &mockOrderRepo{order: &domain.Order{ID: "order-z", Status: domain.StatusCancelled, CustomerID: "user-1"}}
	svc := newTestOrderService(&batchFoodRepo{}, orderRepo)

	err := svc.UpdateStatus(ctx, "order-z", domain.StatusCancelled)
	if err != nil {
		t.Fatalf("same-status harus no-op sukses, got: %v", err)
	}
}

// TestUpdateStatus_TransisiNormalTetapJalan — status non-final masih boleh
// diubah (regresi: pending_assignment → searching / no_courier_found dll).
func TestUpdateStatus_TransisiNormalTetapJalan(t *testing.T) {
	ctx := context.Background()
	orderRepo := &mockOrderRepo{order: &domain.Order{ID: "order-w", Status: domain.StatusPendingAssignment, CustomerID: "user-1"}}
	svc := newTestOrderService(&batchFoodRepo{}, orderRepo)

	if err := svc.UpdateStatus(ctx, "order-w", domain.StatusSearching); err != nil {
		t.Fatalf("transisi normal harusnya sukses, got: %v", err)
	}
	if orderRepo.order.Status != domain.StatusSearching {
		t.Fatalf("status tidak berubah: %s", orderRepo.order.Status)
	}
}

package service

import (
	"testing"

	"github.com/google/uuid"
	"tembus/payment-service/internal/domain"
)

func TestTopUpSessionFromTransactionReplaysProviderSession(t *testing.T) {
	walletID := uuid.New()
	tx := &domain.WalletTransaction{
		WalletID:    walletID,
		Type:        domain.TypeDeposit,
		Amount:      25_000,
		Fee:         1_000,
		ReferenceID: "TOPUP-550e8400-e29b-41d4-a716-446655440000",
		Metadata: map[string]any{
			"snap_token":     "snap-token",
			"invoice_url":    "https://pay.example.test/invoice",
			"total_paid_idr": float64(26_000),
		},
	}

	session, err := topUpSessionFromTransaction(tx)
	if err != nil {
		t.Fatalf("replay session: %v", err)
	}
	if session.ReferenceID != tx.ReferenceID || session.SnapToken != "snap-token" || session.InvoiceURL == "" {
		t.Fatalf("unexpected replay session: %+v", session)
	}
	if session.Amount != 25_000 || session.Fee != 1_000 || session.Total != 26_000 {
		t.Fatalf("unexpected amount breakdown: %+v", session)
	}
}

func TestTopUpSessionFromTransactionRejectsMissingProviderData(t *testing.T) {
	_, err := topUpSessionFromTransaction(&domain.WalletTransaction{
		Type:        domain.TypeDeposit,
		ReferenceID: "TOPUP-missing-provider-data",
		Metadata:    map[string]any{"total_paid_idr": float64(10_000)},
	})
	if err == nil {
		t.Fatal("expected missing provider data to fail closed")
	}
}

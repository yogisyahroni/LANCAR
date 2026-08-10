package service

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"

	"tembus/merchant-service/internal/domain"

	"github.com/skip2/go-qrcode"
)

// ─────────────────────────────────────────────
// Util QR — duplikasi dari order-service/pkg/utils/qrcode.go
// (FOOD-BIKE-034: tidak ada shared package antar service).
// ─────────────────────────────────────────────

func generateQRCodeDataURI(content string, size int) (string, error) {
	png, err := qrcode.Encode(content, qrcode.Medium, size)
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("data:image/png;base64,%s", base64.StdEncoding.EncodeToString(png)), nil
}

// ─────────────────────────────────────────────
// Struk service (FOOD-BIKE-034)
// Method GetStruk milik merchantServiceImpl (defined di merchant_service.go).
// ─────────────────────────────────────────────

// GetStruk — generate data struk pembelian + QR code (berisi handover token)
// untuk order food milik merchant. Merchant wajib approved & pemilik order.
func (s *merchantServiceImpl) GetStruk(ctx context.Context, userID, orderID string) (*domain.StrukData, error) {
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

	struk, err := s.orderRepo.GetOrderForStruk(ctx, m.ID, orderID)
	if err != nil {
		return nil, err
	}

	// QR berisi handover token — sama dengan yang di-scan driver saat pickup
	// (konsisten dengan FOOD-BIKE-032 validasi barcode & FOOD-BIKE-069).
	qr, err := generateQRCodeDataURI(struk.HandoverToken, 256)
	if err != nil {
		return nil, fmt.Errorf("generate QR struk: %w", err)
	}
	struk.QRCodeDataURI = qr
	return struk, nil
}

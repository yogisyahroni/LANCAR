package service_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"tembus/merchant-service/internal/domain"
	"tembus/merchant-service/internal/service"
)

// ── FB-092: unit test UpdateFoodDocs + gate ToggleOpen ────────────────
// Kasus:
//   1. UpdateFoodDocs dengan data valid (halal + SPP-IRT) → tersimpan.
//   2. Nomor halal tanpa expiry → ditolak.
//   3. Format SPP-IRT tanpa awalan "P-IRT" → ditolak.
//   4. Expiry di masa lalu → ditolak.
//   5. ToggleOpen buka toko tanpa dokumen pangan → ditolak.
//   6. ToggleOpen buka toko dengan dokumen expired → ditolak.
//   7. ToggleOpen tutup toko tetap boleh (tanpa dokumen).

// foodDocsRepo — stub MerchantRepository minimal (hanya method yang dipakai).
type foodDocsRepo struct {
	merchant *domain.Merchant
	updated  *domain.Merchant
}

func (r *foodDocsRepo) Create(ctx context.Context, m *domain.Merchant, docs []domain.MerchantDocument) error {
	return nil
}
func (r *foodDocsRepo) GetByID(ctx context.Context, id string) (*domain.Merchant, error) {
	return r.merchant, nil
}
func (r *foodDocsRepo) GetByUserID(ctx context.Context, userID string) (*domain.Merchant, error) {
	return r.merchant, nil
}
func (r *foodDocsRepo) Update(ctx context.Context, m *domain.Merchant) error { return nil }
func (r *foodDocsRepo) UpdateVerification(ctx context.Context, id, status string) error {
	return nil
}
func (r *foodDocsRepo) ToggleOpen(ctx context.Context, id string, isOpen bool) error {
	if r.merchant != nil {
		r.merchant.IsOpen = isOpen
	}
	return nil
}
func (r *foodDocsRepo) SetPaused(ctx context.Context, id string, until *time.Time) error {
	if r.merchant != nil {
		r.merchant.PausedUntil = until
	}
	return nil
}
func (r *foodDocsRepo) ListByVerificationStatus(ctx context.Context, status string, limit, offset int) ([]*domain.Merchant, error) {
	return nil, nil
}
func (r *foodDocsRepo) CountByVerificationStatus(ctx context.Context, status string) (int, error) {
	return 0, nil
}
func (r *foodDocsRepo) ListDocuments(ctx context.Context, merchantID string) ([]domain.MerchantDocument, error) {
	return nil, nil
}
func (r *foodDocsRepo) UpdateFoodDocs(ctx context.Context, m *domain.Merchant, docs []domain.MerchantDocument) error {
	r.updated = m
	if r.merchant != nil {
		r.merchant.HalalCertNumber = m.HalalCertNumber
		r.merchant.HalalExpiryDate = m.HalalExpiryDate
		r.merchant.SppIrtNumber = m.SppIrtNumber
		r.merchant.SppIrtExpiryDate = m.SppIrtExpiryDate
		r.merchant.BpomNumber = m.BpomNumber
		r.merchant.BpomExpiryDate = m.BpomExpiryDate
	}
	return nil
}
func (r *foodDocsRepo) ListOpenWithExpiredFoodDocs(ctx context.Context) ([]*domain.Merchant, error) {
	return nil, nil
}
func (r *foodDocsRepo) ListForOperatingHoursSync(ctx context.Context) ([]*domain.Merchant, error) {
	return nil, nil
}
func (r *foodDocsRepo) UpdateBankAccount(ctx context.Context, merchantID string, req domain.UpdateBankAccountRequest, changed bool) error {
	return nil
}

func newFoodDocsService(repo domain.MerchantRepository) domain.MerchantService {
	return service.NewMerchantService(repo, nil, nil, nil)
}

func strp(s string) *string { return &s }

func approvedMerchant() *domain.Merchant {
	return &domain.Merchant{
		ID:                 "merchant-1",
		UserID:             "user-1",
		NamaToko:           "Warung Test",
		VerificationStatus: "approved",
	}
}

func TestUpdateFoodDocs_Valid_Saves(t *testing.T) {
	repo := &foodDocsRepo{merchant: approvedMerchant()}
	svc := newFoodDocsService(repo)

	future := time.Now().AddDate(1, 0, 0).Format("2006-01-02")
	_, err := svc.UpdateFoodDocs(context.Background(), "user-1", domain.UpdateFoodDocsRequest{
		HalalCertNumber:  strp("ID12345000000000001"),
		HalalExpiryDate:  strp(future),
		SppIrtNumber:     strp("P-IRT 1234567890123-2026"),
		SppIrtExpiryDate: strp(future),
	})
	if err != nil {
		t.Fatalf("UpdateFoodDocs valid harus sukses, got: %v", err)
	}
	if repo.updated == nil {
		t.Fatal("repo.UpdateFoodDocs tidak dipanggil")
	}
	if *repo.updated.HalalCertNumber != "ID12345000000000001" {
		t.Errorf("halal number mismatch: %s", *repo.updated.HalalCertNumber)
	}
}

func TestUpdateFoodDocs_HalalTanpaExpiry_Ditolak(t *testing.T) {
	repo := &foodDocsRepo{merchant: approvedMerchant()}
	svc := newFoodDocsService(repo)

	_, err := svc.UpdateFoodDocs(context.Background(), "user-1", domain.UpdateFoodDocsRequest{
		HalalCertNumber: strp("ID12345000000000001"),
	})
	if err == nil {
		t.Fatal("nomor halal tanpa expiry harus ditolak")
	}
}

func TestUpdateFoodDocs_SppIrtFormatSalah_Ditolak(t *testing.T) {
	repo := &foodDocsRepo{merchant: approvedMerchant()}
	svc := newFoodDocsService(repo)

	future := time.Now().AddDate(1, 0, 0).Format("2006-01-02")
	_, err := svc.UpdateFoodDocs(context.Background(), "user-1", domain.UpdateFoodDocsRequest{
		HalalCertNumber:  strp("ID12345000000000001"),
		HalalExpiryDate:  strp(future),
		SppIrtNumber:     strp("12345"), // bukan P-IRT
		SppIrtExpiryDate: strp(future),
	})
	if err == nil {
		t.Fatal("SPP-IRT tanpa awalan P-IRT harus ditolak")
	}
}

func TestUpdateFoodDocs_ExpiryMasaLalu_Ditolak(t *testing.T) {
	repo := &foodDocsRepo{merchant: approvedMerchant()}
	svc := newFoodDocsService(repo)

	past := time.Now().AddDate(-1, 0, 0).Format("2006-01-02")
	_, err := svc.UpdateFoodDocs(context.Background(), "user-1", domain.UpdateFoodDocsRequest{
		HalalCertNumber:  strp("ID12345000000000001"),
		HalalExpiryDate:  strp(past),
		SppIrtNumber:     strp("P-IRT 1234567890123-2026"),
		SppIrtExpiryDate: strp(past),
	})
	if err == nil {
		t.Fatal("expiry di masa lalu harus ditolak")
	}
}

func TestToggleOpen_TanpaDokumenPangan_Ditolak(t *testing.T) {
	repo := &foodDocsRepo{merchant: approvedMerchant()}
	svc := newFoodDocsService(repo)

	_, err := svc.ToggleOpen(context.Background(), "user-1", true)
	if err == nil {
		t.Fatal("buka toko tanpa dokumen pangan harus ditolak")
	}
}

func TestToggleOpen_DokumenExpired_Ditolak(t *testing.T) {
	past := time.Now().AddDate(-1, 0, 0).Format("2006-01-02")
	future := time.Now().AddDate(1, 0, 0).Format("2006-01-02")
	repo := &foodDocsRepo{merchant: &domain.Merchant{
		ID:                 "merchant-1",
		UserID:             "user-1",
		NamaToko:           "Warung Test",
		VerificationStatus: "approved",
		HalalCertNumber:    strp("ID12345000000000001"),
		HalalExpiryDate:    strp(past), // expired
		SppIrtNumber:       strp("P-IRT 1234567890123-2026"),
		SppIrtExpiryDate:   strp(future),
	}}
	svc := newFoodDocsService(repo)

	_, err := svc.ToggleOpen(context.Background(), "user-1", true)
	if err == nil {
		t.Fatal("buka toko dengan halal expired harus ditolak")
	}
}

func TestToggleOpen_TutupToko_TetapBoleh(t *testing.T) {
	repo := &foodDocsRepo{merchant: approvedMerchant()}
	svc := newFoodDocsService(repo)

	_, err := svc.ToggleOpen(context.Background(), "user-1", false)
	if err != nil {
		t.Fatalf("tutup toko tanpa dokumen harus tetap boleh, got: %v", err)
	}
	if repo.merchant.IsOpen {
		t.Error("toko seharusnya tertutup")
	}
}

func TestToggleOpen_BelumApproved_Ditolak(t *testing.T) {
	repo := &foodDocsRepo{merchant: &domain.Merchant{
		ID:                 "merchant-1",
		UserID:             "user-1",
		VerificationStatus: "pending",
	}}
	svc := newFoodDocsService(repo)

	_, err := svc.ToggleOpen(context.Background(), "user-1", true)
	if err == nil {
		t.Fatal("buka toko sebelum approved harus ditolak")
	}
}

var _ = errors.New // keep errors import if needed by future tests

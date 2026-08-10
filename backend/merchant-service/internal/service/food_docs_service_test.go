package service_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"tembus/merchant-service/internal/domain"
	"tembus/merchant-service/internal/service"
)

// ── FB-092 + ADR 003: unit test UpdateFoodDocs + ToggleOpen (SOFT-gate) ──
// ADR 003 (2026-08-10): dokumen pangan BUKAN gate buka toko. Semua status
// halal boleh buka. Label & filter di sisi customer.
// Kasus:
//   1. UpdateFoodDocs data valid (halal + SPP-IRT) → tersimpan, status certified.
//   2. Nomor halal tanpa expiry → ditolak.
//   3. Format SPP-IRT tanpa awalan "P-IRT" → ditolak.
//   4. Expiry di masa lalu → ditolak.
//   5. UpdateFoodDocs tanpa dokumen + halal_status non_halal → status non_halal.
//   6. UpdateFoodDocs tanpa dokumen → status unknown, toko tetap bisa buka.
//   7. ToggleOpen buka toko tanpa dokumen pangan → DIBOLEHKAN (soft-gate).
//   8. ToggleOpen buka toko dengan halal expired → DIBOLEHKAN (soft-gate).
//   9. ToggleOpen tutup toko tetap boleh.
//  10. ToggleOpen sebelum approved → ditolak.

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
		r.merchant.HalalStatus = m.HalalStatus
	}
	return nil
}
func (r *foodDocsRepo) ListCertifiedWithExpiredHalal(ctx context.Context) ([]*domain.Merchant, error) {
	return nil, nil
}
func (r *foodDocsRepo) SetHalalStatus(ctx context.Context, id, status string) error {
	if r.merchant != nil {
		r.merchant.HalalStatus = status
	}
	return nil
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
	// ADR 003: nomor valid + expiry future → otomatis halal_certified.
	if repo.updated.HalalStatus != "halal_certified" {
		t.Errorf("halal_status harus halal_certified, got: %s", repo.updated.HalalStatus)
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

// ADR 003: merchant non-halal self-declare → status non_halal, tanpa nomor.
func TestUpdateFoodDocs_SelfDeclareNonHalal(t *testing.T) {
	repo := &foodDocsRepo{merchant: approvedMerchant()}
	svc := newFoodDocsService(repo)

	_, err := svc.UpdateFoodDocs(context.Background(), "user-1", domain.UpdateFoodDocsRequest{
		HalalStatus: strp("non_halal"),
	})
	if err != nil {
		t.Fatalf("deklarasi non_halal harus sukses, got: %v", err)
	}
	if repo.updated == nil {
		t.Fatal("repo.UpdateFoodDocs tidak dipanggil")
	}
	if repo.updated.HalalStatus != "non_halal" {
		t.Errorf("halal_status harus non_halal, got: %s", repo.updated.HalalStatus)
	}
	if repo.updated.HalalCertNumber != nil {
		t.Error("merchant non_halal tidak boleh menyimpan nomor sertifikat halal")
	}
}

// ADR 003: tanpa dokumen apa pun → unknown, dan TIDAK memblokir buka toko.
func TestToggleOpen_TanpaDokumenPangan_Dibolehkan(t *testing.T) {
	repo := &foodDocsRepo{merchant: approvedMerchant()}
	svc := newFoodDocsService(repo)

	_, err := svc.ToggleOpen(context.Background(), "user-1", true)
	if err != nil {
		t.Fatalf("soft-gate ADR 003: buka toko tanpa dokumen pangan harus DIBOLEHKAN, got: %v", err)
	}
	if !repo.merchant.IsOpen {
		t.Error("toko seharusnya terbuka")
	}
}

// ADR 003: sertifikat expired TIDAK memblokir buka toko (badge turun ke unknown).
func TestToggleOpen_HalalExpired_Dibolehkan(t *testing.T) {
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
	if err != nil {
		t.Fatalf("soft-gate ADR 003: halal expired harus tetap boleh buka, got: %v", err)
	}
	if !repo.merchant.IsOpen {
		t.Error("toko seharusnya terbuka")
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

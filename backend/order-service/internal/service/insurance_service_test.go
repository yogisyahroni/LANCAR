package service

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"testing"

	"github.com/google/uuid"
	"tembus/order-service/internal/domain"
)

type fakeInsuranceRepo struct {
	domain.InsuranceRepository
	insurance *domain.OrderInsurance
	claim     *domain.OrderInsuranceClaim
	lookupErr error
}

func (f *fakeInsuranceRepo) GetOrderInsuranceForCustomer(context.Context, uuid.UUID, uuid.UUID) (*domain.OrderInsurance, error) {
	if f.lookupErr != nil {
		return nil, f.lookupErr
	}
	return f.insurance, nil
}

func (f *fakeInsuranceRepo) CreateOrderInsuranceClaim(_ context.Context, claim *domain.OrderInsuranceClaim) error {
	if f.claim != nil {
		return domain.ErrInsuranceClaimExists
	}
	f.claim = claim
	return nil
}

func (f *fakeInsuranceRepo) GetOrderInsuranceClaim(context.Context, uuid.UUID, uuid.UUID) (*domain.OrderInsuranceClaim, error) {
	if f.claim == nil {
		return nil, sql.ErrNoRows
	}
	return f.claim, nil
}

type fakeInsuranceConfig struct {
	domain.ConfigRepository
}

func (fakeInsuranceConfig) GetFloatConfig(context.Context, string, float64) float64 { return 0.002 }
func (fakeInsuranceConfig) GetIntConfig(_ context.Context, key string, fallback int) int {
	if key == "insurance_max_coverage_idr" {
		return 10000000
	}
	return fallback
}

func newInsuranceClaimService(repo *fakeInsuranceRepo) domain.InsuranceService {
	return NewInsuranceService(repo, nil, fakeInsuranceConfig{})
}

func TestSubmitOrderInsuranceClaimCreatesInternalHandoff(t *testing.T) {
	orderID, claimantID := uuid.New(), uuid.New()
	repo := &fakeInsuranceRepo{insurance: &domain.OrderInsurance{
		ID:            uuid.New(),
		OrderID:       orderID,
		CoverageLimit: 500000,
		Status:        domain.InsuranceStatusActive,
	}}
	svc := newInsuranceClaimService(repo)
	evidence, err := ValidateInsuranceEvidenceURLs([]string{"https://cdn.example.test/proof.jpg"})
	if err != nil {
		t.Fatalf("valid evidence rejected: %v", err)
	}

	claim, err := svc.SubmitOrderInsuranceClaim(context.Background(), orderID, claimantID, "Paket rusak saat diterima", 250000, evidence)
	if err != nil {
		t.Fatalf("submit claim: %v", err)
	}
	if claim.ID == uuid.Nil || claim.Status != domain.InsuranceClaimStatusSubmitted {
		t.Fatalf("unexpected claim identity/status: %+v", claim)
	}
	if claim.ProviderClaimID != nil {
		t.Fatal("provider claim ID must remain empty before provider acknowledgement")
	}
	var urls []string
	if err := json.Unmarshal(claim.EvidenceURLs, &urls); err != nil || len(urls) != 1 {
		t.Fatalf("evidence not persisted as JSON array: %s", claim.EvidenceURLs)
	}
}

func TestSubmitOrderInsuranceClaimRejectsAmountAboveCoverage(t *testing.T) {
	repo := &fakeInsuranceRepo{insurance: &domain.OrderInsurance{
		ID:            uuid.New(),
		CoverageLimit: 100000,
		Status:        domain.InsuranceStatusActive,
	}}
	_, err := newInsuranceClaimService(repo).SubmitOrderInsuranceClaim(
		context.Background(), uuid.New(), uuid.New(), "Rusak", 100001, json.RawMessage("[]"),
	)
	if !errors.Is(err, domain.ErrInsuranceClaimInvalid) {
		t.Fatalf("expected coverage validation error, got %v", err)
	}
	if repo.claim != nil {
		t.Fatal("invalid claim must not be persisted")
	}
}

func TestSubmitOrderInsuranceClaimMapsMissingCustomerOrder(t *testing.T) {
	repo := &fakeInsuranceRepo{lookupErr: sql.ErrNoRows}
	_, err := newInsuranceClaimService(repo).SubmitOrderInsuranceClaim(
		context.Background(), uuid.New(), uuid.New(), "Rusak", 1000, json.RawMessage("[]"),
	)
	if !errors.Is(err, domain.ErrOrderInsuranceNotFound) {
		t.Fatalf("expected not found error, got %v", err)
	}
}

func TestGetOrderInsuranceClaimMapsMissingClaim(t *testing.T) {
	repo := &fakeInsuranceRepo{}
	_, err := newInsuranceClaimService(repo).GetOrderInsuranceClaim(context.Background(), uuid.New(), uuid.New())
	if !errors.Is(err, domain.ErrInsuranceClaimNotFound) {
		t.Fatalf("expected claim not found error, got %v", err)
	}
}

func TestValidateInsuranceEvidenceURLs(t *testing.T) {
	if _, err := ValidateInsuranceEvidenceURLs([]string{"file:///tmp/proof.jpg"}); !errors.Is(err, domain.ErrInsuranceClaimInvalid) {
		t.Fatalf("expected scheme validation error, got %v", err)
	}
	tooMany := []string{"https://a.test/1", "https://a.test/2", "https://a.test/3", "https://a.test/4", "https://a.test/5", "https://a.test/6"}
	if _, err := ValidateInsuranceEvidenceURLs(tooMany); !errors.Is(err, domain.ErrInsuranceClaimInvalid) {
		t.Fatalf("expected max evidence validation error, got %v", err)
	}
}

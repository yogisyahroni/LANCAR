package repository

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"tembus/order-service/internal/domain"
)

// Run this test with TEMBUS_ORDER_SERVICE_TEST_DATABASE_URL pointing at an
// isolated PostgreSQL database with the CORE-2026-006 migration applied.
func TestProofTokenVerifyRejectsReplayAndWrongActor(t *testing.T) {
	repo := newTestRepo(t)
	if repo == nil {
		return
	}
	ctx := context.Background()

	orderID, _, actorID, category := seedTestOrder(t, ctx, repo, "p2p", "delivering", "package_on_demand")

	stage := domain.ProofStageDelivering
	expiresAt := time.Now().Add(10 * time.Minute).UTC()

	// Issue a token.
	token, plaintext, err := repo.IssueToken(ctx, domain.IssueProofTokenRequest{
		OrderID:     orderID,
		Stage:       stage,
		TokenFormat: domain.TokenFormatNumeric6,
		ExpiresAt:   expiresAt,
		MaxAttempts: 3,
	}, actorID, "courier", category)
	if err != nil {
		t.Fatalf("issue token: %v", err)
	}
	if plaintext == "" {
		t.Fatal("plaintext token should not be empty")
	}
	if len(plaintext) != 6 {
		t.Fatalf("expected 6-digit token, got %d chars: %s", len(plaintext), plaintext)
	}

	// Verify with correct token → success.
	result, err := repo.VerifyToken(ctx, domain.VerifyProofTokenRequest{
		TokenID:    token.ID,
		ActorID:    actorID,
		ProofValue: plaintext,
	})
	if err != nil {
		t.Fatalf("verify token: %v", err)
	}
	if !result.Consumed {
		t.Fatal("expected token to be consumed")
	}

	// Replay: same token → should be rejected as already used.
	_, err = repo.VerifyToken(ctx, domain.VerifyProofTokenRequest{
		TokenID:    token.ID,
		ActorID:    actorID,
		ProofValue: plaintext,
	})
	if err == nil {
		t.Fatal("expected error on replay, got nil")
	}
	if !errors.Is(err, domain.ErrProofTokenUsed) {
		t.Fatalf("expected ErrProofTokenUsed, got: %v", err)
	}

	// Clean up token2 slot: mark as used so we can re-issue for the wrong-actor test.
	// We verify with wrong actor first (token2 still unconsumed).
	token2, plaintext2, err := repo.IssueToken(ctx, domain.IssueProofTokenRequest{
		OrderID:     orderID,
		Stage:       stage,
		TokenFormat: domain.TokenFormatNumeric6,
		ExpiresAt:   expiresAt,
		MaxAttempts: 3,
	}, actorID, "courier", category)
	if err != nil {
		t.Fatalf("issue token2: %v", err)
	}
	wrongActor := uuid.NewString()
	_, err = repo.VerifyToken(ctx, domain.VerifyProofTokenRequest{
		TokenID:    token2.ID,
		ActorID:    wrongActor,
		ProofValue: plaintext2,
	})
	if err == nil {
		t.Fatal("expected error on wrong actor, got nil")
	}

	// Consume token2 so the slot frees for the expired test.
	_, err = repo.VerifyToken(ctx, domain.VerifyProofTokenRequest{
		TokenID:    token2.ID,
		ActorID:    actorID,
		ProofValue: plaintext2,
	})
	if err != nil {
		t.Fatalf("consume token2: %v", err)
	}

	// Expired token: issue with past expiry (token2 consumed, slot free).
	token3, plaintext3, err := repo.IssueToken(ctx, domain.IssueProofTokenRequest{
		OrderID:     orderID,
		Stage:       stage,
		TokenFormat: domain.TokenFormatNumeric6,
		ExpiresAt:   time.Now().Add(-1 * time.Minute),
		MaxAttempts: 3,
	}, actorID, "courier", category)
	if err != nil {
		t.Fatalf("issue token3: %v", err)
	}
	_, err = repo.VerifyToken(ctx, domain.VerifyProofTokenRequest{
		TokenID:    token3.ID,
		ActorID:    actorID,
		ProofValue: plaintext3,
	})
	if err == nil {
		t.Fatal("expected error on expired token, got nil")
	}
	if !errors.Is(err, domain.ErrProofTokenExpired) {
		t.Fatalf("expected ErrProofTokenExpired, got: %v", err)
	}
}

func TestProofTokenMaxAttemptsExhausted(t *testing.T) {
	repo := newTestRepo(t)
	if repo == nil {
		return
	}
	ctx := context.Background()

	orderID, _, actorID, category := seedTestOrder(t, ctx, repo, "food", "delivering", "food")

	stage := domain.ProofStageDelivering
	expiresAt := time.Now().Add(10 * time.Minute).UTC()
	token, _, err := repo.IssueToken(ctx, domain.IssueProofTokenRequest{
		OrderID:     orderID,
		Stage:       stage,
		TokenFormat: domain.TokenFormatNumeric6,
		ExpiresAt:   expiresAt,
		MaxAttempts: 2,
	}, actorID, "courier", category)
	if err != nil {
		t.Fatalf("issue token: %v", err)
	}

	// First wrong attempt.
	_, err = repo.VerifyToken(ctx, domain.VerifyProofTokenRequest{
		TokenID:    token.ID,
		ActorID:    actorID,
		ProofValue: "000000",
	})
	if err == nil {
		t.Fatal("expected error on wrong proof value")
	}

	// Second wrong attempt → exhausted.
	_, err = repo.VerifyToken(ctx, domain.VerifyProofTokenRequest{
		TokenID:    token.ID,
		ActorID:    actorID,
		ProofValue: "111111",
	})
	if err == nil {
		t.Fatal("expected exhausted error on second attempt")
	}
	if !errors.Is(err, domain.ErrProofTokenExhausted) {
		t.Fatalf("expected ErrProofTokenExhausted, got: %v", err)
	}

	// Third attempt → should also be exhausted.
	_, err = repo.VerifyToken(ctx, domain.VerifyProofTokenRequest{
		TokenID:    token.ID,
		ActorID:    actorID,
		ProofValue: "222222",
	})
	if err == nil {
		t.Fatal("expected exhausted error on third attempt")
	}
}

func TestProofRequirementMatrixAndProofExists(t *testing.T) {
	repo := newTestRepo(t)
	if repo == nil {
		return
	}
	ctx := context.Background()

	// Check seeded matrix for package_on_demand delivering.
	reqs, err := repo.GetProofRequirements(ctx, string(domain.CanonicalPackageOnDemand), "delivering")
	if err != nil {
		t.Fatalf("get proof requirements: %v", err)
	}
	foundOTP, foundQR, foundSig, foundPhoto := false, false, false, false
	for _, r := range reqs {
		switch r.ProofType {
		case domain.ProofTypeOTP:
			foundOTP = true
		case domain.ProofTypeQR:
			foundQR = true
		case domain.ProofTypeSignature:
			foundSig = true
		case domain.ProofTypePhoto:
			foundPhoto = true
		}
		if !r.Required {
			t.Errorf("proof type %s should be required", r.ProofType)
		}
	}
	if !foundOTP || !foundQR || !foundSig || !foundPhoto {
		t.Errorf("package_on_demand delivering should require OTP+QR+signature+photo; got %+v", reqs)
	}

	// Check food delivering requires signature + photo.
	foodReqs, err := repo.GetProofRequirements(ctx, string(domain.CanonicalFood), "delivering")
	if err != nil {
		t.Fatalf("get food proof requirements: %v", err)
	}
	if len(foodReqs) != 2 {
		t.Errorf("expected 2 proof requirements for food delivering, got %d", len(foodReqs))
	}
}

func TestProofExistsForStage(t *testing.T) {
	repo := newTestRepo(t)
	if repo == nil {
		return
	}
	ctx := context.Background()

	orderID, customerID, _, _ := seedTestOrder(t, ctx, repo, "p2p", "picked_up", "package_on_demand")

	// No proof yet → false.
	exists, err := repo.ProofExistsForStage(ctx, orderID, "delivered")
	if err != nil {
		t.Fatalf("proof exists check: %v", err)
	}
	if exists {
		t.Fatal("expected no proof for delivered stage")
	}

	// Insert a delivery scan with photo — use the test order's customer_id
	// as scanned_by to satisfy the FK (the FK targets users.id).
	photoURL := "https://cdn.example.test/ePod.jpg"
	if _, err := repo.db.ExecContext(ctx, `
		INSERT INTO package_scans (order_id, scan_type, scanned_by, scanned_by_role, latitude, longitude, photo_url, bag_number, scanned_at)
		VALUES ($1, 'delivered', $2, 'courier', 106.8, -6.2, $3, NULL, NOW())`,
		orderID, customerID, &photoURL); err != nil {
		t.Fatalf("insert scan: %v", err)
	}

	// Now proof exists → true.
	exists, err = repo.ProofExistsForStage(ctx, orderID, "delivered")
	if err != nil {
		t.Fatalf("proof exists check after scan: %v", err)
	}
	if !exists {
		t.Fatal("expected proof to exist after delivery scan")
	}
}

// seedTestOrder inserts a fixture order using a real user ID for customer_id.
func seedTestOrder(t *testing.T, ctx context.Context, repo *postgresRepo, model, status, serviceCategory string) (orderID, customerID, actorID, category string) {
	t.Helper()
	orderID = uuid.NewString()
	var customerIDLookup string
	if err := repo.db.QueryRowContext(ctx, `SELECT id FROM users LIMIT 1`).Scan(&customerIDLookup); err != nil {
		t.Fatalf("lookup test user: %v", err)
	}
	customerID = customerIDLookup
	actorID = uuid.NewString()
	t.Cleanup(func() {
		_, _ = repo.db.ExecContext(ctx, `DELETE FROM proof_verification_tokens WHERE order_id = $1`, orderID)
		_, _ = repo.db.ExecContext(ctx, `DELETE FROM package_scans WHERE order_id = $1`, orderID)
		_, _ = repo.db.ExecContext(ctx, `DELETE FROM orders WHERE id = $1`, orderID)
	})
	if _, err := repo.db.ExecContext(ctx, `
		INSERT INTO orders (id, order_number, customer_id, model, status,
			pickup_location, pickup_address, dropoff_location, dropoff_address,
			base_price_idr, total_price_idr, ppn_idr, mdr_idr, service_category)
		VALUES ($1, $2, $3, $4, $5,
			ST_SetSRID(ST_MakePoint(106.8, -6.2), 4326), 'pickup test',
			ST_SetSRID(ST_MakePoint(106.81, -6.21), 4326), 'dropoff test',
			100000, 100000, 0, 0, $6)`,
		orderID, "proof-test-"+orderID[:12], customerID, model, status, serviceCategory); err != nil {
		t.Fatalf("insert fixture order: %v", err)
	}
	return orderID, customerID, actorID, serviceCategory
}

func newTestRepo(t *testing.T) *postgresRepo {
	t.Helper()
	dsn := os.Getenv("TEMBUS_ORDER_SERVICE_TEST_DATABASE_URL")
	if dsn == "" {
		// Default to local dev DB if not set.
		dsn = "host=localhost port=5432 user=postgres password=1234 dbname=tembus_test_core006 sslmode=disable"
	}
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		t.Skipf("skip: cannot open postgres: %v", err)
		return nil
	}
	db.SetMaxOpenConns(1)
	t.Cleanup(func() { db.Close() })
	return NewPostgresRepository(db, db, nil)
}

// Ensure uuid import is used.
var _ = fmt.Sprintf

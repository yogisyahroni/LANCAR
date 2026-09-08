package repository

import (
	"context"
	"database/sql"
	"os"
	"testing"

	"github.com/lib/pq"
	"tembus/merchant-service/internal/domain"
)

// Opt-in integration coverage for the shared local PostgreSQL database. This
// test proves score calculation, policy gating, reviewed policy inputs,
// scorecard immutability, and the merchant appeal review lifecycle.
func TestMerchantQualityScoreIntegration(t *testing.T) {
	dsn := os.Getenv("TEMBUS_MERCHANT_FINANCE_TEST_DATABASE_URL")
	merchantID := os.Getenv("TEMBUS_MERCHANT_FINANCE_TEST_MERCHANT_ID")
	actorID := os.Getenv("TEMBUS_MERCHANT_FINANCE_TEST_USER_ID")
	if dsn == "" || merchantID == "" || actorID == "" {
		t.Skip("requires TEMBUS_MERCHANT_FINANCE_TEST_DATABASE_URL, merchant/user fixture IDs")
	}

	db, err := sql.Open("postgres", dsn)
	if err != nil {
		t.Fatal(err)
	}
	if err := db.Ping(); err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	var scorecardIDs []string
	const integrationSourceType = "merchant_quality_integration"
	const integrationSourceID = "merchant-quality-score-test"

	t.Cleanup(func() {
		_, _ = db.ExecContext(ctx, `DELETE FROM merchant_quality_appeals WHERE scorecard_id = ANY($1::uuid[])`, pq.Array(scorecardIDs))
		_, _ = db.ExecContext(ctx, `DELETE FROM merchant_quality_review_events WHERE source_type = $1 OR source_id = $2`, integrationSourceType, integrationSourceID)
		_, _ = db.ExecContext(ctx, `ALTER TABLE merchant_quality_scorecards DISABLE TRIGGER trg_prevent_merchant_quality_scorecard_mutation`)
		if len(scorecardIDs) > 0 {
			_, _ = db.ExecContext(ctx, `DELETE FROM merchant_quality_scorecards WHERE id = ANY($1::uuid[])`, pq.Array(scorecardIDs))
		}
		_, _ = db.ExecContext(ctx, `ALTER TABLE merchant_quality_scorecards ENABLE TRIGGER trg_prevent_merchant_quality_scorecard_mutation`)
		_ = db.Close()
	})

	qualityRepo, ok := NewPostgresReportRepository(db, db).(domain.MerchantQualityRepository)
	if !ok {
		t.Fatal("postgres report repository does not implement merchant quality repository")
	}

	first, err := qualityRepo.QualityScore(ctx, merchantID)
	if err != nil {
		t.Fatalf("quality score: %v", err)
	}
	scorecardIDs = append(scorecardIDs, first.ID)
	if first.PolicyVersion != "merchant-quality-v1" || first.WindowDays != 30 {
		t.Fatalf("unexpected policy snapshot: %+v", first)
	}
	if first.WindowStart == "" || first.WindowEnd == "" || first.ComputedAt == "" {
		t.Fatal("scorecard must expose versioned window and computation time")
	}
	if first.Components.CustomerReview == 100 && first.Score == first.Components.CustomerReview {
		t.Fatal("quality score must not be just star rating")
	}
	if !first.SearchEligible || !first.AdsEligible {
		t.Fatal("default policy must not gate discovery while apply flags are disabled")
	}

	// The same authoritative function is used by discovery. Threshold and
	// minimum-volume changes are transactional and explicitly policy-driven.
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	policyID := ""
	if err := tx.QueryRowContext(ctx, `SELECT id::text FROM merchant_quality_policies WHERE policy_version = 'merchant-quality-v1' AND market_code = '*'`).Scan(&policyID); err != nil {
		t.Fatal(err)
	}
	if _, err := tx.ExecContext(ctx, `UPDATE merchant_quality_policies SET apply_to_search = TRUE, apply_to_ads = TRUE, minimum_orders = 999 WHERE id = $1`, policyID); err != nil {
		t.Fatal(err)
	}
	var searchEligible, adsEligible bool
	if err := tx.QueryRowContext(ctx, `SELECT merchant_quality_is_eligible($1, 'search'), merchant_quality_is_eligible($1, 'ads')`, merchantID).Scan(&searchEligible, &adsEligible); err != nil {
		t.Fatal(err)
	}
	if searchEligible || adsEligible {
		t.Fatal("explicit minimum order policy must gate both surfaces")
	}
	if _, err := tx.ExecContext(ctx, `UPDATE merchant_quality_policies SET apply_to_search = FALSE, apply_to_ads = FALSE, minimum_orders = 0 WHERE id = $1`, policyID); err != nil {
		t.Fatal(err)
	}
	if err := tx.Rollback(); err != nil {
		t.Fatal(err)
	}

	if _, err := db.ExecContext(ctx, `
		INSERT INTO merchant_quality_review_events (
			merchant_id, issue_code, severity_points, status, source_type, source_id, summary
		) VALUES ($1, 'safety_review', 25, 'confirmed', $2, $3, 'Confirmed integration review finding')
		ON CONFLICT (merchant_id, source_type, source_id) DO UPDATE SET status = 'confirmed', severity_points = 25`,
		merchantID, integrationSourceType, integrationSourceID); err != nil {
		t.Fatal(err)
	}
	second, err := qualityRepo.QualityScore(ctx, merchantID)
	if err != nil {
		t.Fatalf("quality score after reviewed input: %v", err)
	}
	scorecardIDs = append(scorecardIDs, second.ID)
	if second.Evidence.ConfirmedPolicyIssues != 1 || second.Components.SafetyPolicy >= 100 {
		t.Fatalf("reviewed policy input did not affect score: %+v", second)
	}

	appeal, err := qualityRepo.SubmitQualityAppeal(ctx, merchantID, second.ID, "safety_policy", "Data review keselamatan perlu diperiksa ulang")
	if err != nil {
		t.Fatalf("submit quality appeal: %v", err)
	}
	if appeal.Status != "submitted" {
		t.Fatalf("expected submitted appeal, got %s", appeal.Status)
	}
	reviewed, err := qualityRepo.ReviewQualityAppeal(ctx, actorID, "super_admin", appeal.ID, "rejected", "Bukti review telah diperiksa dan keputusan tetap berlaku")
	if err != nil {
		t.Fatalf("review quality appeal: %v", err)
	}
	if reviewed.Status != "rejected" || reviewed.ReviewedRole != "super_admin" {
		t.Fatalf("unexpected reviewed appeal: %+v", reviewed)
	}
	if _, err := db.ExecContext(ctx, `UPDATE merchant_quality_scorecards SET score = 1 WHERE id = $1`, second.ID); err == nil {
		t.Fatal("scorecard mutation must be rejected")
	}

	// Catalog moderation is a real reviewed policy source, not only a table
	// definition. Verify rejection creates a confirmed event and approval
	// dismisses it again.
	var menuItemID string
	if err := db.QueryRowContext(ctx, `SELECT id::text FROM merchant_menu_items WHERE merchant_id = $1 LIMIT 1`, merchantID).Scan(&menuItemID); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, `UPDATE merchant_menu_items SET moderation_status = 'rejected', moderation_reason = 'Integration quality review' WHERE id = $1`, menuItemID); err != nil {
		t.Fatal(err)
	}
	var eventStatus string
	if err := db.QueryRowContext(ctx, `SELECT status FROM merchant_quality_review_events WHERE merchant_id = $1 AND source_type = 'merchant_menu_item' AND source_id = $2`, merchantID, menuItemID).Scan(&eventStatus); err != nil {
		t.Fatal(err)
	}
	if eventStatus != "confirmed" {
		t.Fatalf("menu rejection should create confirmed quality input, got %s", eventStatus)
	}
	if _, err := db.ExecContext(ctx, `UPDATE merchant_menu_items SET moderation_status = 'approved', moderation_reason = NULL WHERE id = $1`, menuItemID); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRowContext(ctx, `SELECT status FROM merchant_quality_review_events WHERE merchant_id = $1 AND source_type = 'merchant_menu_item' AND source_id = $2`, merchantID, menuItemID).Scan(&eventStatus); err != nil {
		t.Fatal(err)
	}
	if eventStatus != "dismissed" {
		t.Fatalf("menu approval should dismiss quality input, got %s", eventStatus)
	}
	_, _ = db.ExecContext(ctx, `DELETE FROM merchant_quality_review_events WHERE merchant_id = $1 AND source_type = 'merchant_menu_item' AND source_id = $2`, merchantID, menuItemID)
}

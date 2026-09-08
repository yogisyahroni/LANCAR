package experiment

import (
	"context"
	"database/sql"
	"errors"
	"os"
	"sync"
	"testing"

	"github.com/google/uuid"
	_ "github.com/lib/pq"
)

func TestPostgresExperimentAssignmentAndExposureIntegration(t *testing.T) {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		dsn = "postgresql://postgres:1234@localhost:5432/tembus?sslmode=disable"
	}
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		t.Skipf("postgres unavailable: %v", err)
	}
	defer db.Close()
	ctx := context.Background()
	if err := db.PingContext(ctx); err != nil {
		t.Skipf("postgres unavailable: %v", err)
	}

	firstID := uuid.NewString()
	secondID := uuid.NewString()
	key := "integration-experiment-" + firstID[:8]
	secondKey := "integration-experiment-" + secondID[:8]
	for _, item := range []struct{ id, key string }{{firstID, key}, {secondID, secondKey}} {
		_, err := db.ExecContext(ctx, `
			INSERT INTO experiments (id, key, name, namespace, status, version, targeting, variants, guardrails)
			VALUES ($1, $2, 'Integration experiment', 'integration-exclusive', 'running', 1, '{}'::jsonb,
			'[{"key":"control","weight_basis_points":5000,"payload":{}},{"key":"treatment","weight_basis_points":5000,"payload":{}}]'::jsonb,
			'[{"metric":"cancellation_rate","event_types":["order.cancelled"],"threshold":1,"direction":"max"}]'::jsonb)`, item.id, item.key)
		if err != nil {
			t.Fatalf("insert experiment %s: %v", item.key, err)
		}
	}
	defer func() {
		_, _ = db.ExecContext(ctx, `DELETE FROM event_outbox WHERE aggregate_id IN ($1, $2)`, firstID, secondID)
		_, _ = db.ExecContext(ctx, `DELETE FROM experiments WHERE id IN ($1, $2)`, firstID, secondID)
	}()

	service := NewService(NewRepository(db), "integration-server-assignment-secret")
	var decision *AssignmentDecision
	var subjectID string
	for i := 0; i < 100; i++ {
		subjectID = "integration-customer-" + uuid.NewString()
		decision, err = service.Assign(ctx, key, "customer", subjectID, EvaluationContext{ServiceCode: "food_delivery"})
		if err != nil {
			t.Fatalf("assign experiment: %v", err)
		}
		if decision.Assignment != nil && decision.Assignment.Variant == "treatment" {
			break
		}
	}
	if decision == nil || decision.Assignment == nil || decision.Assignment.Variant != "treatment" {
		t.Fatal("could not obtain a treatment assignment")
	}
	var controlDecision *AssignmentDecision
	var controlSubjectID string
	for i := 0; i < 100; i++ {
		controlSubjectID = "integration-control-" + uuid.NewString()
		controlDecision, err = service.Assign(ctx, key, "customer", controlSubjectID, EvaluationContext{ServiceCode: "food_delivery"})
		if err != nil {
			t.Fatalf("assign control candidate: %v", err)
		}
		if controlDecision.Assignment != nil && controlDecision.Assignment.Variant == "control" {
			break
		}
	}
	if controlDecision == nil || controlDecision.Assignment == nil || controlDecision.Assignment.Variant != "control" {
		t.Fatal("could not obtain a control assignment")
	}
	if _, err := service.Expose(ctx, key, "customer", controlSubjectID, controlDecision.Assignment.ID, "seen", "food-home", "id-jk"); !errors.Is(err, ErrNotTreatment) {
		t.Fatalf("control assignment should not create exposure, got %v", err)
	}
	secondDecision, err := service.Assign(ctx, key, "customer", subjectID, EvaluationContext{ServiceCode: "food_delivery"})
	if err != nil || secondDecision.Assignment.ID != decision.Assignment.ID || secondDecision.Assignment.Variant != decision.Assignment.Variant {
		t.Fatalf("assignment was not stable: first=%#v second=%#v err=%v", decision.Assignment, secondDecision.Assignment, err)
	}

	if _, err := service.Assign(ctx, secondKey, "customer", subjectID, EvaluationContext{}); !errors.Is(err, ErrNamespaceConflict) {
		t.Fatalf("expected namespace conflict, got %v", err)
	}
	concurrentSubject := "integration-concurrent-" + uuid.NewString()
	results := make(chan error, 2)
	var wg sync.WaitGroup
	for _, experimentKey := range []string{key, secondKey} {
		wg.Add(1)
		go func(currentKey string) {
			defer wg.Done()
			_, assignErr := service.Assign(ctx, currentKey, "customer", concurrentSubject, EvaluationContext{})
			results <- assignErr
		}(experimentKey)
	}
	wg.Wait()
	close(results)
	var assigned, conflicts int
	for assignErr := range results {
		switch {
		case assignErr == nil:
			assigned++
		case errors.Is(assignErr, ErrNamespaceConflict):
			conflicts++
		default:
			t.Fatalf("unexpected concurrent assignment error: %v", assignErr)
		}
	}
	if assigned != 1 || conflicts != 1 {
		t.Fatalf("exclusive namespace race was not serialized: assigned=%d conflicts=%d", assigned, conflicts)
	}
	exposure, err := service.Expose(ctx, key, "customer", subjectID, decision.Assignment.ID, "seen", "food-home", "id-jk")
	if err != nil {
		t.Fatalf("record exposure: %v", err)
	}
	replay, err := service.Expose(ctx, key, "customer", subjectID, decision.Assignment.ID, "seen", "food-home", "id-jk")
	if err != nil || !replay.AlreadyRecorded || replay.ID != exposure.ID {
		t.Fatalf("exposure replay mismatch: first=%#v replay=%#v err=%v", exposure, replay, err)
	}
	var exposureCount, outboxCount int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM experiment_exposures WHERE assignment_id = $1`, decision.Assignment.ID).Scan(&exposureCount); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM event_outbox WHERE aggregate_id = $1 AND event_type = 'experiment.exposure'`, firstID).Scan(&outboxCount); err != nil {
		t.Fatal(err)
	}
	if exposureCount != 1 || outboxCount != 1 {
		t.Fatalf("expected one exposure and one event, got exposure=%d outbox=%d", exposureCount, outboxCount)
	}
	if _, err := db.ExecContext(ctx, `UPDATE experiments SET status = 'killed' WHERE id = $1`, firstID); err != nil {
		t.Fatal(err)
	}
	if killed, err := service.Assign(ctx, key, "customer", subjectID, EvaluationContext{}); err != nil || killed.Eligible || killed.Reason != "disabled" {
		t.Fatalf("kill switch should disable assignment: decision=%#v err=%v", killed, err)
	}
	if _, err := service.Expose(ctx, key, "customer", subjectID, decision.Assignment.ID, "used", "food-home", "id-jk"); !errors.Is(err, ErrExperimentDisabled) {
		t.Fatalf("kill switch should disable exposure, got %v", err)
	}

	var rawSubjectCount int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM experiment_assignments WHERE subject_hash = $1`, subjectID).Scan(&rawSubjectCount); err != nil {
		t.Fatal(err)
	}
	if rawSubjectCount != 0 {
		t.Fatalf("raw subject identifier was persisted")
	}
}

package experiment

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"tembus/order-service/internal/domain"

	"github.com/google/uuid"
)

type Repository struct {
	db *sql.DB
}

func NewRepository(db *sql.DB) *Repository {
	return &Repository{db: db}
}

func (r *Repository) GetExperiment(ctx context.Context, key string) (*Experiment, error) {
	var (
		exp                         Experiment
		targetingJSON, variantsJSON []byte
		guardrailsJSON              []byte
		killReason                  sql.NullString
	)
	err := r.db.QueryRowContext(ctx, `
		SELECT id::text, key, name, namespace, status, version, targeting, variants, guardrails, kill_reason
		FROM experiments
		WHERE key = $1
		LIMIT 1`, key).Scan(
		&exp.ID, &exp.Key, &exp.Name, &exp.Namespace, &exp.Status, &exp.Version,
		&targetingJSON, &variantsJSON, &guardrailsJSON, &killReason,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrExperimentNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get experiment: %w", err)
	}
	if err := json.Unmarshal(targetingJSON, &exp.Targeting); err != nil {
		return nil, fmt.Errorf("decode experiment targeting: %w", err)
	}
	if err := json.Unmarshal(variantsJSON, &exp.Variants); err != nil {
		return nil, fmt.Errorf("decode experiment variants: %w", err)
	}
	if err := json.Unmarshal(guardrailsJSON, &exp.Guardrails); err != nil {
		return nil, fmt.Errorf("decode experiment guardrails: %w", err)
	}
	if killReason.Valid {
		exp.KillReason = killReason.String
	}
	return &exp, nil
}

func (r *Repository) SaveAssignment(ctx context.Context, exp Experiment, assignment Assignment) (*Assignment, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin assignment transaction: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	lockKey := exp.Namespace + "|" + assignment.SubjectType + "|" + assignment.SubjectHash
	if _, err := tx.ExecContext(ctx, `SELECT pg_advisory_xact_lock(hashtext($1))`, lockKey); err != nil {
		return nil, fmt.Errorf("lock experiment namespace: %w", err)
	}
	var conflict string
	err = tx.QueryRowContext(ctx, `
		SELECT e.key
		FROM experiment_assignments ea
		JOIN experiments e ON e.id = ea.experiment_id
		WHERE e.namespace = $1
		  AND ea.subject_type = $2
		  AND ea.subject_hash = $3
		  AND e.status = 'running'
		  AND e.id <> $4
		LIMIT 1`, exp.Namespace, assignment.SubjectType, assignment.SubjectHash, exp.ID).Scan(&conflict)
	if err == nil {
		return nil, ErrNamespaceConflict
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return nil, fmt.Errorf("check exclusive experiment namespace: %w", err)
	}

	var (
		stored      Assignment
		payloadJSON []byte
	)
	err = tx.QueryRowContext(ctx, `
		INSERT INTO experiment_assignments (
			experiment_id, subject_type, subject_hash, bucket, variant,
			experiment_version, targeting_snapshot, variant_payload, assigned_at, last_seen_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, NOW(), NOW())
		ON CONFLICT (experiment_id, subject_type, subject_hash)
		DO UPDATE SET last_seen_at = NOW()
		RETURNING id::text, variant, bucket, experiment_version, variant_payload`,
		exp.ID, assignment.SubjectType, assignment.SubjectHash,
		assignment.Bucket, assignment.Variant, assignment.ExperimentVersion,
		jsonString(exp.Targeting), jsonString(assignment.Payload),
	).Scan(&stored.ID, &stored.Variant, &stored.Bucket, &stored.ExperimentVersion, &payloadJSON)
	if err != nil {
		return nil, fmt.Errorf("persist experiment assignment: %w", err)
	}
	if len(payloadJSON) > 0 {
		_ = json.Unmarshal(payloadJSON, &stored.Payload)
	}
	stored.ExperimentKey = exp.Key
	stored.ExperimentID = exp.ID
	stored.Namespace = exp.Namespace
	stored.SubjectType = assignment.SubjectType
	stored.SubjectHash = assignment.SubjectHash
	stored.AssignmentKey = assignment.AssignmentKey
	if stored.ExperimentVersion == 0 {
		stored.ExperimentVersion = assignment.ExperimentVersion
	}
	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit experiment assignment: %w", err)
	}
	return &stored, nil
}

func (r *Repository) RecordExposure(ctx context.Context, exp Experiment, assignment Assignment, subjectHash, exposureType, surface, market string) (*Exposure, error) {
	if assignment.ID == "" || exp.ID == "" {
		return nil, ErrAssignmentMismatch
	}
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin exposure transaction: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	var (
		storedVariant string
		storedHash    string
		storedExpID   string
	)
	err = tx.QueryRowContext(ctx, `
		SELECT ea.variant, ea.subject_hash, ea.experiment_id::text
		FROM experiment_assignments ea
		JOIN experiments e ON e.id = ea.experiment_id
		WHERE ea.id = $1 AND e.key = $2 AND e.status = 'running'
		FOR UPDATE`, assignment.ID, exp.Key).Scan(&storedVariant, &storedHash, &storedExpID)
	if errors.Is(err, sql.ErrNoRows) || storedExpID != exp.ID {
		return nil, ErrAssignmentMismatch
	}
	if err != nil {
		return nil, fmt.Errorf("load assignment for exposure: %w", err)
	}
	if storedHash != subjectHash {
		return nil, ErrAssignmentMismatch
	}
	if storedVariant != "treatment" {
		return nil, ErrNotTreatment
	}

	exposureID := uuid.NewString()
	dedupeKey := exposureDedupeKey(assignment.ID, exposureType, surface)
	var storedID string
	err = tx.QueryRowContext(ctx, `
		INSERT INTO experiment_exposures (
			id, assignment_id, experiment_id, exposure_type, surface, dedupe_key, occurred_at
		) VALUES ($1, $2, $3, $4, $5, $6, NOW())
		ON CONFLICT (assignment_id, exposure_type, surface) DO NOTHING
		RETURNING id::text`, exposureID, assignment.ID, exp.ID, exposureType, surface, dedupeKey).Scan(&storedID)
	if errors.Is(err, sql.ErrNoRows) {
		if err := tx.QueryRowContext(ctx, `
			SELECT id::text FROM experiment_exposures
			WHERE assignment_id = $1 AND exposure_type = $2 AND surface = $3`,
			assignment.ID, exposureType, surface).Scan(&storedID); err != nil {
			return nil, fmt.Errorf("load existing exposure: %w", err)
		}
		if err := tx.Commit(); err != nil {
			return nil, fmt.Errorf("commit existing exposure: %w", err)
		}
		return &Exposure{ID: storedID, AlreadyRecorded: true}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("persist experiment exposure: %w", err)
	}

	canonical := domain.NewCanonicalEvent("experiment.exposure", storedID, subjectHash, map[string]interface{}{
		"experiment_key": exp.Key,
		"experiment_id":  exp.ID,
		"namespace":      exp.Namespace,
		"variant":        storedVariant,
		"exposure_type":  exposureType,
		"surface":        surface,
		"assignment_key": assignment.AssignmentKey,
	})
	canonical.Market = strings.ToLower(strings.TrimSpace(market))
	canonical.Service = "order-service"
	payload, err := json.Marshal(canonical.Data)
	if err != nil {
		return nil, fmt.Errorf("encode exposure event: %w", err)
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO event_outbox (
			id, aggregate_type, aggregate_id, event_type, event_version, payload, headers,
			occurred_at, produced_at, market_code, service_name, actor_pseudonymous_id,
			entity_id, correlation_id, trace_id, pii_classification, field_pii_classification,
			retention_class, dedupe_key, available_at
		) VALUES ($1, 'experiment', $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::jsonb, $17, $18, NOW())`,
		canonical.EventID, exp.ID, canonical.EventType, canonical.SchemaVersion,
		string(payload), `{"source":"order-service","event":"experiment.exposure"}`,
		canonical.OccurredAt, canonical.ProducedAt, canonical.Market, canonical.Service,
		canonical.ActorPseudonymousID, canonical.EntityID, canonical.CorrelationID,
		canonical.TraceID, canonical.PIIClassification, jsonString(canonical.FieldPIIClassification),
		canonical.RetentionClass, canonical.DedupeKey,
	); err != nil {
		return nil, fmt.Errorf("enqueue exposure event: %w", err)
	}
	if _, err := tx.ExecContext(ctx, `
		UPDATE experiment_assignments
		SET first_exposure_at = COALESCE(first_exposure_at, NOW()), last_exposure_at = NOW()
		WHERE id = $1`, assignment.ID); err != nil {
		return nil, fmt.Errorf("mark assignment exposed: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit experiment exposure: %w", err)
	}
	return &Exposure{ID: storedID}, nil
}

func jsonString(value interface{}) string {
	data, _ := json.Marshal(value)
	return string(data)
}

func exposureDedupeKey(assignmentID, exposureType, surface string) string {
	return fmt.Sprintf("experiment-exposure:%s:%s:%s", assignmentID, exposureType, surface)
}

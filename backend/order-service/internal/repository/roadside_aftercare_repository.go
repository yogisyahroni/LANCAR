package repository

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"tembus/order-service/internal/domain"
	"time"
)

type roadsideAftercareRepo struct{ db *sql.DB }

func NewRoadsideAftercareRepository(db *sql.DB) domain.RoadsideAftercareRepository {
	return &roadsideAftercareRepo{db: db}
}

type finalRoadsideEvidence struct {
	ReportID, OrderID, CourierID                         string
	ConditionBefore, BeforePhoto, Materials, Notes      string
	ConditionAfter, AfterPhoto                          string
	DurationMinutes                                     int
	CompletedAt                                         time.Time
}

func (r *roadsideAftercareRepo) SubmitClaim(ctx context.Context, req *domain.SubmitRoadsideClaimRequest, customerID string) (*domain.RoadsideServiceClaim, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil { return nil, err }
	defer tx.Rollback()
	if _, err = tx.ExecContext(ctx, `SELECT pg_advisory_xact_lock(hashtext($1))`, "roadside-aftercare:"+req.OrderID); err != nil { return nil, err }

	if old, hash, e := claimByKey(ctx, tx, customerID, req.IdempotencyKey); e == nil {
		if old.OrderID == req.OrderID && hash == req.RequestFingerprint { return old, nil }
		return nil, domain.ErrRoadsideAftercareIdempotency
	} else if !errors.Is(e, sql.ErrNoRows) { return nil, e }

	ev, snapshot, hash, err := finalEvidence(ctx, tx, req.OrderID, customerID)
	if err != nil { return nil, err }
	item := &domain.RoadsideServiceClaim{}
	err = tx.QueryRowContext(ctx, `INSERT INTO roadside_service_claims
		(order_id,customer_id,courier_id,report_id,report_snapshot,report_snapshot_hash,issue_type,description,idempotency_key,request_hash,correlation_id)
		VALUES($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,NULLIF($11,''))
		RETURNING id::text,order_id::text,customer_id::text,courier_id::text,report_id::text,report_snapshot_hash,issue_type,description,status,created_at`,
		req.OrderID, customerID, ev.CourierID, ev.ReportID, snapshot, hash, req.IssueType, req.Description, req.IdempotencyKey, req.RequestFingerprint, req.CorrelationID,
	).Scan(&item.ID,&item.OrderID,&item.CustomerID,&item.CourierID,&item.ReportID,&item.ReportSnapshotHash,&item.IssueType,&item.Description,&item.Status,&item.CreatedAt)
	if err != nil { return nil, fmt.Errorf("insert roadside claim: %w", err) }
	if err = aftercareAudit(ctx, tx, customerID, "roadside_claim.submitted", item.ID, item.OrderID, item.ReportID, item.ReportSnapshotHash); err != nil { return nil, err }
	if err = tx.Commit(); err != nil { return nil, err }
	return item, nil
}

func (r *roadsideAftercareRepo) SubmitRating(ctx context.Context, req *domain.SubmitRoadsideRatingRequest, customerID string) (*domain.RoadsideServiceRating, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil { return nil, err }
	defer tx.Rollback()
	if _, err = tx.ExecContext(ctx, `SELECT pg_advisory_xact_lock(hashtext($1))`, "roadside-aftercare:"+req.OrderID); err != nil { return nil, err }

	if old, hash, e := ratingByKey(ctx, tx, customerID, req.IdempotencyKey); e == nil {
		if old.OrderID == req.OrderID && hash == req.RequestFingerprint { return old, nil }
		return nil, domain.ErrRoadsideAftercareIdempotency
	} else if !errors.Is(e, sql.ErrNoRows) { return nil, e }
	var exists bool
	if err = tx.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM roadside_service_ratings WHERE order_id=$1)`, req.OrderID).Scan(&exists); err != nil { return nil, err }
	if exists { return nil, domain.ErrRoadsideAftercareConflict }

	ev, snapshot, hash, err := finalEvidence(ctx, tx, req.OrderID, customerID)
	if err != nil { return nil, err }
	item := &domain.RoadsideServiceRating{}
	err = tx.QueryRowContext(ctx, `INSERT INTO roadside_service_ratings
		(order_id,customer_id,courier_id,report_id,report_snapshot,report_snapshot_hash,overall_rating,technician_quality_rating,comment,idempotency_key,request_hash,correlation_id)
		VALUES($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11,NULLIF($12,''))
		RETURNING id::text,order_id::text,customer_id::text,courier_id::text,report_id::text,report_snapshot_hash,overall_rating,technician_quality_rating,comment,created_at`,
		req.OrderID, customerID, ev.CourierID, ev.ReportID, snapshot, hash, req.OverallRating, req.TechnicianQualityRating, req.Comment, req.IdempotencyKey, req.RequestFingerprint, req.CorrelationID,
	).Scan(&item.ID,&item.OrderID,&item.CustomerID,&item.CourierID,&item.ReportID,&item.ReportSnapshotHash,&item.OverallRating,&item.TechnicianQualityRating,&item.Comment,&item.CreatedAt)
	if err != nil { return nil, fmt.Errorf("insert roadside rating: %w", err) }
	if err = aftercareAudit(ctx, tx, customerID, "roadside_rating.submitted", item.ID, item.OrderID, item.ReportID, item.ReportSnapshotHash); err != nil { return nil, err }
	if err = tx.Commit(); err != nil { return nil, err }
	return item, nil
}

func finalEvidence(ctx context.Context, tx *sql.Tx, orderID, customerID string) (*finalRoadsideEvidence, []byte, string, error) {
	e := &finalRoadsideEvidence{}
	err := tx.QueryRowContext(ctx, `SELECT r.id::text,o.id::text,r.courier_id::text,
		COALESCE(r.tire_condition_before,''),COALESCE(r.tire_photo_before_url,''),COALESCE(r.service_duration_minutes,0),
		COALESCE(r.materials_used,''),COALESCE(r.notes,''),COALESCE(r.tire_condition_after,''),COALESCE(r.tire_photo_after_url,''),r.completed_at
		FROM orders o JOIN tambal_ban_reports r ON r.order_id=o.id
		WHERE o.id=$1 AND o.customer_id=$2 AND COALESCE(o.service_sub_type,'') LIKE 'tambal_ban%'
		AND r.completed_at IS NOT NULL AND BTRIM(COALESCE(r.tire_photo_before_url,''))<>'' AND BTRIM(COALESCE(r.tire_photo_after_url,''))<>''
		ORDER BY r.completed_at DESC LIMIT 1 FOR SHARE OF o,r`, orderID, customerID).Scan(
		&e.ReportID,&e.OrderID,&e.CourierID,&e.ConditionBefore,&e.BeforePhoto,&e.DurationMinutes,&e.Materials,&e.Notes,&e.ConditionAfter,&e.AfterPhoto,&e.CompletedAt)
	if errors.Is(err, sql.ErrNoRows) {
		var owns bool
		if qerr := tx.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM orders WHERE id=$1 AND customer_id=$2)`, orderID, customerID).Scan(&owns); qerr != nil { return nil,nil,"",qerr }
		if !owns { return nil,nil,"",domain.ErrRoadsideAftercareForbidden }
		return nil,nil,"",domain.ErrRoadsideAftercareMissingProof
	}
	if err != nil { return nil,nil,"",err }
	payload, err := json.Marshal(e)
	if err != nil { return nil,nil,"",err }
	sum := sha256.Sum256(payload)
	return e, payload, hex.EncodeToString(sum[:]), nil
}

func claimByKey(ctx context.Context, tx *sql.Tx, customerID, key string) (*domain.RoadsideServiceClaim,string,error) {
	i := &domain.RoadsideServiceClaim{}; var h string
	err := tx.QueryRowContext(ctx, `SELECT id::text,order_id::text,customer_id::text,courier_id::text,report_id::text,report_snapshot_hash,issue_type,description,status,created_at,request_hash FROM roadside_service_claims WHERE customer_id=$1 AND idempotency_key=$2`,customerID,key).Scan(&i.ID,&i.OrderID,&i.CustomerID,&i.CourierID,&i.ReportID,&i.ReportSnapshotHash,&i.IssueType,&i.Description,&i.Status,&i.CreatedAt,&h)
	return i,h,err
}

func ratingByKey(ctx context.Context, tx *sql.Tx, customerID, key string) (*domain.RoadsideServiceRating,string,error) {
	i := &domain.RoadsideServiceRating{}; var h string
	err := tx.QueryRowContext(ctx, `SELECT id::text,order_id::text,customer_id::text,courier_id::text,report_id::text,report_snapshot_hash,overall_rating,technician_quality_rating,comment,created_at,request_hash FROM roadside_service_ratings WHERE customer_id=$1 AND idempotency_key=$2`,customerID,key).Scan(&i.ID,&i.OrderID,&i.CustomerID,&i.CourierID,&i.ReportID,&i.ReportSnapshotHash,&i.OverallRating,&i.TechnicianQualityRating,&i.Comment,&i.CreatedAt,&h)
	return i,h,err
}

func aftercareAudit(ctx context.Context, tx *sql.Tx, actorID, action, targetID, orderID, reportID, snapshotHash string) error {
	payload, _ := json.Marshal(map[string]string{"order_id":orderID,"report_id":reportID,"report_snapshot_hash":snapshotHash})
	_, err := tx.ExecContext(ctx, `INSERT INTO audit_logs(actor_id,action,target_id,payload) VALUES($1,$2,$3,$4::jsonb)`,actorID,action,targetID,payload)
	return err
}

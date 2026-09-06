package domain

import (
	"context"
	"errors"
	"time"
)

var (
	ErrInvalidRoadsideAftercare      = errors.New("invalid roadside aftercare request")
	ErrRoadsideAftercareForbidden    = errors.New("roadside aftercare forbidden")
	ErrRoadsideAftercareMissingProof = errors.New("roadside final proof is required")
	ErrRoadsideAftercareConflict     = errors.New("roadside aftercare conflict")
	ErrRoadsideAftercareIdempotency  = errors.New("roadside aftercare idempotency conflict")
)

const (
	RoadsideClaimIssueWarranty       = "warranty"
	RoadsideClaimIssueServiceQuality = "service_quality"
	RoadsideClaimIssueDamage         = "damage"
	RoadsideClaimIssueOther          = "other"
)

type RoadsideServiceClaim struct {
	ID                 string    `json:"id"`
	OrderID            string    `json:"order_id"`
	CustomerID         string    `json:"customer_id"`
	CourierID          string    `json:"courier_id"`
	ReportID           string    `json:"report_id"`
	ReportSnapshotHash string    `json:"report_snapshot_hash"`
	IssueType          string    `json:"issue_type"`
	Description        string    `json:"description"`
	Status             string    `json:"status"`
	CreatedAt          time.Time `json:"created_at"`
}

type RoadsideServiceRating struct {
	ID                      string    `json:"id"`
	OrderID                 string    `json:"order_id"`
	CustomerID              string    `json:"customer_id"`
	CourierID               string    `json:"courier_id"`
	ReportID                string    `json:"report_id"`
	ReportSnapshotHash      string    `json:"report_snapshot_hash"`
	OverallRating           int       `json:"overall_rating"`
	TechnicianQualityRating int       `json:"technician_quality_rating"`
	Comment                 string    `json:"comment,omitempty"`
	CreatedAt               time.Time `json:"created_at"`
}

type SubmitRoadsideClaimRequest struct {
	OrderID            string `json:"order_id"`
	IssueType          string `json:"issue_type"`
	Description        string `json:"description"`
	IdempotencyKey     string `json:"-"`
	RequestFingerprint string `json:"-"`
	CorrelationID      string `json:"-"`
}

type SubmitRoadsideRatingRequest struct {
	OrderID                 string `json:"order_id"`
	OverallRating           int    `json:"overall_rating"`
	TechnicianQualityRating int    `json:"technician_quality_rating"`
	Comment                 string `json:"comment,omitempty"`
	IdempotencyKey          string `json:"-"`
	RequestFingerprint      string `json:"-"`
	CorrelationID           string `json:"-"`
}

type RoadsideAftercareRepository interface {
	SubmitClaim(ctx context.Context, req *SubmitRoadsideClaimRequest, customerID string) (*RoadsideServiceClaim, error)
	SubmitRating(ctx context.Context, req *SubmitRoadsideRatingRequest, customerID string) (*RoadsideServiceRating, error)
}

type RoadsideAftercareService interface {
	SubmitClaim(ctx context.Context, req *SubmitRoadsideClaimRequest, customerID string) (*RoadsideServiceClaim, error)
	SubmitRating(ctx context.Context, req *SubmitRoadsideRatingRequest, customerID string) (*RoadsideServiceRating, error)
}

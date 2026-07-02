package domain

import (
	"context"
	"time"

	"github.com/google/uuid"
)

type SosStatus string

const (
	SosStatusBroadcasted  SosStatus = "broadcasted"
	SosStatusAccepted     SosStatus = "accepted"
	SosStatusResolvedReal SosStatus = "resolved_real"
	SosStatusResolvedFake SosStatus = "resolved_fake"
	SosStatusAbandoned    SosStatus = "abandoned"
	SosStatusDisputed     SosStatus = "disputed"
)

// NearbyCourier merepresentasikan kurir yang ditemukan dalam radius SOS geo-query.
type NearbyCourier struct {
	CourierProfileID uuid.UUID `db:"courier_profile_id"`
	UserID           uuid.UUID `db:"user_id"`
	DistanceMeters   float64   `db:"distance_meters"`
}

type SosIncident struct {
	ID                 uuid.UUID  `json:"id" db:"id"`
	VictimCourierID    uuid.UUID  `json:"victim_courier_id" db:"victim_courier_id"`
	Latitude           float64    `json:"latitude" db:"latitude"`
	Longitude          float64    `json:"longitude" db:"longitude"`
	Status             SosStatus  `json:"status" db:"status"`
	ResolutionPhotoURL *string    `json:"resolution_photo_url" db:"resolution_photo_url"`
	ResolvedAt         *time.Time `json:"resolved_at" db:"resolved_at"`
	IsTampered         bool       `json:"is_tampered" db:"is_tampered"`
	CreatedAt          time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt          time.Time  `json:"updated_at" db:"updated_at"`

	Helpers []SosHelper `json:"helpers,omitempty" db:"-"`
}

type SosHelper struct {
	IncidentID      uuid.UUID  `json:"incident_id" db:"incident_id"`
	HelperCourierID uuid.UUID  `json:"helper_courier_id" db:"helper_courier_id"`
	Status          string     `json:"status" db:"status"` // ACCEPTED, ARRIVED, ABANDONED
	Verdict         *string    `json:"verdict" db:"verdict"` // PRANK, REAL
	PhotoURL        *string    `json:"photo_url" db:"photo_url"`
	ReportedAt      *time.Time `json:"reported_at" db:"reported_at"`
	CreatedAt       time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt       time.Time  `json:"updated_at" db:"updated_at"`
}

type SosTriggerRequest struct {
	VictimID  uuid.UUID `json:"-"`
	Latitude  float64   `json:"latitude" validate:"required"`
	Longitude float64   `json:"longitude" validate:"required"`
}

type SosAcceptRequest struct {
	IncidentID uuid.UUID `json:"incident_id" validate:"required"`
	HelperID   uuid.UUID `json:"-"`
}

type SosResolveRequest struct {
	IncidentID uuid.UUID `json:"incident_id" validate:"required"`
	VictimID   uuid.UUID `json:"-"`
	Verdict    string    `json:"verdict" validate:"required,oneof=REAL PRANK"`
	PhotoURL   string    `json:"photo_url" validate:"required,url"`
}

type SosSubmitReportRequest struct {
	IncidentID uuid.UUID `json:"incident_id" validate:"required"`
	HelperID   uuid.UUID `json:"-"`
	Verdict    string    `json:"verdict" validate:"required,oneof=REAL PRANK"`
	PhotoURL   string    `json:"photo_url" validate:"required,url"`
}

type SosTamperRequest struct {
	IncidentID uuid.UUID `json:"incident_id" validate:"required"`
	VictimID   uuid.UUID `json:"-"`
}

type SosArriveRequest struct {
	IncidentID uuid.UUID `json:"incident_id" validate:"required"`
	HelperID   uuid.UUID `json:"-"`
}

type SosRepository interface {
	CreateIncident(ctx context.Context, incident *SosIncident) error
	GetIncidentByID(ctx context.Context, id uuid.UUID) (*SosIncident, error)
	UpdateIncident(ctx context.Context, incident *SosIncident) error
	GetStaleIncidents(ctx context.Context, olderThan time.Duration) ([]SosIncident, error)
	SetPriorityMultiplier(ctx context.Context, courierID uuid.UUID, duration time.Duration) error
	CountFakeSOSByVictim(ctx context.Context, victimID uuid.UUID) (int, error)
	SuspendCourier(ctx context.Context, courierID uuid.UUID, duration time.Duration) error
	TerminateCourier(ctx context.Context, courierID uuid.UUID) error
	MarkAsTampered(ctx context.Context, incidentID uuid.UUID) error

	// Multi-Helper methods
	AddHelperToIncident(ctx context.Context, incidentID, helperID uuid.UUID) error
	GetHelpersByIncident(ctx context.Context, incidentID uuid.UUID) ([]SosHelper, error)
	GetHelperCountByIncident(ctx context.Context, incidentID uuid.UUID) (int, error)
	UpdateHelperReport(ctx context.Context, incidentID, helperID uuid.UUID, verdict string, photoURL string) error
	UpdateHelperStatus(ctx context.Context, incidentID, helperID uuid.UUID, status string) error

	// Geo-Radius Broadcast methods
	GetNearbyCouriersForSOS(ctx context.Context, lat, lng float64, radiusMeters float64, limit int) ([]NearbyCourier, error)
	GetFCMTokensByUserIDs(ctx context.Context, userIDs []uuid.UUID) (map[uuid.UUID][]string, error)
	GetUserIDByCourierProfileID(ctx context.Context, profileID uuid.UUID) (uuid.UUID, error)
	GetUserNameByID(ctx context.Context, userID uuid.UUID) (string, error)
}

type SosService interface {
	TriggerSOS(ctx context.Context, req SosTriggerRequest) (uuid.UUID, error)
	AcceptSOS(ctx context.Context, req SosAcceptRequest) (*SosIncident, error)
	SubmitHelperReport(ctx context.Context, req SosSubmitReportRequest) error
	CheckAndResolveConsensus(ctx context.Context, incidentID uuid.UUID) error
	CloseStaleIncidents(ctx context.Context) error
	MarkAsTampered(ctx context.Context, req SosTamperRequest) error
	ArriveAtSOS(ctx context.Context, req SosArriveRequest) error
}

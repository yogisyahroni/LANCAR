package domain

import "context"

// TrackingPollTarget is a durable shipment reference owned by order-service.
// The gateway never invents targets; it polls only rows returned by this contract.
type TrackingPollTarget struct {
	Provider string `json:"provider"`
	AWB      string `json:"awb_number"`
}

type TrackingPollTargetSource interface {
	ListTrackingPollTargets(ctx context.Context) ([]TrackingPollTarget, error)
}

type TrackingPollEventSink interface {
	PublishCarrierEvent(ctx context.Context, event CarrierEvent) error
}

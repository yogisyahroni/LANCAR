package worker

import (
	"context"
	"errors"
	"log/slog"
	"time"

	"tembus/integration-gateway/internal/domain"
	"tembus/integration-gateway/internal/provider"
)

// TrackingPollWorker is the pull fallback for providers that do not publish
// webhooks. Webhook-capable providers are skipped by default and can opt into
// periodic reconciliation explicitly through the constructor flag.
type TrackingPollWorker struct {
	source            domain.TrackingPollTargetSource
	sink              domain.TrackingPollEventSink
	registry          domain.LogisticsProviderRegistry
	interval          time.Duration
	reconcileWebhooks bool
}

func NewTrackingPollWorker(
	source domain.TrackingPollTargetSource,
	sink domain.TrackingPollEventSink,
	registry domain.LogisticsProviderRegistry,
	interval time.Duration,
	reconcileWebhooks bool,
) *TrackingPollWorker {
	if interval <= 0 {
		interval = 5 * time.Minute
	}
	return &TrackingPollWorker{source: source, sink: sink, registry: registry, interval: interval, reconcileWebhooks: reconcileWebhooks}
}

func (w *TrackingPollWorker) Run(ctx context.Context) {
	if err := w.RunOnce(ctx); err != nil {
		slog.ErrorContext(ctx, "tracking_poll: initial run failed", "error", err)
	}
	ticker := time.NewTicker(w.interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if err := w.RunOnce(ctx); err != nil {
				slog.ErrorContext(ctx, "tracking_poll: run failed", "error", err)
			}
		}
	}
}

func (w *TrackingPollWorker) RunOnce(ctx context.Context) error {
	if w.source == nil || w.sink == nil || w.registry == nil {
		return errors.New("tracking poll worker dependencies are required")
	}
	targets, err := w.source.ListTrackingPollTargets(ctx)
	if err != nil {
		return err
	}
	var runErr error
	for _, target := range targets {
		registration, ok := w.registry.Get(target.Provider)
		if !ok || registration.Tracking == nil {
			slog.WarnContext(ctx, "tracking_poll: target provider has no pull adapter", "provider", target.Provider, "awb_number", target.AWB)
			continue
		}
		if registration.Webhook != nil && !w.reconcileWebhooks {
			continue
		}
		response, trackErr := registration.Tracking.TrackOrder(ctx, target.AWB)
		if trackErr != nil {
			runErr = errors.Join(runErr, trackErr)
			continue
		}
		event, normalizeErr := provider.NormalizeTrackingResponse(target.Provider, response)
		if normalizeErr != nil {
			runErr = errors.Join(runErr, normalizeErr)
			continue
		}
		if publishErr := w.sink.PublishCarrierEvent(ctx, event); publishErr != nil {
			runErr = errors.Join(runErr, publishErr)
		}
	}
	return runErr
}

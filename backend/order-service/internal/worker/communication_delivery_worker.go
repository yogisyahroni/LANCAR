package worker

import (
	"context"
	"fmt"
	"log/slog"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"tembus/order-service/internal/domain"
	"tembus/order-service/internal/repository"
)

var providerStatusPattern = regexp.MustCompile(`(?i)(?:status|HTTP)[_ -]?(\d{3})`)

// CommunicationDeliveryWorker is the durable executor for canonical
// communication deliveries. In-app rows are considered delivered only after
// the inbox projection exists; external channels require a real provider.
type CommunicationDeliveryWorker struct {
	repo      *repository.CommunicationRepository
	provider  NotificationDeliveryProvider
	workerID  string
	interval  time.Duration
	batchSize int
}

func NewCommunicationDeliveryWorker(repo *repository.CommunicationRepository, provider NotificationDeliveryProvider, workerID string) *CommunicationDeliveryWorker {
	if strings.TrimSpace(workerID) == "" {
		workerID = fmt.Sprintf("order-service:communication-delivery:%s", uuid.NewString())
	}
	return &CommunicationDeliveryWorker{repo: repo, provider: provider, workerID: workerID, interval: 2 * time.Second, batchSize: 25}
}

func (w *CommunicationDeliveryWorker) Start(ctx context.Context) {
	if w.repo == nil {
		slog.Error("communication_delivery_worker_not_started", "reason", "repository_missing")
		return
	}
	slog.Info("communication_delivery_worker_started", "worker_id", w.workerID, "interval_ms", w.interval.Milliseconds(), "batch_size", w.batchSize)
	w.runOnce(ctx)
	ticker := time.NewTicker(w.interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			slog.Info("communication_delivery_worker_stopped", "worker_id", w.workerID)
			return
		case <-ticker.C:
			w.runOnce(ctx)
		}
	}
}

func (w *CommunicationDeliveryWorker) runOnce(ctx context.Context) {
	recoverCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	recovered, err := w.repo.RecoverStuckDeliveries(recoverCtx, 2*time.Minute, w.batchSize)
	cancel()
	if err != nil {
		slog.Error("communication_delivery_recovery_failed", "worker_id", w.workerID, "error", err)
	} else if recovered > 0 {
		slog.Warn("communication_delivery_recovered", "worker_id", w.workerID, "count", recovered)
	}

	claimCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	items, err := w.repo.ClaimQueuedDeliveries(claimCtx, w.workerID, w.batchSize)
	cancel()
	if err != nil {
		slog.Error("communication_delivery_claim_failed", "worker_id", w.workerID, "error", err)
		return
	}
	for _, item := range items {
		w.process(ctx, item)
	}
}

func (w *CommunicationDeliveryWorker) process(ctx context.Context, item domain.CommunicationDeliveryWork) {
	if item.Channel == domain.CommunicationInApp {
		if item.NotificationID == nil {
			w.fail(ctx, item, "notification_projection_missing", true)
			return
		}
		if err := w.repo.Receipt(ctx, item.ID, "delivered", "in_app", ""); err != nil {
			slog.Error("communication_delivery_receipt_failed", "delivery_id", item.ID, "channel", item.Channel, "error", err)
		}
		return
	}
	if item.NotificationID == nil {
		w.fail(ctx, item, "notification_projection_missing", true)
		return
	}
	if w.provider == nil {
		w.fail(ctx, item, "notification_delivery_provider_not_configured", false)
		return
	}
	providerCtx, cancel := context.WithTimeout(ctx, 20*time.Second)
	err := w.provider.Deliver(providerCtx, *item.NotificationID, communicationToNotificationChannel(item.Channel))
	cancel()
	if err == nil {
		if receiptErr := w.repo.Receipt(ctx, item.ID, "delivered", "provider", ""); receiptErr != nil {
			slog.Error("communication_delivery_receipt_failed", "delivery_id", item.ID, "channel", item.Channel, "error", receiptErr)
		}
		return
	}
	w.fail(ctx, item, err.Error(), isPermanentProviderError(err.Error()))
}

func (w *CommunicationDeliveryWorker) fail(ctx context.Context, item domain.CommunicationDeliveryWork, reason string, permanent bool) {
	if err := w.repo.RecordDeliveryFailure(ctx, item.ID, reason, permanent || item.Attempts >= 7); err != nil {
		slog.Error("communication_delivery_failure_record_failed", "delivery_id", item.ID, "error", err)
		return
	}
	slog.Warn("communication_delivery_failed", "delivery_id", item.ID, "event_id", item.EventID, "channel", item.Channel, "attempt", item.Attempts+1, "permanent", permanent || item.Attempts >= 7, "reason", reason)
}

func communicationToNotificationChannel(channel domain.CommunicationChannel) domain.NotificationChannel {
	return domain.NotificationChannel(channel)
}

func isPermanentProviderError(message string) bool {
	upper := strings.ToUpper(message)
	if strings.Contains(upper, "NOT_CONFIGURED") || strings.Contains(upper, "INVALID_TOKEN") || strings.Contains(upper, "UNREGISTERED") {
		return true
	}
	match := providerStatusPattern.FindStringSubmatch(message)
	if len(match) != 2 {
		return false
	}
	status, err := strconv.Atoi(match[1])
	if err != nil {
		return false
	}
	decision := domain.ClassifyDelivery(status, 0)
	return decision.DeadLetter
}

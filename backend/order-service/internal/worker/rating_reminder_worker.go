package worker

import (
	"context"
	"log"
	"time"

	"tembus/order-service/internal/domain"
)

type RatingReminderWorker struct {
	orderRepo             domain.OrderRepository
	notificationSvc       domain.NotificationService
	interval              time.Duration
	maxReminder           int
	reminderIntervalHours int
}

func NewRatingReminderWorker(orderRepo domain.OrderRepository, notifSvc domain.NotificationService, interval time.Duration, maxReminder int, reminderIntervalHours int) *RatingReminderWorker {
	return &RatingReminderWorker{
		orderRepo:             orderRepo,
		notificationSvc:       notifSvc,
		interval:              interval,
		maxReminder:           maxReminder,
		reminderIntervalHours: reminderIntervalHours,
	}
}

func (w *RatingReminderWorker) Start(ctx context.Context) {
	ticker := time.NewTicker(w.interval)
	defer ticker.Stop()

	log.Printf("[RatingReminderWorker] Started. Interval=%v, MaxReminders=%d", w.interval, w.maxReminder)

	for {
		select {
		case <-ctx.Done():
			log.Println("[RatingReminderWorker] Shutting down...")
			return
		case <-ticker.C:
			w.runCheck(ctx)
		}
	}
}

func (w *RatingReminderWorker) runCheck(ctx context.Context) {
	// 1. Fetch unrated delivered orders
	// Passing empty string for customerID fetches all unrated orders meeting criteria
	orders, err := w.orderRepo.GetDeliveredUnratedOrders(ctx, "", w.maxReminder, w.reminderIntervalHours)
	if err != nil {
		log.Printf("[RatingReminderWorker] Failed to fetch unrated orders: %v", err)
		return
	}

	if len(orders) == 0 {
		return
	}

	log.Printf("[RatingReminderWorker] Found %d orders needing rating reminders.", len(orders))

	for _, order := range orders {
		// 2. Send notification via Push channel
		req := domain.NotificationRequest{
			UserID:  order.CustomerID,
			Title:   "Bagaimana layanan kurir kami?",
			Message: "Paket Anda telah sampai! Yuk, berikan penilaian untuk kurir yang bertugas.",
			Channel: domain.ChannelPush,
			Data: map[string]string{
				"type":     "rating_reminder",
				"order_id": order.ID,
			},
		}

		if err := w.notificationSvc.Send(ctx, req); err != nil {
			log.Printf("[RatingReminderWorker] Failed to send notification for order %s: %v", order.ID, err)
			continue // Skip increment if notification fails to send
		}

		// 3. Increment reminder count
		if err := w.orderRepo.IncrementRatingReminderCount(ctx, order.ID); err != nil {
			log.Printf("[RatingReminderWorker] Failed to increment reminder count for order %s: %v", order.ID, err)
		} else {
			log.Printf("[RatingReminderWorker] Sent rating reminder for order %s to customer %s", order.ID, order.CustomerID)
		}
	}
}

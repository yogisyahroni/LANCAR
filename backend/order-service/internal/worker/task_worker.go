package worker

import (
	"context"
	"fmt"
	"log"
	"os"

	"github.com/google/uuid"

	"time"

	"lancar/order-service/internal/domain"
	"lancar/order-service/internal/domain/queue"
	"lancar/order-service/internal/service"
)

type TaskWorker struct {
	queue            queue.Queue
	orderRepo        domain.OrderRepository
	notificationSvc  domain.NotificationService
	notifRepo        domain.NotificationRepository
	deliveryProvider NotificationDeliveryProvider
	insuranceSvc     domain.InsuranceService
	relayScoreSvc    domain.RelayScoreService
	analyticsSvc     service.AnalyticsService
}

type NotificationDeliveryProvider interface {
	Deliver(ctx context.Context, notificationID uuid.UUID, channel domain.NotificationChannel) error
}

func NewTaskWorker(q queue.Queue, or domain.OrderRepository, ns domain.NotificationService, nr domain.NotificationRepository, is domain.InsuranceService, rs domain.RelayScoreService, as service.AnalyticsService) *TaskWorker {
	return &TaskWorker{
		queue:           q,
		orderRepo:       or,
		notificationSvc: ns,
		notifRepo:       nr,
		insuranceSvc:    is,
		relayScoreSvc:   rs,
		analyticsSvc:    as,
	}
}

func (w *TaskWorker) SetNotificationDeliveryProvider(provider NotificationDeliveryProvider) {
	w.deliveryProvider = provider
}

func (w *TaskWorker) Start(ctx context.Context) error {
	if w.queue == nil {
		return fmt.Errorf("task queue is nil")
	}

	log.Println("Background task worker started")

	// Start daily schedulers
	go w.runDailySchedulers(ctx)
	// Start hourly schedulers
	go w.runHourlySchedulers(ctx)

	return w.queue.Consume(ctx, w.handleTask)
}

func (w *TaskWorker) runDailySchedulers(ctx context.Context) {
	ticker := time.NewTicker(24 * time.Hour)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			log.Println("[TaskWorker] Running daily scheduled jobs...")

			// 1. Process Insurance Reminders
			if w.insuranceSvc != nil {
				if err := w.insuranceSvc.ProcessInsuranceReminders(ctx); err != nil {
					log.Printf("[TaskWorker] Error processing insurance reminders: %v", err)
				}
			}

			if w.relayScoreSvc != nil {
				log.Println("[TaskWorker] Daily relay score job is awaiting courier batch repository wiring")
			}

			// 3. Monthly Financial Report (runs on 1st of every month)
			now := time.Now()
			if now.Day() == 1 {
				log.Println("[TaskWorker] It's the 1st of the month! Generating monthly financial report...")
				if w.analyticsSvc != nil {
					// Yesterday was the last day of the previous month
					lastMonth := now.AddDate(0, -1, 0)
					start := time.Date(lastMonth.Year(), lastMonth.Month(), 1, 0, 0, 0, 0, time.UTC)
					end := start.AddDate(0, 1, 0).Add(-time.Nanosecond)

					csvData, err := w.analyticsSvc.GenerateCSVReport(ctx, start, end, "", "revenue")
					if err != nil {
						log.Printf("[TaskWorker] Error generating monthly report: %v", err)
					} else {
						financeEmail := os.Getenv("FINANCE_REPORT_EMAIL")
						if financeEmail == "" {
							log.Println("[TaskWorker] FINANCE_REPORT_EMAIL is not configured; monthly report email skipped")
							continue
						}

						err = w.notificationSvc.Send(ctx, domain.NotificationRequest{
							Title: fmt.Sprintf("Monthly Financial Report - %s %d", lastMonth.Month().String(), lastMonth.Year()),
							Message: fmt.Sprintf("Please find the attached financial report for %s %d. Total records: %d",
								lastMonth.Month().String(), lastMonth.Year(), len(csvData)),
							Channel: domain.ChannelEmail,
							Data: map[string]string{
								"recipient":       financeEmail,
								"attachment_type": "csv",
								// In a real implementation, we would attach the actual CSV data
							},
						})
						if err != nil {
							log.Printf("[TaskWorker] Error sending monthly report email: %v", err)
						} else {
							log.Printf("[TaskWorker] Monthly report email sent to %s", financeEmail)
						}
					}
				}
			}
		}
	}
}

func (w *TaskWorker) runHourlySchedulers(ctx context.Context) {
	ticker := time.NewTicker(1 * time.Hour)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			log.Println("[TaskWorker] Running hourly scheduled jobs...")

			// 1. Refresh Materialized Views
			if w.analyticsSvc != nil {
				if err := w.analyticsSvc.RefreshData(ctx); err != nil {
					log.Printf("[TaskWorker] Error refreshing materialized views: %v", err)
				} else {
					log.Println("[TaskWorker] Materialized views refreshed successfully")
				}
			}
		}
	}
}

func (w *TaskWorker) handleTask(task queue.Task) error {
	log.Printf("[TaskWorker] Processing task: %s", task.Type)

	var err error
	switch task.Type {
	case "order.created":
		err = w.handleOrderCreated(task)
	case "order.status_updated":
		err = w.handleOrderStatusUpdated(task)
	case "order.cancelled":
		err = w.handleOrderCancelled(task)
	case "send_notification":
		err = w.handleSendNotification(task)
	default:
		log.Printf("[TaskWorker] Unknown task type: %s", task.Type)
		return nil
	}

	if err != nil {
		log.Printf("[TaskWorker] Error processing %s: %v", task.Type, err)
		return err // Returning error triggers retry in RabbitMQ
	}

	return nil
}

func (w *TaskWorker) handleOrderCreated(task queue.Task) error {
	orderID, _ := task.Payload["order_id"].(string)
	userID, _ := task.Payload["user_id"].(string)

	log.Printf("[TaskWorker] Order Created: %v for User: %v", orderID, userID)

	// Send notification
	return w.notificationSvc.Send(context.Background(), domain.NotificationRequest{
		UserID:  userID,
		Title:   "Order Created",
		Message: fmt.Sprintf("Your order %s has been created and is awaiting payment.", orderID),
		Channel: domain.ChannelPush,
	})
}

func (w *TaskWorker) handleOrderStatusUpdated(task queue.Task) error {
	orderID, _ := task.Payload["order_id"].(string)
	userID, _ := task.Payload["user_id"].(string)
	status, _ := task.Payload["status"].(string)

	log.Printf("[TaskWorker] Status Updated: %v to %s", orderID, status)

	return w.notificationSvc.Send(context.Background(), domain.NotificationRequest{
		UserID:  userID,
		Title:   "Order Update",
		Message: fmt.Sprintf("Your order %s status changed to %s", orderID, status),
		Channel: domain.ChannelPush,
	})
}

func (w *TaskWorker) handleOrderCancelled(task queue.Task) error {
	orderID, _ := task.Payload["order_id"].(string)
	userID, _ := task.Payload["user_id"].(string)

	log.Printf("[TaskWorker] Order Cancelled: %v", orderID)

	return w.notificationSvc.Send(context.Background(), domain.NotificationRequest{
		UserID:  userID,
		Title:   "Order Cancelled",
		Message: fmt.Sprintf("Your order %s has been cancelled.", orderID),
		Channel: domain.ChannelPush,
	})
}

func (w *TaskWorker) handleSendNotification(task queue.Task) error {
	notifIDStr, _ := task.Payload["notification_id"].(string)
	channel, _ := task.Payload["channel"].(string)

	log.Printf("[TaskWorker] Sending notification %s via %s", notifIDStr, channel)

	notifID, err := uuid.Parse(notifIDStr)
	if err != nil {
		return fmt.Errorf("invalid notification id: %w", err)
	}

	if w.deliveryProvider == nil {
		errMsg := "notification_delivery_provider_not_configured"
		if w.notifRepo != nil {
			if err := w.notifRepo.UpdatePushStatus(context.Background(), notifID, "failed", &errMsg); err != nil {
				log.Printf("[TaskWorker] Failed to update push status for %s: %v", notifID, err)
				return err
			}
		}
		log.Printf("[TaskWorker] Notification %s via %s marked failed: %s", notifID, channel, errMsg)
		return nil
	}

	if err := w.deliveryProvider.Deliver(context.Background(), notifID, domain.NotificationChannel(channel)); err != nil {
		errMsg := err.Error()
		if w.notifRepo != nil {
			if updateErr := w.notifRepo.UpdatePushStatus(context.Background(), notifID, "failed", &errMsg); updateErr != nil {
				log.Printf("[TaskWorker] Failed to update push status for %s: %v", notifID, updateErr)
				return updateErr
			}
		}
		return err
	}

	// Update the push status in the repository
	if w.notifRepo != nil {
		if err := w.notifRepo.UpdatePushStatus(context.Background(), notifID, "sent", nil); err != nil {
			log.Printf("[TaskWorker] Failed to update push status for %s: %v", notifID, err)
			return err
		}
	}

	return nil
}

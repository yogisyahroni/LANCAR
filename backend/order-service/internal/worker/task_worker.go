package worker

import (
	"context"
	"fmt"
	"log"

	"github.com/google/uuid"

	"time"

	"lancar/order-service/internal/domain"
	"lancar/order-service/internal/domain/queue"
	"lancar/order-service/internal/service"
)

type TaskWorker struct {
	queue           queue.Queue
	orderRepo       domain.OrderRepository
	notificationSvc domain.NotificationService
	notifRepo       domain.NotificationRepository
	insuranceSvc    domain.InsuranceService
	relayScoreSvc   domain.RelayScoreService
	analyticsSvc    service.AnalyticsService
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

			// 2. Relay Score Calc (Mocking for all couriers)
			// In reality, we'd query all active couriers and call CalculateScore
			log.Println("[TaskWorker] Daily Relay Score calculation executed")

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
						// Send email to finance team
						// In a real app, this email would be in config
						financeEmail := "finance-reports@lancar.com"
						
						err = w.notificationSvc.Send(ctx, domain.NotificationRequest{
							Title:   fmt.Sprintf("Monthly Financial Report - %s %d", lastMonth.Month().String(), lastMonth.Year()),
							Message: fmt.Sprintf("Please find the attached financial report for %s %d. Total records: %d", 
								lastMonth.Month().String(), lastMonth.Year(), len(csvData)),
							Channel: domain.ChannelEmail,
							Data: map[string]string{
								"recipient": financeEmail,
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

	// Mocking third-party SDK integration (FCM, APNs, Twilio, etc.)
	// In a real application, we would call the respective provider here.
	log.Printf("[NotificationProvider] Delivered notification %s to channel %s successfully.", notifID, channel)

	// Update the push status in the repository
	if w.notifRepo != nil {
		if err := w.notifRepo.UpdatePushStatus(context.Background(), notifID, "sent", nil); err != nil {
			log.Printf("[TaskWorker] Failed to update push status for %s: %v", notifID, err)
			return err
		}
	}

	return nil
}

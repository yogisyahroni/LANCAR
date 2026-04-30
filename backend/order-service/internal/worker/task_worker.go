package worker

import (
	"context"
	"fmt"
	"log"

	"github.com/google/uuid"

	"lancar/order-service/internal/domain"
	"lancar/order-service/internal/domain/queue"
)

type TaskWorker struct {
	queue           queue.Queue
	orderRepo       domain.OrderRepository
	notificationSvc domain.NotificationService
	notifRepo       domain.NotificationRepository
}

func NewTaskWorker(q queue.Queue, or domain.OrderRepository, ns domain.NotificationService, nr domain.NotificationRepository) *TaskWorker {
	return &TaskWorker{
		queue:           q,
		orderRepo:       or,
		notificationSvc: ns,
		notifRepo:       nr,
	}
}

func (w *TaskWorker) Start(ctx context.Context) error {
	if w.queue == nil {
		return fmt.Errorf("task queue is nil")
	}

	log.Println("Background task worker started")

	return w.queue.Consume(ctx, w.handleTask)
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

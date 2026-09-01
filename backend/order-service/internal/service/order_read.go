package service

import (
	"context"
	"errors"
	"fmt"
	"log"
	"strings"
	"tembus/order-service/internal/domain"
	"tembus/order-service/internal/domain/queue"
	"tembus/order-service/pkg/utils"
	"time"

	"github.com/google/uuid"
)

// Auto-generated split of orderServiceImpl methods (god-file refactor).
func (s *orderServiceImpl) GetOrder(ctx context.Context, orderID string) (*domain.Order, error) {
	order, err := s.orderRepo.GetByID(ctx, orderID)
	if err != nil {
		return nil, err
	}
	if order == nil {
		return nil, errors.New("order not found")
	}

	// Fetch Courier Info if order is assigned
	if order.CourierID != nil && *order.CourierID != "" {
		courierInfo, err := s.orderRepo.GetCourierInfo(ctx, *order.CourierID)
		if err == nil && courierInfo != nil {
			order.Courier = courierInfo
		}
	}

	// Generate QR Code URL for the detail view
	qrURL, _ := utils.GenerateQRCodeDataURI(order.HandoverToken, 256)
	order.QRCodeURL = qrURL

	// Fetch Service Reports for Tambal Ban or Towing
	if s.reportSvc != nil {
		serviceCode := strings.ToLower(order.ServiceSubType)
		if serviceCode == "" {
			serviceCode = order.ServiceCode
		}
		switch {
		case strings.HasPrefix(serviceCode, "tambal_ban"):
			report, err := s.reportSvc.GetTambalBanReport(ctx, orderID)
			if err == nil && report != nil {
				order.TambalBanReport = report
			}
		case strings.HasPrefix(serviceCode, "towing"):
			report, err := s.reportSvc.GetTowingReport(ctx, orderID)
			if err == nil && report != nil {
				order.TowingReport = report
			}
		}
	}
	order.ApplyCanonicalOrderContract()

	return order, nil
}

func (s *orderServiceImpl) ListOrders(ctx context.Context, userID string, filter map[string]interface{}) ([]*domain.Order, error) {
	orders, err := s.orderRepo.ListByUserID(ctx, userID, filter)
	if err != nil {
		return nil, err
	}
	for _, order := range orders {
		order.ApplyCanonicalOrderContract()
	}
	return orders, nil
}

func (s *orderServiceImpl) GetCourierIDByUserID(ctx context.Context, userID string) (string, error) {
	return s.orderRepo.GetCourierIDByUserID(ctx, userID)
}

func (s *orderServiceImpl) UpdateStatus(ctx context.Context, orderID string, status domain.OrderStatus) error {
	// FB-081: tangkap status lama SEBELUM update — dipakai sbg original_status
	// refund. Tanpa ini, order sudah berstatus cancelled saat refund dihitung
	// → food cancel lewat jalur ini dihitung 0% (salah untuk pending_merchant dll).
	var prevStatus domain.OrderStatus
	prevOrder, errPrev := s.orderRepo.GetByID(ctx, orderID)
	if errPrev == nil && prevOrder != nil {
		prevStatus = prevOrder.Status
	}

	// AUDIT-FIX m5: guard transisi terakhir (defense in depth) —
	// 1) idempotent: target == status sekarang → no-op, JANGAN trigger
	//    refund/event dua kali (order sudah cancelled, dana sudah kembali).
	// 2) status final (delivered/cancelled) TIDAK boleh berubah lagi —
	//    membunuh resurrection via endpoint generic (order delivered →
	//    di-cancel → refund order selesai; order cancelled → di-delivered).
	if prevOrder != nil {
		if prevOrder.Status == status {
			return nil
		}
		if (prevOrder.Status == domain.StatusDelivered || prevOrder.Status == domain.StatusCancelled) &&
			status != prevOrder.Status {
			return fmt.Errorf("order %s sudah berstatus final (%s), tidak bisa diubah ke %s",
				orderID, prevOrder.Status, status)
		}
	}

	err := s.orderRepo.UpdateStatus(ctx, orderID, status)
	if err != nil {
		return err
	}

	// FB-121: order selesai → leg aktif ikut final. Kalau tidak, leg status
	// (`accepted`) tidak pernah settle → gate active_jobs dispatch menghitung
	// courier masih punya pekerjaan → courier tak dapat offer baru.
	if status == domain.StatusDelivered || status == domain.StatusCancelled {
		_ = s.orderRepo.UpdateLegsStatus(ctx, orderID, status)
	}

	// Fetch order to get UserID for the event
	order, err := s.orderRepo.GetByID(ctx, orderID)
	if err == nil {
		event := domain.OrderEvent{
			OrderID:   order.ID,
			UserID:    order.CustomerID,
			Status:    status,
			Message:   fmt.Sprintf("Order status updated to %s", status),
			CreatedAt: time.Now(),
		}
		_ = s.eventRepo.SaveEvent(ctx, event)
		_ = s.eventBus.Publish(ctx, "order.updates", event)

		// Push to task queue for persistent background processing (notifications)
		if s.taskQueue != nil {
			_ = s.taskQueue.Push(ctx, queue.Task{
				Type: "order.status_updated",
				Payload: map[string]interface{}{
					"order_id": order.ID,
					"user_id":  order.CustomerID,
					"status":   string(status),
				},
			})
		}

		if status == domain.StatusCancelled && s.refundSvc != nil {
			if oid, errParse := uuid.Parse(orderID); errParse == nil {
				log.Printf("[OrderService] Order %s cancelled, triggering automatic refund...", orderID)
				_, errRefund := s.refundSvc.CalculateAndTriggerRefund(ctx, oid, "Order cancelled", domain.RefundOptions{OriginalStatus: prevStatus})
				if errRefund != nil {
					log.Printf("[OrderService] Failed to trigger refund for order %s: %v", orderID, errRefund)
				}
			}
		}

		// FB-083: order batal → tip yang sudah dibayar dikembalikan ke customer
		// (fire-and-forget: error hanya di-log, tidak menggagalkan cancel flow).
		if status == domain.StatusCancelled && s.tipSvc != nil {
			if oid, errParse := uuid.Parse(orderID); errParse == nil {
				if errTip := s.tipSvc.RefundTipByOrder(ctx, oid); errTip != nil {
					log.Printf("[OrderService] Failed to refund tip for cancelled order %s: %v", orderID, errTip)
				} else {
					log.Printf("[OrderService] Tip refunded for cancelled order %s", orderID)
				}
			}
		}
	}

	return nil
}

func (s *orderServiceImpl) UpdateDimensions(ctx context.Context, id string, length, width, height, weight *float64) error {
	order, err := s.orderRepo.GetByID(ctx, id)
	if err != nil {
		return err
	}
	if order == nil {
		return fmt.Errorf("order %s not found", id)
	}

	l := order.Length
	if length != nil {
		l = *length
	}
	w := order.Width
	if width != nil {
		w = *width
	}
	h := order.Height
	if height != nil {
		h = *height
	}
	wt := order.Weight
	if weight != nil {
		wt = *weight
	}

	return s.orderRepo.UpdateDimensions(ctx, id, l, w, h, wt)
}

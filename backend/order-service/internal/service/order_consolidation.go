package service

import (
	"context"
	"errors"
	"fmt"
	"log"
	"tembus/order-service/internal/domain"
	"time"

	"github.com/google/uuid"
)

// Auto-generated split of orderServiceImpl methods (god-file refactor).
func (s *orderServiceImpl) ListEvents(ctx context.Context, userID string, since time.Time) ([]domain.OrderEvent, error) {
	return s.eventRepo.ListEventsByUserID(ctx, userID, since)
}

func (s *orderServiceImpl) ScanPackage(ctx context.Context, scannedBy string, scan *domain.PackageScan) error {
	order, err := s.orderRepo.GetByID(ctx, scan.OrderID)
	if err != nil {
		return err
	}
	if order == nil {
		return errors.New("order not found")
	}

	var targetStatus domain.OrderStatus
	switch scan.ScanType {
	case "pickup":
		if order.Status != domain.StatusAccepted && order.Status != domain.StatusPickingUp {
			return fmt.Errorf("invalid state transition: cannot perform pickup on order in status %s", order.Status)
		}
		targetStatus = domain.StatusPickedUp
	case "inbound_origin":
		if order.Status != domain.StatusPickedUp {
			return fmt.Errorf("invalid state transition: cannot inbound to origin hub on order in status %s", order.Status)
		}
		targetStatus = domain.StatusInboundOrigin
	case "outbound_origin":
		if order.Status != domain.StatusInboundOrigin {
			return fmt.Errorf("invalid state transition: cannot outbound from origin hub on order in status %s", order.Status)
		}
		if scan.BagNumber != nil && *scan.BagNumber != "" {
			bag, err := s.orderRepo.GetConsolidationBag(ctx, *scan.BagNumber)
			if err != nil {
				return fmt.Errorf("failed to check consolidation bag: %w", err)
			}
			if bag == nil {
				return fmt.Errorf("consolidation bag %s not found. Please create and seal it first before bagging packages.", *scan.BagNumber)
			}
			if bag.Status != "sealed" {
				return fmt.Errorf("consolidation bag %s is not sealed (current status: %s). Only sealed bags can accept outbound package consolidation.", *scan.BagNumber, bag.Status)
			}
		}
		targetStatus = domain.StatusOutboundOrigin
	case "inbound_destination":
		if order.Status != domain.StatusOutboundOrigin {
			return fmt.Errorf("invalid state transition: cannot inbound to destination hub on order in status %s", order.Status)
		}
		// Retrieve package scans to find if this order was consolidated in a bag during outbound_origin
		scans, err := s.orderRepo.GetScansForOrder(ctx, order.ID)
		if err != nil {
			return fmt.Errorf("failed to retrieve package scans: %w", err)
		}
		var assocBagNumber *string
		for i := len(scans) - 1; i >= 0; i-- {
			if scans[i].ScanType == "outbound_origin" && scans[i].BagNumber != nil && *scans[i].BagNumber != "" {
				assocBagNumber = scans[i].BagNumber
				break
			}
		}
		if assocBagNumber != nil {
			bag, err := s.orderRepo.GetConsolidationBag(ctx, *assocBagNumber)
			if err != nil {
				return fmt.Errorf("failed to verify consolidation bag: %w", err)
			}
			if bag != nil && bag.Status == "sealed" {
				return fmt.Errorf("cannot inbound package. Consolidation bag %s must be unbagged (Bag Out) at destination first.", *assocBagNumber)
			}
		}
		targetStatus = domain.StatusInboundDestination
	case "outbound_destination":
		if order.Status != domain.StatusInboundDestination {
			return fmt.Errorf("invalid state transition: cannot outbound from destination hub on order in status %s", order.Status)
		}
		targetStatus = domain.StatusOutboundDestination
	case "out_for_delivery":
		if order.Status != domain.StatusOutboundDestination {
			return fmt.Errorf("invalid state transition: cannot dispatch for delivery on order in status %s", order.Status)
		}
		targetStatus = domain.StatusDelivering
	case "delivered":
		if order.Status != domain.StatusDelivering && order.Status != domain.StatusFailedDelivery {
			return fmt.Errorf("invalid state transition: cannot deliver order in status %s", order.Status)
		}
		targetStatus = domain.StatusDelivered
	// S2-OS-03: Failed delivery flow — courier reports "penerima tidak ada"
	// atau tolak terima. Transisi dari delivering (on-demand) atau
	// outbound_destination (regular). Admin/resolver kemudian bisa
	// trigger return_to_sender atau reschedule.
	case "failed_delivery":
		if order.Status != domain.StatusDelivering && order.Status != domain.StatusOutboundDestination {
			return fmt.Errorf("invalid state transition: cannot fail delivery on order in status %s", order.Status)
		}
		targetStatus = domain.StatusFailedDelivery
	case "return_to_sender":
		if order.Status != domain.StatusFailedDelivery {
			return fmt.Errorf("invalid state transition: can only return to sender from failed_delivery status, current: %s", order.Status)
		}
		targetStatus = domain.StatusReturnToSender
	default:
		return fmt.Errorf("unknown scan type: %s", scan.ScanType)
	}

	// 1. Update order status in DB
	err = s.orderRepo.UpdateStatus(ctx, order.ID, targetStatus)
	if err != nil {
		return fmt.Errorf("failed to update order status: %w", err)
	}

	// 2. Save scan log
	scan.ScannedBy = scannedBy
	err = s.orderRepo.SaveScan(ctx, scan)
	if err != nil {
		return fmt.Errorf("failed to save scan record: %w", err)
	}

	// 3. FIN-003 & FIN-005: Create Ledger Journal if Delivered (Revenue Recognition)
	if targetStatus == domain.StatusDelivered {
		// Calculate courier earnings based on order BasePrice + Volumetric + Dynamic
		grossTariff := order.BasePriceIDR + order.VolumetricSurchargeIDR + order.DynamicPriceIDR

		// 80% to courier (example, should be from config but we'll use standard model)
		// For simplicity we just use 80% of grossTariff for courier payable
		courierPayable := int64(float64(grossTariff) * 0.8)

		journal := &domain.LedgerJournal{
			JournalType:    "order_delivered",
			ReferenceType:  "order",
			ReferenceID:    order.ID,
			IdempotencyKey: fmt.Sprintf("LEDGER-DELIVERED-%s", order.ID),
			Reason:         "Revenue recognition and courier payout accrual on delivery",
			Metadata:       map[string]any{"courier_id": order.CourierID},
			CreatedBy:      scannedBy,
			ActorRole:      "courier",
		}
		// FB-088: catat batch_id di metadata untuk rekonsiliasi earnings
		// (order batch food: payout tetap per-order saat tiap delivery —
		// pickup di-share 1 trip, tanpa double-count).
		if order.BatchID != nil {
			journal.Metadata["batch_id"] = *order.BatchID
		}

		entries := []domain.LedgerEntry{
			// Revenue Recognition (Realized)
			{AccountName: "unearned_revenue", DebitIDR: grossTariff, CreditIDR: 0},
			{AccountName: "delivery_revenue", DebitIDR: 0, CreditIDR: grossTariff},

			// Courier Payable Accrual
			{AccountName: "courier_payout_expense", DebitIDR: courierPayable, CreditIDR: 0},
			{AccountName: "courier_payable", DebitIDR: 0, CreditIDR: courierPayable},
		}

		// If promo applied (we assume TotalPriceIDR < grossTariff indicates promo)
		promoDiscount := grossTariff - order.TotalPriceIDR
		if promoDiscount > 0 {
			entries = append(entries, domain.LedgerEntry{AccountName: "promo_subsidy_expense", DebitIDR: promoDiscount, CreditIDR: 0})
			entries = append(entries, domain.LedgerEntry{AccountName: "unearned_revenue", DebitIDR: 0, CreditIDR: promoDiscount})
		}

		if err = s.ledgerRepo.CreateJournalWithEntries(ctx, journal, entries); err != nil {
			return fmt.Errorf("failed to write ledger for delivery: %w", err)
		}
	}

	// FOOD-BIKE-067: Merchant settlement escrow untuk order food on-demand
	// (merchant_id terisi, tanpa payment link). Non-fatal: jika settlement
	// gagal dibuat, scan delivered tetap sukses — settlement bisa diproses
	// manual/reconcile. Idempotent via "settle-order-<orderID>".
	if targetStatus == domain.StatusDelivered && order.MerchantID != nil && s.settlementSvc != nil {
		if err := s.settlementSvc.HandleFoodOrderDelivered(ctx, order.ID); err != nil {
			log.Printf("[settlement] FOOD-BIKE-067 failed untuk order %s: %v", order.ID, err)
		}
	}

	// FOOD-BIKE-068: Tambah poin "tutup poin" saat order delivered dengan
	// courier terassign. Non-fatal — kegagalan hanya dilog.
	if targetStatus == domain.StatusDelivered && order.CourierID != nil && s.pointsSvc != nil {
		courierUserID, errUser := uuid.Parse(*order.CourierID)
		orderUUID, errOrder := uuid.Parse(order.ID)
		if errUser == nil && errOrder == nil {
			if err := s.pointsSvc.AddPoints(ctx, courierUserID, orderUUID); err != nil {
				log.Printf("[points] FOOD-BIKE-068 failed untuk order %s: %v", order.ID, err)
			}
		}
	}

	// FB-124: Push progress ke customer + merchant pada transisi food.
	// pickup (accepted → picked_up): customer tahu pesanan diambil driver,
	// merchant dapat konfirmasi serah terima. delivered: keduanya di-notif.
	// Fire-and-forget — gagal kirim hanya di-log, tidak menggagalkan scan.
	if order.MerchantID != nil && s.pushSvc != nil {
		if targetStatus == domain.StatusPickedUp {
			if errPush := s.pushSvc.NotifyCustomerPickedUp(ctx, order.ID, "Pesananmu sudah diambil driver dan sedang dalam perjalanan"); errPush != nil {
				log.Printf("[OrderService] FB-124 push picked_up customer gagal order %s: %v", order.ID, errPush)
			}
			if errPush := s.pushSvc.NotifyMerchantPickedUp(ctx, order.ID, "Pesanan sudah diambil driver — terima kasih!"); errPush != nil {
				log.Printf("[OrderService] FB-124 push picked_up merchant gagal order %s: %v", order.ID, errPush)
			}
		}
		if targetStatus == domain.StatusDelivered {
			if errPush := s.pushSvc.NotifyCustomerDelivered(ctx, order.ID, "Pesananmu sudah diantar — selamat menikmati!"); errPush != nil {
				log.Printf("[OrderService] FB-124 push delivered customer gagal order %s: %v", order.ID, errPush)
			}
			if errPush := s.pushSvc.NotifyMerchantDelivered(ctx, order.ID, "Pesanan sudah diantar ke customer"); errPush != nil {
				log.Printf("[OrderService] FB-124 push delivered merchant gagal order %s: %v", order.ID, errPush)
			}
		}
	}

	// 4. Save order event
	eventMsg := fmt.Sprintf("Package scan recorded: %s", scan.ScanType)
	if scan.ScanType == "delivered" {
		eventMsg = "Package delivered successfully. ePOD recorded."
	}
	if scan.ScanType == "failed_delivery" {
		eventMsg = "Delivery attempt failed. Recipient unavailable or refused package."
	}
	if scan.ScanType == "return_to_sender" {
		eventMsg = "Package is being returned to sender."
	}
	event := domain.OrderEvent{
		OrderID:   order.ID,
		UserID:    order.CustomerID,
		Status:    targetStatus,
		Message:   eventMsg,
		CreatedAt: time.Now(),
	}
	_ = s.eventRepo.SaveEvent(ctx, event)
	_ = s.eventBus.Publish(ctx, "order.updates", event)

	// 4. Notify customer
	title := "Package Scan Event"
	msg := fmt.Sprintf("Your package is currently in state: %s", scan.ScanType)
	switch scan.ScanType {
	case "pickup":
		title = "Package Picked Up!"
		msg = "Your courier has picked up the package."
	case "inbound_origin":
		title = "Arrived at Origin Hub"
		msg = "Your package has arrived at the origin sorting center."
	case "outbound_origin":
		title = "Departed Origin Hub"
		msg = "Your package is on its way to the destination city."
	case "inbound_destination":
		title = "Arrived at Destination Hub"
		msg = "Your package has arrived at the destination city sorting center."
	case "outbound_destination":
		title = "Sorting Complete"
		msg = "Your package is ready to be dispatched for local delivery."
	case "out_for_delivery":
		title = "Out for Delivery!"
		msg = "The courier is on their way to deliver your package today."
	case "delivered":
		title = "Delivered Successfully!"
		msg = "Your package has been delivered. Thank you for using TEMBUS!"
	case "failed_delivery":
		title = "Delivery Attempt Failed"
		msg = "Courier was unable to complete delivery. Our team will contact you for next steps."
	case "return_to_sender":
		title = "Package Returning to Sender"
		msg = "Your package is being returned to the pickup location. Contact support if you need assistance."
	}

	_ = s.notificationSvc.Send(ctx, domain.NotificationRequest{
		UserID:  order.CustomerID,
		Title:   title,
		Message: msg,
		Channel: domain.ChannelPush,
		Data: map[string]string{
			"order_id":  order.ID,
			"scan_type": scan.ScanType,
			"type":      "package_scan",
		},
	})

	return nil
}

func (s *orderServiceImpl) GetPackageScans(ctx context.Context, orderID string) ([]*domain.PackageScan, error) {
	return s.orderRepo.GetScansForOrder(ctx, orderID)
}

func (s *orderServiceImpl) CreateConsolidationBag(ctx context.Context, createdBy string, bag *domain.ConsolidationBag) error {
	if bag.BagNumber == "" {
		return errors.New("bag number is required")
	}
	bag.Status = "sealed"
	bag.CreatedBy = createdBy
	return s.orderRepo.CreateConsolidationBag(ctx, bag)
}

func (s *orderServiceImpl) OpenConsolidationBag(ctx context.Context, unbaggedBy string, bagNumber string) error {
	bag, err := s.orderRepo.GetConsolidationBag(ctx, bagNumber)
	if err != nil {
		return err
	}
	if bag == nil {
		return fmt.Errorf("consolidation bag %s not found", bagNumber)
	}
	if bag.Status == "opened" {
		return nil // Already unbagged
	}
	return s.orderRepo.UpdateConsolidationBagStatus(ctx, bagNumber, "opened")
}

func (s *orderServiceImpl) GetConsolidationBag(ctx context.Context, bagNumber string) (*domain.ConsolidationBag, []*domain.PackageScan, error) {
	bag, err := s.orderRepo.GetConsolidationBag(ctx, bagNumber)
	if err != nil {
		return nil, nil, err
	}
	if bag == nil {
		return nil, nil, fmt.Errorf("consolidation bag %s not found", bagNumber)
	}
	scans, err := s.orderRepo.GetScansByBagNumber(ctx, bagNumber)
	if err != nil {
		return nil, nil, err
	}
	return bag, scans, nil
}

func (s *orderServiceImpl) AutoDetectScanType(ctx context.Context, orderID string, warehouseID string) (string, error) {
	order, err := s.orderRepo.GetByID(ctx, orderID)
	if err != nil {
		return "", err
	}
	if order == nil {
		return "", fmt.Errorf("order %s not found", orderID)
	}

	switch order.Status {
	case domain.StatusPickedUp:
		return "inbound_origin", nil
	case domain.StatusInboundOrigin:
		return "outbound_origin", nil
	case domain.StatusOutboundOrigin:
		return "inbound_destination", nil
	case domain.StatusInboundDestination:
		return "outbound_destination", nil
	case domain.StatusOutboundDestination:
		return "out_for_delivery", nil
	case domain.StatusDelivering:
		return "delivered", nil
	default:
		return string(order.Status), nil
	}
}

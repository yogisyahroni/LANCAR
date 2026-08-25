package service

import (
	"context"
	"fmt"
	"log"
	"math"
	"strings"
	"tembus/order-service/internal/domain"
	"tembus/order-service/pkg/utils"
	"time"

	"github.com/google/uuid"
)

// Auto-generated split of orderServiceImpl methods (god-file refactor).
func (s *orderServiceImpl) CreateFoodOrder(ctx context.Context, userID string, req domain.CreateFoodOrderRequest) (*domain.Order, error) {
	if s.foodRepo == nil {
		return nil, fmt.Errorf("food repository not wired")
	}

	// 1. Validasi merchant: ada, approved, buka
	merchant, err := s.foodRepo.GetFoodMerchant(ctx, req.MerchantID)
	if err != nil {
		return nil, err
	}
	if merchant.VerificationStatus != "approved" {
		return nil, domain.NewUserFacingError("merchant belum terverifikasi")
	}
	if !merchant.IsOpen {
		return nil, domain.NewUserFacingError("merchant tutup")
	}
	// FB-107: merchant sedang pause sementara — tolak order baru sampai
	// paused_until lewat (auto un-pause, tidak butuh aksi merchant).
	if merchant.PausedUntil != nil && merchant.PausedUntil.After(time.Now()) {
		return nil, domain.NewUserFacingError(fmt.Sprintf("merchant sedang pause — coba lagi setelah %s",
			merchant.PausedUntil.Format("15:04")))
	}
	// FB-094: merchant wajib punya lokasi (pin di peta saat daftar).
	// Tanpa lokasi, ongkir & "resto terdekat" tidak bisa dihitung dengan benar.
	if merchant.Lat == 0 && merchant.Lng == 0 {
		return nil, fmt.Errorf("merchant belum melengkapi lokasi toko — lengkapi pin lokasi di profil merchant dulu")
	}

	// 1b. FB-123: validasi pesanan terjadwal (kalau IsScheduled).
	// Aturan: wajib isi waktu, min lead 30 menit, same-day only, dalam jam
	// operasional merchant. Status tetap pending_payment — transisi ke
	// 'scheduled' terjadi di payment callback (payment_service.go).
	var scheduledAt *time.Time
	if req.IsScheduled {
		if errV := validateScheduledAt(req.ScheduledAt, merchant.JamBuka, merchant.JamTutup, time.Now()); errV != nil {
			// UAT-C-033/034/035: pesan validasi jadwal tampil ke customer.
			return nil, domain.NewUserFacingError(errV.Error())
		}
		scheduledAt = req.ScheduledAt
	}

	// 2. Ambil menu items by ID — harga dari server, bukan client
	menuIDs := make([]string, 0, len(req.Items))
	for _, it := range req.Items {
		menuIDs = append(menuIDs, it.MenuID)
	}
	menuItems, err := s.foodRepo.GetFoodMenuItems(ctx, menuIDs)
	if err != nil {
		return nil, err
	}
	menuByID := make(map[string]domain.FoodMenuItemInfo, len(menuItems))
	for _, mi := range menuItems {
		menuByID[mi.ID] = mi
	}

	// 3. Validasi: semua item ketemu, available, milik merchant ini
	for _, it := range req.Items {
		mi, ok := menuByID[it.MenuID]
		if !ok {
			return nil, domain.NewUserFacingError(fmt.Sprintf("menu item tidak ditemukan: %s", it.MenuID))
		}
		if mi.MerchantID != req.MerchantID {
			return nil, domain.NewUserFacingError(fmt.Sprintf("menu item bukan milik merchant ini: %s", it.MenuID))
		}
		if !mi.IsAvailable {
			return nil, domain.NewUserFacingError(fmt.Sprintf("menu item tidak tersedia: %s", mi.Name))
		}
	}

	// 3b. FB-108: ambil grup varian semua menu item (map[menuID][]variant).
	variantMap, err := s.foodRepo.GetMenuItemVariants(ctx, menuIDs)
	if err != nil {
		return nil, fmt.Errorf("get menu variants: %w", err)
	}

	// 4. Hitung ulang harga (server-side) + snapshot item
	var subtotal int64
	maxPrep := 0
	orderItems := make([]domain.FoodOrderItem, 0, len(req.Items))
	for _, it := range req.Items {
		mi := menuByID[it.MenuID]
		variants, hasVariants := variantMap[it.MenuID]

		// FB-108: validasi pilihan varian — zero-trust, semua dicek server.
		var itemDelta int64
		itemVariants := make([]domain.FoodOrderItemVariant, 0, len(it.Variants))
		if hasVariants && len(it.Variants) > 0 {
			selectedByVariant := make(map[string][]string) // variantID -> optionIDs
			optionByID := make(map[string]domain.MenuItemVariantOption)
			for _, v := range variants {
				for _, o := range v.Options {
					optionByID[o.ID] = o
				}
			}
			for _, sel := range it.Variants {
				// variant harus milik menu item ini
				var varFound *domain.MenuItemVariant
				for i := range variants {
					if variants[i].ID == sel.VariantID {
						varFound = &variants[i]
						break
					}
				}
				if varFound == nil {
					return nil, domain.NewUserFacingError(fmt.Sprintf("variant %s bukan milik menu item %s", sel.VariantID, mi.Name))
				}
				// option harus milik variant itu
				opt, okOpt := optionByID[sel.OptionID]
				if !okOpt || opt.VariantID != sel.VariantID {
					return nil, domain.NewUserFacingError(fmt.Sprintf("option %s bukan milik variant %s", sel.OptionID, sel.VariantID))
				}
				selectedByVariant[sel.VariantID] = append(selectedByVariant[sel.VariantID], sel.OptionID)
				itemDelta += opt.PriceDelta
				itemVariants = append(itemVariants, domain.FoodOrderItemVariant{
					VariantID:   varFound.ID,
					OptionID:    opt.ID,
					VariantName: varFound.Nama,
					OptionName:  opt.Nama,
					PriceDelta:  opt.PriceDelta,
				})
			}
			// validasi aturan per grup: required + max_select
			for _, v := range variants {
				selCount := len(selectedByVariant[v.ID])
				if v.IsRequired && selCount == 0 {
					return nil, domain.NewUserFacingError(fmt.Sprintf("pilih %s dulu untuk %s", v.Nama, mi.Name))
				}
				if selCount > v.MaxSelect {
					return nil, domain.NewUserFacingError(fmt.Sprintf("maksimal %d pilihan untuk %s (%s)", v.MaxSelect, v.Nama, mi.Name))
				}
				if selCount > 0 && selCount < v.MinSelect {
					return nil, domain.NewUserFacingError(fmt.Sprintf("minimal %d pilihan untuk %s (%s)", v.MinSelect, v.Nama, mi.Name))
				}
			}
		} else if hasVariants {
			// Item punya varian tapi client tidak kirim satupun — tolak kalau
			// ada grup required. Grup optional tanpa pilihan = skip (boleh).
			for _, v := range variants {
				if v.IsRequired {
					return nil, domain.NewUserFacingError(fmt.Sprintf("pilih %s dulu untuk %s", v.Nama, mi.Name))
				}
			}
		}

		unitPrice := mi.Price + itemDelta
		sub := unitPrice * int64(it.Quantity)
		subtotal += sub
		if mi.PrepTimeMinutes > maxPrep {
			maxPrep = mi.PrepTimeMinutes
		}
		orderItems = append(orderItems, domain.FoodOrderItem{
			MenuItemID: mi.ID,
			ItemName:   mi.Name,
			ItemPrice:  unitPrice,
			Quantity:   it.Quantity,
			Notes:      it.Notes,
			Subtotal:   sub,
			Variants:   itemVariants,
		})
	}

	// FB-109: minimum subtotal order merchant (0 = tanpa minimum).
	// Validasi SEBELUM bayar — customer langsung dapat pesan jelas.
	if merchant.MinOrderIDR > 0 && subtotal < merchant.MinOrderIDR {
		return nil, fmt.Errorf("minimum order di toko ini Rp %d — subtotal kamu Rp %d",
			merchant.MinOrderIDR, subtotal)
	}

	// 5. Ongkir: jarak merchant → dropoff, tarif dari service product food_delivery
	distanceKM := haversineKM(merchant.Lat, merchant.Lng, req.DropoffLat, req.DropoffLng)

	// FB-104: tolak order yang jaraknya melebihi radius maksimum kurir
	// (20 km = batas atas dropdown radius kurir sepeda). Tanpa ini order
	// tetap dibuat, masuk searching, lalu timeout tanpa peringatan awal —
	// customer sudah bayar duluan baru tahu tidak ada kurir.
	if err := validateFoodDeliveryDistance(distanceKM); err != nil {
		// UAT-C-032: pesan radius tampil ke customer sebelum bayar.
		return nil, domain.NewUserFacingError(err.Error())
	}

	svc, err := s.pricingRepo.GetDeliveryServiceByCode(ctx, "food_delivery")
	if err != nil || svc == nil {
		return nil, fmt.Errorf("service product food_delivery tidak ditemukan: %w", err)
	}
	deliveryFee := svc.BaseFareIDR
	if distanceKM > svc.IncludedDistanceKM {
		extra := int64(math.Ceil(distanceKM - svc.IncludedDistanceKM))
		deliveryFee += extra * svc.PerKmIDR
	}

	// 6. Biaya layanan (platform fee) — default 10% kalau config 0
	platformFeePct := svc.PlatformFeePct
	if platformFeePct <= 0 {
		platformFeePct = 10
	}
	platformFee := int64(math.Round(float64(subtotal) * platformFeePct / 100))

	total := subtotal + deliveryFee + platformFee

	// 6b. FB-078: apply voucher diskon (kalau ada) — zero-trust server-side.
	// Base diskon = subtotal + deliveryFee (platform fee tidak boleh kena diskon).
	// Validate dulu (tanpa catat usage); usage dicatat SETELAH order tersimpan.
	orderID := uuid.New().String()
	var voucherDiscount int64
	var voucherUsage *domain.VoucherValidationResult
	if req.VoucherCode != "" && s.voucherSvc != nil {
		vres, verr := s.voucherSvc.Validate(ctx, req.VoucherCode, userID, subtotal+deliveryFee, "p2p")
		if verr != nil {
			return nil, fmt.Errorf("voucher: %w", verr)
		}
		if !vres.Valid {
			return nil, fmt.Errorf("voucher tidak valid: %s", vres.Error)
		}
		voucherDiscount = vres.DiscountIDR
		if voucherDiscount > total {
			voucherDiscount = total
		}
		total -= voucherDiscount
		voucherUsage = vres
	}

	// 7. Build Order (status awal pending_payment, service_sub_type food_delivery)
	orderNum := fmt.Sprintf("TMBS%s", strings.ToUpper(uuid.New().String()[:6]))
	handoverToken := uuid.New().String()
	qrURL, err := utils.GenerateQRCodeDataURI(handoverToken, 256)
	if err != nil {
		return nil, fmt.Errorf("failed to generate qr code: %w", err)
	}

	prepMin := maxPrep
	merchantID := merchant.ID
	serviceSubType := "food_delivery"
	now := time.Now()
	order := &domain.Order{
		ID:                 orderID,
		OrderNumber:        orderNum,
		CustomerID:         userID,
		Model:              "p2p", // CHECK constraint orders_model_check — hanya p2p/two_legs/three_legs/hub_and_spoke; food = p2p + service_sub_type food_delivery
		Status:             domain.StatusPendingPayment,
		PickupAddress:      merchant.Address,
		PickupLat:          merchant.Lat,
		PickupLng:          merchant.Lng,
		DropoffAddress:     req.DropoffAddress,
		DropoffCity:        req.DropoffCity,
		DropoffZipCode:     req.DropoffZipCode,
		DropoffLat:         req.DropoffLat,
		DropoffLng:         req.DropoffLng,
		ItemDescription:    "Pesanan makanan",
		DistanceKM:         distanceKM,
		IncludedDistanceKM: svc.IncludedDistanceKM,
		DistanceFeeIDR:     deliveryFee,
		BasePriceIDR:       subtotal,
		DynamicPriceIDR:    subtotal,
		TotalPriceIDR:      total,
		DiscountIDR:        voucherDiscount,
		PromoCode:          req.VoucherCode,
		PricingSnapshot:    "{}",     // kolom json NOT NULL — food tidak punya snap struct; kirim objek kosong
		TaxRuleCode:        "PPN_11", // FK tax_rules.code — food kena PPN standar 11%
		PlatformFeeIDR:     platformFee,
		PlatformFeePct:     platformFeePct,
		HandoverToken:      handoverToken,
		QRCodeURL:          qrURL,
		ReceiverName:       req.ReceiverName,
		ReceiverPhone:      req.ReceiverPhone,
		ServiceSubType:     serviceSubType,
		Contactless:        req.Contactless,
		OrderNotes:         req.OrderNotes, // FB-121: catatan level order
		MerchantID:         &merchantID,
		PrepTimeMinutes:    &prepMin,
		ScheduledAt:        scheduledAt, // FB-123: NULL = pesan langsung
		IsScheduled:        scheduledAt != nil,
		CreatedAt:          now,
		UpdatedAt:          now,
	}

	// 8. Simpan order + items dalam SATU transaksi
	if err := s.foodRepo.CreateFoodOrderWithItems(ctx, order, orderItems); err != nil {
		return nil, err
	}

	// 8.b Catat pemakaian voucher SETELAH order sukses — kalau order gagal,
	// voucher tidak hangus (single-use tetap valid utk retry).
	if voucherUsage != nil {
		if oid, errO := uuid.Parse(order.ID); errO == nil {
			if uid, errU := uuid.Parse(order.CustomerID); errU == nil {
				_ = s.voucherSvc.RecordUsage(ctx, voucherUsage.VoucherID, oid, uid, voucherUsage.DiscountIDR)
			}
		}
	}

	// 9. Event + broadcast (pola CreateOrder)
	event := domain.OrderEvent{
		OrderID:   order.ID,
		UserID:    order.CustomerID,
		Status:    order.Status,
		Message:   "Food order created, awaiting payment",
		CreatedAt: now,
	}
	_ = s.eventRepo.SaveEvent(ctx, event)
	_ = s.eventBus.Publish(ctx, "order.updates", event)

	if s.notificationSvc != nil {
		_ = s.notificationSvc.Send(ctx, domain.NotificationRequest{
			UserID:  userID,
			Title:   "Order dibuat",
			Message: fmt.Sprintf("Order %s menunggu pembayaran", orderNum),
		})
	}

	return order, nil
}

func (s *orderServiceImpl) AcceptByMerchant(ctx context.Context, orderID string, merchantID string) error {
	if s.foodRepo == nil {
		return fmt.Errorf("food repository not wired")
	}
	o, err := s.foodRepo.GetFoodOrderForMerchant(ctx, orderID, merchantID)
	if err != nil {
		return err
	}
	if o.Status != domain.StatusPendingMerchant {
		return fmt.Errorf("order %s tidak dalam status pending_merchant (status: %s)", orderID, o.Status)
	}
	prep := 15
	if o.PrepTimeMinutes != nil && *o.PrepTimeMinutes > 0 {
		prep = *o.PrepTimeMinutes
	}
	if err := s.foodRepo.AcceptFoodOrder(ctx, orderID, prep); err != nil {
		return err
	}
	s.publishOrderEvent(ctx, orderID, domain.StatusPreparing, "Merchant menerima pesanan — makanan disiapkan")

	// FB-124: notif customer bahwa merchant menerima pesanannya.
	// Wajib masuk inbox juga supaya C-041/UI tracking konsisten.
	// ChannelPush dipakai agar delivery async tetap jalan, tetapi record
	// in-app sudah tersimpan via notification service.
	if s.notificationSvc != nil {
		if errNotif := s.notificationSvc.Send(ctx, domain.NotificationRequest{
			UserID:  o.CustomerID,
			Title:   "Merchant menerima pesananmu",
			Message: "Merchant menerima pesananmu — makanan sedang disiapkan",
			Channel: domain.ChannelPush,
			Data: map[string]string{
				"type":     "merchant_accepted",
				"order_id": orderID,
				"order_no": o.OrderNumber,
			},
		}); errNotif != nil {
			log.Printf("[OrderService] FB-124 notif merchant_accepted gagal order %s: %v", orderID, errNotif)
		}
	}
	return nil
}

func (s *orderServiceImpl) RejectByMerchant(ctx context.Context, orderID string, merchantID string, reason string) error {
	if s.foodRepo == nil {
		return fmt.Errorf("food repository not wired")
	}
	o, err := s.foodRepo.GetFoodOrderForMerchant(ctx, orderID, merchantID)
	if err != nil {
		return err
	}
	if o.Status != domain.StatusPendingMerchant {
		return fmt.Errorf("order %s tidak dalam status pending_merchant (status: %s)", orderID, o.Status)
	}
	if err := s.foodRepo.RejectFoodOrder(ctx, orderID, reason); err != nil {
		return err
	}
	s.publishOrderEvent(ctx, orderID, domain.StatusCancelled, "Pesanan ditolak merchant: "+reason)

	// FB-081: merchant menolak = kesalahan merchant → refund penuh
	// FB-082: fee di-charge ke merchant (customer refund 100%, platform tidak rugi)
	s.triggerRefundOnCancel(ctx, orderID, "Pesanan ditolak merchant: "+reason, domain.StatusPendingMerchant, "merchant")
	return nil
}

func (s *orderServiceImpl) triggerRefundOnCancel(ctx context.Context, orderID string, reason string, originalStatus domain.OrderStatus, chargeFeeTo string) {
	if s.refundSvc == nil {
		return
	}
	oid, errParse := uuid.Parse(orderID)
	if errParse != nil {
		log.Printf("[OrderService] triggerRefundOnCancel: invalid order id %s", orderID)
		return
	}
	if _, errRefund := s.refundSvc.CalculateAndTriggerRefund(ctx, oid, reason, domain.RefundOptions{OriginalStatus: originalStatus, ChargeCancellationFeeTo: chargeFeeTo}); errRefund != nil {
		log.Printf("[OrderService] triggerRefundOnCancel: gagal refund order %s: %v", orderID, errRefund)
	}
	// FB-083: refund tip juga (kalau ada) — fire-and-forget
	if s.tipSvc != nil {
		if errTip := s.tipSvc.RefundTipByOrder(ctx, oid); errTip != nil {
			log.Printf("[OrderService] triggerRefundOnCancel: gagal refund tip order %s: %v", orderID, errTip)
		}
	}
	// FB-084: notif push customer — order batal karena kesalahan merchant
	// (reject / timeout respon). Fire-and-forget.
	if s.pushSvc != nil {
		if errPush := s.pushSvc.NotifyCustomerOrderCancelled(ctx, orderID, reason); errPush != nil {
			log.Printf("[OrderService] triggerRefundOnCancel: gagal push notif customer order %s: %v", orderID, errPush)
		}
	}
}

func (s *orderServiceImpl) ProcessFoodPrepTransitions(ctx context.Context) error {
	if s.foodRepo == nil {
		return nil // food belum di-wire — skip aman
	}

	// 1) preparing → searching
	prepping, err := s.foodRepo.GetPreparingFoodOrders(ctx)
	if err != nil {
		return fmt.Errorf("get preparing food orders: %w", err)
	}
	for _, o := range prepping {
		if err := s.orderRepo.UpdateStatus(ctx, o.ID, domain.StatusSearching); err != nil {
			log.Printf("[FoodPrepWorker] gagal transisi %s → searching: %v", o.ID, err)
			continue
		}
		s.publishOrderEvent(ctx, o.ID, domain.StatusSearching, "Makanan hampir siap — mencari driver terdekat")
	}

	// 2) pending_merchant timeout → auto-cancel
	timeouts, err := s.foodRepo.GetPendingMerchantFoodOrders(ctx, 3*time.Minute)
	if err != nil {
		return fmt.Errorf("get pending merchant timeouts: %w", err)
	}
	for _, o := range timeouts {
		if err := s.foodRepo.RejectFoodOrder(ctx, o.ID, "merchant_timeout_3m"); err != nil {
			log.Printf("[FoodPrepWorker] gagal auto-cancel %s: %v", o.ID, err)
			continue
		}
		s.publishOrderEvent(ctx, o.ID, domain.StatusCancelled, "Merchant tidak merespon dalam 3 menit — order dibatalkan otomatis")
		// FB-081: auto-cancel karena merchant tidak merespon → refund 100%
		// (status asal pending_merchant = free window).
		// FB-082: fee di-charge ke merchant (piutang).
		s.triggerRefundOnCancel(ctx, o.ID, "Merchant tidak merespon dalam 3 menit", domain.StatusPendingMerchant, "merchant")
	}

	return nil
}

func (s *orderServiceImpl) ProcessScheduledOrderActivation(ctx context.Context) error {
	if s.foodRepo == nil {
		return nil // food belum di-wire — skip aman
	}

	due, err := s.foodRepo.GetScheduledFoodOrdersDue(ctx)
	if err != nil {
		return fmt.Errorf("get scheduled food orders due: %w", err)
	}
	if len(due) == 0 {
		return nil
	}

	now := time.Now()
	for _, so := range due {
		// Re-validasi merchant (bisa berubah sejak order dibuat).
		merchant, errM := s.foodRepo.GetFoodMerchant(ctx, so.MerchantID)
		if errM != nil {
			log.Printf("[ScheduledOrderWorker] gagal load merchant %s untuk order %s: %v", so.MerchantID, so.OrderID, errM)
			// Jangan cancel karena error teknis — biarkan di run berikutnya.
			continue
		}
		valid := merchant != nil &&
			merchant.VerificationStatus == "approved" &&
			merchant.IsOpen &&
			(merchant.PausedUntil == nil || merchant.PausedUntil.Before(now))
		// Jam operasional saat aktivasi (zona WIB — AUDIT-FIX M1).
		// M2: kalau belum jam buka → JANGAN cancel, tunggu tick berikutnya
		// (merchant baru is_open pagi hari; auto-cancel prematur merugikan).
		// M3: dukung rentang lintas tengah malam.
		// m3: aktivasi tepat jam tutup (nowMin == closeMin) dianggap TUTUP.
		nowJkt := inJakarta(now)
		nowMin := nowJkt.Hour()*60 + nowJkt.Minute()
		if valid && merchant.JamBuka != nil && merchant.JamTutup != nil {
			openH, openM, errO := parseHHMM(*merchant.JamBuka)
			closeH, closeM, errC := parseHHMM(*merchant.JamTutup)
			if errO == nil && errC == nil {
				openMin := openH*60 + openM
				closeMin := closeH*60 + closeM
				if closeMin < openMin {
					// Lintas tengah malam: tutup kalau di luar [buka..24:00] ∪ [00:00..tutup]
					if nowMin < openMin && nowMin > closeMin {
						log.Printf("[ScheduledOrderWorker] %s: di luar jam operasional %s–%s (lintas tengah malam) — skip, coba tick berikutnya", so.OrderID, *merchant.JamBuka, *merchant.JamTutup)
						continue
					}
				} else if nowMin < openMin {
					// M2: BELUM jam buka → skip (jangan cancel), tunggu tick berikutnya.
					log.Printf("[ScheduledOrderWorker] %s: belum jam buka (%s) — skip, coba tick berikutnya", so.OrderID, *merchant.JamBuka)
					continue
				} else if nowMin >= closeMin {
					// m3: sudah lewat/tepat jam tutup → cancel.
					valid = false
				}
			}
		}

		if !valid {
			reason := "merchant_tidak_tersedia_saat_aktivasi"
			if errC := s.foodRepo.CancelScheduledFoodOrder(ctx, so.OrderID, reason); errC != nil {
				log.Printf("[ScheduledOrderWorker] gagal auto-cancel scheduled %s: %v", so.OrderID, errC)
				continue
			}
			s.publishOrderEvent(ctx, so.OrderID, domain.StatusCancelled,
				"Maaf, merchant tidak bisa menerima pesanan terjadwal kamu saat ini — dana dikembalikan penuh")
			s.triggerRefundOnCancel(ctx, so.OrderID,
				"Merchant tidak bisa menerima pesanan terjadwal saat aktivasi", domain.StatusScheduled, "platform")
			// m2-AUDIT-FIX: triggerRefundOnCancel sudah mengirim
			// NotifyCustomerOrderCancelled — tidak perlu push kedua (duplikat).
			log.Printf("[ScheduledOrderWorker] auto-cancel scheduled %s (merchant tidak valid)", so.OrderID)
			continue
		}

		// Valid → aktivasi.
		if errA := s.foodRepo.ActivateScheduledFoodOrder(ctx, so.OrderID); errA != nil {
			log.Printf("[ScheduledOrderWorker] gagal aktivasi scheduled %s: %v", so.OrderID, errA)
			continue
		}
		s.publishOrderEvent(ctx, so.OrderID, domain.StatusPendingMerchant,
			"Pesanan terjadwal kamu mulai diproses merchant")
		if s.pushSvc != nil {
			if errN := s.pushSvc.NotifyMerchantNewOrder(ctx, so.OrderID); errN != nil {
				log.Printf("[ScheduledOrderWorker] gagal notify merchant order %s: %v", so.OrderID, errN)
			}
		}
		log.Printf("[ScheduledOrderWorker] aktivasi scheduled %s → pending_merchant", so.OrderID)
	}

	return nil
}

func (s *orderServiceImpl) PairFoodBatches(ctx context.Context) error {
	if s.foodRepo == nil {
		return nil // food belum di-wire — skip aman
	}

	const (
		maxRadiusKM = 1.5
		maxETAMin   = 30
	)

	candidates, err := s.foodRepo.GetSearchingFoodOrdersForBatch(ctx)
	if err != nil {
		return fmt.Errorf("get searching food orders for batch: %w", err)
	}

	paired := make(map[string]bool, len(candidates))
	for _, o := range candidates {
		if paired[o.ID] {
			continue
		}
		// Cari pasangan yang juga masih searching & tanpa batch
		cand, distM, err := s.foodRepo.FindBatchCandidate(ctx, o.ID, maxRadiusKM)
		if err != nil {
			log.Printf("[FoodBatchWorker] FindBatchCandidate %s: %v", o.ID, err)
			continue
		}
		if cand == nil {
			continue // tidak ada pasangan — order jalan solo (GATE)
		}

		// Ambil merchant_id order A (pasangan pasti merchant sama — query menjamin)
		orderA, err := s.orderRepo.GetByID(ctx, o.ID)
		if err != nil {
			continue
		}
		batch := &domain.FoodBatch{
			ID:               uuid.New().String(),
			MerchantID:       *orderA.MerchantID,
			DropoffDistanceM: int(distM),
			MaxETAMinutes:    maxETAMin,
		}
		if err := s.foodRepo.CreateFoodBatch(ctx, batch, o.ID, cand.ID); err != nil {
			log.Printf("[FoodBatchWorker] CreateFoodBatch %s+%s: %v", o.ID, cand.ID, err)
			continue
		}

		paired[o.ID] = true
		paired[cand.ID] = true
		log.Printf("[FoodBatchWorker] batch %s terbentuk: %s + %s (jarak dropoff %dm)", batch.ID, o.ID, cand.ID, int(distM))

		// Notify kedua customer — pesanan digabung 1 trip, ETA tetap aman
		for _, oid := range []string{o.ID, cand.ID} {
			s.publishOrderEvent(ctx, oid, domain.StatusSearching,
				"Pesanan digabung dengan pesanan lain di sekitar — driver akan antar keduanya dalam satu perjalanan")
		}
	}

	return nil
}

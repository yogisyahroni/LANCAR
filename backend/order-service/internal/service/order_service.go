package service

import (
	"fmt"
	"math"
	"strings"
	"tembus/order-service/internal/domain"
	"tembus/order-service/internal/domain/queue"
	"tembus/order-service/internal/featureflags"
	"time"
)

type orderServiceImpl struct {
	orderRepo       domain.OrderRepository
	eventRepo       domain.OrderEventRepository
	redisRepo       domain.RedisRepository
	pricingRepo     domain.PricingRepository
	relayRepo       domain.RelayRepository
	eventBus        domain.EventBus
	taskQueue       queue.Queue
	flagReader      featureflags.FlagReader
	notificationSvc domain.NotificationService
	configRepo      domain.ConfigRepository
	refundSvc       domain.RefundService
	reportSvc       domain.ServiceReportService
	ledgerRepo      domain.FinanceLedgerRepository
	taxSvc          domain.TaxService
	foodRepo        domain.FoodRepository
	settlementSvc   domain.MerchantSettlementService
	pointsSvc       domain.DriverPointsService
	penaltySvc      domain.DriverPenaltyService
	voucherSvc      domain.VoucherService
	tipSvc          domain.TipService  // FB-083: refund tip saat order batal
	pushSvc         domain.PushService // FB-084: notif push customer saat merchant reject/timeout
}

func NewOrderService(o domain.OrderRepository, er domain.OrderEventRepository, r domain.RedisRepository, p domain.PricingRepository, relayRepo domain.RelayRepository, eb domain.EventBus, tq queue.Queue, f featureflags.FlagReader, ns domain.NotificationService, cr domain.ConfigRepository, lr domain.FinanceLedgerRepository, ts domain.TaxService) domain.OrderService {
	return &orderServiceImpl{
		orderRepo:       o,
		eventRepo:       er,
		redisRepo:       r,
		pricingRepo:     p,
		relayRepo:       relayRepo,
		eventBus:        eb,
		taskQueue:       tq,
		flagReader:      f,
		notificationSvc: ns,
		configRepo:      cr,
		ledgerRepo:      lr,
		taxSvc:          ts,
	}
}

func (s *orderServiceImpl) SetRefundService(rs domain.RefundService) {
	s.refundSvc = rs
}

func (s *orderServiceImpl) SetTipService(ts domain.TipService) {
	s.tipSvc = ts
}

func (s *orderServiceImpl) SetPushService(ps domain.PushService) {
	s.pushSvc = ps
}

// SetMerchantSettlementService inject settlement service (FOOD-BIKE-067).
// Dipanggil dari ScanPackage saat order food delivered tanpa payment link.
func (s *orderServiceImpl) SetMerchantSettlementService(mss domain.MerchantSettlementService) {
	s.settlementSvc = mss
}

// SetDriverIncentiveServices inject points + penalty service (FOOD-BIKE-068).
// Points ditambah saat order food delivered; penalty dipakai anti-ghosting.
func (s *orderServiceImpl) SetDriverIncentiveServices(pts domain.DriverPointsService, pen domain.DriverPenaltyService) {
	s.pointsSvc = pts
	s.penaltySvc = pen
}

func (s *orderServiceImpl) SetServiceReportService(reportSvc domain.ServiceReportService) {
	s.reportSvc = reportSvc
}

// SetFoodRepository — inject food repository (FOOD-BIKE-073).
// Dipanggil dari wiring setelah service di-construct.
func (s *orderServiceImpl) SetFoodRepository(fr domain.FoodRepository) {
	s.foodRepo = fr
}

// SetVoucherService — inject voucher service (FB-078).
// Dipanggil dari wiring setelah service di-construct.
func (s *orderServiceImpl) SetVoucherService(vs domain.VoucherService) {
	s.voucherSvc = vs
}

// createAggregatorOrder membuat order untuk pengiriman 3PL (JNE/J&T).
// Tidak membutuhkan Redis estimate — semua data diambil langsung dari CreateOrderRequest.
// Status awal: pending_assignment (AWB akan di-generate terpisah oleh payment_link webhook).

type scoredCourier struct {
	ID       string
	Score    float64
	TierRank int
}

func clampFloat(value float64, minValue float64, maxValue float64) float64 {
	if value < minValue {
		return minValue
	}
	if value > maxValue {
		return maxValue
	}
	return value
}

// SubmitRating memproses penilaian customer terhadap kurir.
// Security: customerID diambil dari JWT (middleware), bukan dari body request.
// Validasi:
//  1. Order harus dimiliki oleh customerID yang sedang login.
//  2. Status order harus "delivered".
//  3. Order belum pernah di-rating (courier_rating IS NULL).
//  4. Rating antara 1.0 - 5.0.

// SubmitMerchantRating — FOOD-BIKE-059/060: customer menilai makanan merchant,
// terpisah dari rating driver. Validasi sama (order milik customer + delivered),
// idempotent via UNIQUE(order_id, merchant_id).

// GetOrdersNeedingRatingReminder mengembalikan order yang perlu mendapat notifikasi
// reminder rating. Dipanggil saat customer membuka notifikasi atau oleh worker.
// Constraint: max 4 reminder, interval minimal 12 jam.

// ─────────────────────────────────────────────────────────────
// FOOD DELIVERY — CreateFoodOrder (FOOD-BIKE-073)
// Zero-trust: harga item dihitung ulang server-side dari
// merchant_menu_items. Client hanya kirim menu_item_id + quantity.
// ─────────────────────────────────────────────────────────────

// validateFoodDeliveryDistance — FB-104: tolak order food kalau jarak
// merchant → dropoff melebihi radius maksimum kurir (20 km = batas atas
// dropdown radius kurir sepeda). Dipanggil di CreateFoodOrder SEBELUM
// customer bayar, supaya tidak ada order yang masuk searching lalu
// timeout tanpa kurir bersedia.
func validateFoodDeliveryDistance(distanceKM float64) error {
	const foodMaxRadiusKM = 20.0
	if distanceKM > foodMaxRadiusKM {
		return fmt.Errorf("jarak pengantaran %.1f km melebihi radius maksimum kurir (%.0f km) — pilih merchant yang lebih dekat atau alamat antar yang lain", distanceKM, foodMaxRadiusKM)
	}
	return nil
}

// validateItemCategory — TC-LOG-005: cegah order dengan kategori/deskripsi
// barang terlarang (gas, chemical, weapon, flammable, explosive, dll).
// Case-insensitive. Cek baik field `category` eksplisit maupun kata kunci
// berbahaya di `item_description` (defense-in-depth).
func validateItemCategory(category, description string) error {
	forbidden := []string{
		"gas", "gas lpg", "elpiji", "chemical", "kimia", "weapon", "senjata",
		"gun", "pistol", "flammable", "mudah terbakar", "explosive", "peledak",
		"bahan peledak", "radioactive", "radioaktif", "toxic", "beracun", "drugs", "narkoba",
	}
	hay := strings.ToLower(strings.TrimSpace(category)) + " " + strings.ToLower(strings.TrimSpace(description))
	for _, f := range forbidden {
		if strings.Contains(hay, f) {
			return domain.ErrForbiddenItem
		}
	}
	return nil
}

// jakartaLoc — AUDIT-FIX M1: semua perbandingan jam operasional & same-day
// memakai zona WIB (Asia/Jakarta) eksplisit, TIDAK bergantung TZ OS server
// (container Docker default UTC → geser 7 jam). Merchant beroperasi di
// Indonesia; jadwal customer dikirim dengan offset lokal dan dikonversi ke
// WIB untuk dibandingkan dengan jam_buka/jam_tutup merchant.
var jakartaLoc = func() *time.Location {
	loc, err := time.LoadLocation("Asia/Jakarta")
	if err != nil {
		return time.FixedZone("WIB", 7*60*60) // fallback aman kalau tzdata hilang
	}
	return loc
}()

// inJakarta — konversi time ke zona WIB (AUDIT-FIX M1).
func inJakarta(t time.Time) time.Time {
	return t.In(jakartaLoc)
}

// validateScheduledAt — FB-123: aturan pesanan terjadwal yang dipakai
// CreateFoodOrder: wajib ada waktu, min lead 30 menit, same-day only,
// dalam jam operasional merchant (jam_buka/jam_tutup TIME "HH:MM[:SS]").
// AUDIT-FIX M1: perbandingan jam/tanggal memakai zona WIB eksplisit;
// AUDIT-FIX M3: dukung jam operasional lintas tengah malam (buka 18:00–02:00).
// Pure function (terima `now` eksplisit) — testable & tidak time-dependent.
func validateScheduledAt(sa *time.Time, jamBuka, jamTutup *string, now time.Time) error {
	if sa == nil {
		return fmt.Errorf("waktu jadwal wajib diisi (scheduled_at)")
	}
	if sa.Before(now.Add(30 * time.Minute)) {
		return fmt.Errorf("waktu jadwal minimal 30 menit dari sekarang")
	}
	// Same-day only (V1): tanggal harus sama dengan hari ini (zona WIB).
	saJkt := inJakarta(*sa)
	nowJkt := inJakarta(now)
	y1, m1, d1 := saJkt.Date()
	y2, m2, d2 := nowJkt.Date()
	if y1 != y2 || m1 != m2 || d1 != d2 {
		return fmt.Errorf("pesanan terjadwal hanya bisa untuk hari ini — pilih jam yang masih hari ini")
	}
	// Jam operasional merchant (jam_buka/jam_tutup TIME "HH:MM[:SS]").
	// Jam merchant diasumsikan zona WIB (operasi di Indonesia).
	if jamBuka != nil && jamTutup != nil {
		openH, openM, errO := parseHHMM(*jamBuka)
		closeH, closeM, errC := parseHHMM(*jamTutup)
		if errO == nil && errC == nil {
			targetMin := saJkt.Hour()*60 + saJkt.Minute()
			openMin := openH*60 + openM
			closeMin := closeH*60 + closeM
			// M3: rentang lintas tengah malam (tutup < buka, mis. 18:00–02:00):
			// valid kalau target >= buka ATAU target <= tutup.
			if closeMin < openMin {
				if targetMin < openMin && targetMin > closeMin {
					return fmt.Errorf("merchant buka jam %s–%s — pilih waktu di dalam jam operasional",
						*jamBuka, *jamTutup)
				}
			} else if targetMin < openMin || targetMin > closeMin {
				return fmt.Errorf("merchant buka jam %s–%s — pilih waktu di dalam jam operasional",
					*jamBuka, *jamTutup)
			}
		}
	}
	return nil
}

// parseHHMM — FB-123: parse jam operasional merchant (TIME "HH:MM" atau
// "HH:MM:SS") → jam + menit. Return error kalau format tidak dikenal.
func parseHHMM(s string) (int, int, error) {
	t, err := time.Parse("15:04:05", s)
	if err != nil {
		t, err = time.Parse("15:04", s)
	}
	if err != nil {
		return 0, 0, err
	}
	return t.Hour(), t.Minute(), nil
}

// haversineKM — jarak dua titik koordinat dalam kilometer.
func haversineKM(lat1, lng1, lat2, lng2 float64) float64 {
	const earthRadiusKM = 6371.0
	dLat := (lat2 - lat1) * math.Pi / 180.0
	dLng := (lng2 - lng1) * math.Pi / 180.0
	a := math.Sin(dLat/2)*math.Sin(dLat/2) +
		math.Cos(lat1*math.Pi/180.0)*math.Cos(lat2*math.Pi/180.0)*
			math.Sin(dLng/2)*math.Sin(dLng/2)
	c := 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
	return earthRadiusKM * c
}

// ── FOOD-BIKE-021: accept/reject order food oleh merchant ────────────────────

// AcceptByMerchant — merchant menyetujui order food: pending_merchant → preparing.
// food_ready_at dihitung = NOW() + prep_time_minutes (dipakai worker matching).

// RejectByMerchant — merchant menolak order food: pending_merchant → cancelled.
// Reason wajib (alasan penolakan merchant). FB-081: setelah reject sukses →
// trigger refund 100% otomatis. FB-082: fee di-charge ke merchant (piutang).

// triggerRefundOnCancel — helper: trigger refund dgn original status eksplisit
// (fire-and-forget — error hanya di-log, tidak menggagalkan flow utama).
// chargeFeeTo: "customer" (default) | "merchant" (FB-082) | "none".

// ProcessFoodPrepTransitions — dipanggil food_prep_worker tiap 1 menit:
//  1. Order preparing yang food_ready_at ≤ NOW()+5m → searching (driver matching
//     mulai 5 menit sebelum makanan siap, driver standby saat ready).
//  2. Order pending_merchant yang belum direspon > 3 menit → auto-cancel
//     (FOOD-BIKE-022, pola SLA worker).

// ProcessScheduledOrderActivation — dipanggil scheduled_order_worker tiap 1
// menit (FB-123). Order status 'scheduled' yang sudah due (scheduled_at ≤
// NOW() + prep_time + buffer 5 menit):
//
//  1. Re-validasi merchant masih layak terima order:
//     - approved (verification_status)
//     - is_open
//     - tidak sedang paused_until > NOW()
//     - scheduled_at masih dalam jam operasional (jam tutup tidak dimajukan)
//  2. Valid → scheduled → pending_merchant + NotifyMerchantNewOrder (dari
//     titik ini alur sama persis dengan order normal: SLA 3 menit accept).
//  3. Tidak valid → auto-cancel + refund 100% + notif customer (belum ada
//     pihak lain yang mulai kerja → tidak ada fee ke siapapun).

// PairFoodBatches — FB-088: pairing 2 order food `searching` dari merchant
// sama + dropoff berdekatan (≤ 1.5 km) menjadi 1 batch trip courier.
//
// GATE SLA assessment:
//   - Pairing hanya terjadi di window `searching` (matching driver sudah mulai
//     5 menit sebelum makanan siap) → tidak menambah ETA.
//   - Timebox ≤ 2 menit (GetSearchingFoodOrdersForBatch) → kalau tidak ada
//     pasangan, order jalan solo (broadcast normal) — delay bounded.
//   - Radius antar dropoff ≤ 1.5 km → detour maks ~5 menit.
//   - Max 2 order per batch → terukur & aman untuk SLA.
//
// Setelah pairing, courier yang accept order pertama otomatis di-assign ke
// semua order dalam batch (AcceptOrder sudah batch-aware via GetByBatchID).

// ─────────────────────────────────────────────────────────────
// FOOD DELIVERY — Browse merchant (FOOD-BIKE-055/056)
// ─────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────
// FOOD-BIKE-070: Favorite Merchants (C3)
// ─────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────
// FB-084 REORDER — validasi ulang item order food lama
// ─────────────────────────────────────────────────────────────
// CheckReorder membandingkan snapshot food_order_items (harga beku saat
// order) vs harga/availability merchant_menu_items saat ini. Hasilnya
// dipakai client untuk prefill cart + dialog perbedaan harga.

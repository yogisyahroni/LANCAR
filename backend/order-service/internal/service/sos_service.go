package service

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"sync"
	"time"

	"github.com/google/uuid"
	"tembus/order-service/internal/domain"
)

type DefaultSosService struct {
	sosRepo  domain.SosRepository
	notifSvc domain.NotificationService
}

func NewSosService(sr domain.SosRepository, ns domain.NotificationService) *DefaultSosService {
	return &DefaultSosService{
		sosRepo:  sr,
		notifSvc: ns,
	}
}

func (s *DefaultSosService) TriggerSOS(ctx context.Context, req domain.SosTriggerRequest) (uuid.UUID, error) {
	// 1. Simpan incident ke database
	incident := &domain.SosIncident{
		ID:              uuid.New(),
		VictimCourierID: req.VictimID,
		Latitude:        req.Latitude,
		Longitude:       req.Longitude,
		Status:          domain.SosStatusBroadcasted,
		CreatedAt:       time.Now(),
		UpdatedAt:       time.Now(),
	}

	if err := s.sosRepo.CreateIncident(ctx, incident); err != nil {
		return uuid.Nil, fmt.Errorf("failed to create sos incident: %w", err)
	}

	// 2. Cari max 5 kurir yang sedang online dalam radius 5KM menggunakan PostGIS ST_DWithin
	const radiusMeters = 5000.0 // 5 KM
	const maxHelpers = 5

	nearbyCouriers, err := s.sosRepo.GetNearbyCouriersForSOS(ctx, req.Latitude, req.Longitude, radiusMeters, maxHelpers)
	if err != nil {
		slog.ErrorContext(ctx, "SOS: gagal mencari kurir terdekat via PostGIS",
			"incident_id", incident.ID,
			"error", err,
		)
		// Jangan gagalkan incident, broadcast tetap dilakukan via log agar tim ops tahu
		return incident.ID, nil
	}

	if len(nearbyCouriers) == 0 {
		slog.WarnContext(ctx, "SOS: tidak ada kurir online dalam radius 5KM",
			"incident_id", incident.ID,
			"lat", req.Latitude,
			"lng", req.Longitude,
		)
		return incident.ID, nil
	}

	slog.InfoContext(ctx, "SOS: ditemukan kurir terdekat",
		"incident_id", incident.ID,
		"courier_count", len(nearbyCouriers),
	)

	// 3. Kumpulkan semua User ID kurir penolong
	userIDs := make([]uuid.UUID, 0, len(nearbyCouriers))
	for _, c := range nearbyCouriers {
		userIDs = append(userIDs, c.UserID)
	}

	// 4. Ambil FCM token dari tabel user_devices (satu user bisa punya banyak device)
	tokensMap, err := s.sosRepo.GetFCMTokensByUserIDs(ctx, userIDs)
	if err != nil {
		slog.ErrorContext(ctx, "SOS: gagal mengambil FCM token dari user_devices",
			"incident_id", incident.ID,
			"error", err,
		)
		return incident.ID, nil
	}

	// 5. Buat payload notifikasi FCM
	payload := map[string]string{
		"type":        "sos_emergency_dispatch",
		"incident_id": incident.ID.String(),
		"victim_lat":  fmt.Sprintf("%f", req.Latitude),
		"victim_lng":  fmt.Sprintf("%f", req.Longitude),
		"title":       "⚠️ PANGGILAN DARURAT (SOS)",
		"body":        "Rekan Anda membutuhkan bantuan! Ketuk untuk melihat lokasi dan memberikan pertolongan.",
	}

	// 6. Kirimkan FCM ke setiap kurir secara paralel menggunakan goroutine
	var wg sync.WaitGroup
	for _, courier := range nearbyCouriers {
		tokens, ok := tokensMap[courier.UserID]
		if !ok || len(tokens) == 0 {
			slog.WarnContext(ctx, "SOS: kurir tidak punya FCM token aktif",
				"incident_id", incident.ID,
				"user_id", courier.UserID,
				"distance_m", courier.DistanceMeters,
			)
			continue
		}

		for _, token := range tokens {
			wg.Add(1)
			go func(fcmToken string, uid uuid.UUID, distM float64) {
				defer wg.Done()
				if err := sendFCMPushNotification(fcmToken, payload); err != nil {
					slog.ErrorContext(context.Background(), "SOS: gagal kirim FCM ke kurir",
						"incident_id", incident.ID,
						"user_id", uid,
						"distance_m", distM,
						"error", err,
					)
				} else {
					slog.InfoContext(context.Background(), "SOS: FCM terkirim ke kurir penolong",
						"incident_id", incident.ID,
						"user_id", uid,
						"distance_m", distM,
					)
				}
			}(token, courier.UserID, courier.DistanceMeters)
		}
	}
	// Tunggu semua goroutine FCM selesai (max 10 detik, non-blocking terhadap response HTTP)
	go func() {
		wg.Wait()
		slog.InfoContext(context.Background(), "SOS: broadcast selesai",
			"incident_id", incident.ID,
			"target_count", len(nearbyCouriers),
		)
	}()

	return incident.ID, nil
}

func (s *DefaultSosService) AcceptSOS(ctx context.Context, req domain.SosAcceptRequest) (*domain.SosIncident, error) {
	incident, err := s.sosRepo.GetIncidentByID(ctx, req.IncidentID)
	if err != nil {
		return nil, fmt.Errorf("failed to find incident: %w", err)
	}

	count, err := s.sosRepo.GetHelperCountByIncident(ctx, req.IncidentID)
	if err != nil {
		return nil, fmt.Errorf("failed to check helper count: %w", err)
	}

	if count >= 5 {
		return nil, errors.New("kuota penolong penuh (max 5)")
	}

	if err := s.sosRepo.AddHelperToIncident(ctx, req.IncidentID, req.HelperID); err != nil {
		return nil, fmt.Errorf("failed to add helper to incident: %w", err)
	}

	if incident.Status == domain.SosStatusBroadcasted {
		incident.Status = domain.SosStatusAccepted
		incident.UpdatedAt = time.Now()
		if err := s.sosRepo.UpdateIncident(ctx, incident); err != nil {
			slog.ErrorContext(ctx, "failed to update incident status to accepted", "error", err)
		}
	}

	// BUG-2: Notify the victim that a helper is coming
	go func() {
		helperName, err := s.sosRepo.GetUserNameByID(context.Background(), req.HelperID)
		if err != nil {
			helperName = "Seorang Kurir"
			slog.Warn("failed to get helper name for SOS accept notification", "error", err)
		}

		victimUserID, err := s.sosRepo.GetUserIDByCourierProfileID(context.Background(), incident.VictimCourierID)
		if err != nil {
			slog.Error("failed to get victim user id for SOS accept notification", "error", err)
			return
		}

		s.sendFCMPushNotification(context.Background(), []uuid.UUID{victimUserID}, "sos_helper_accepted", map[string]string{
			"incident_id": incident.ID.String(),
			"helper_name": helperName,
			"message":     fmt.Sprintf("%s sedang menuju lokasimu untuk memberikan bantuan.", helperName),
		})
	}()

	return incident, nil
}

func (s *DefaultSosService) SubmitHelperReport(ctx context.Context, req domain.SosSubmitReportRequest) error {
	incident, err := s.sosRepo.GetIncidentByID(ctx, req.IncidentID)
	if err != nil {
		return fmt.Errorf("failed to find incident: %w", err)
	}

	if incident.Status != domain.SosStatusAccepted && incident.Status != domain.SosStatusBroadcasted {
		return errors.New("SOS incident is already resolved or in invalid state")
	}

	if err := s.sosRepo.UpdateHelperReport(ctx, req.IncidentID, req.HelperID, req.Verdict, req.PhotoURL); err != nil {
		return fmt.Errorf("failed to submit helper report: %w", err)
	}

	// Trigger consensus check asynchronously or synchronously
	return s.CheckAndResolveConsensus(ctx, req.IncidentID)
}

func (s *DefaultSosService) CheckAndResolveConsensus(ctx context.Context, incidentID uuid.UUID) error {
	incident, err := s.sosRepo.GetIncidentByID(ctx, incidentID)
	if err != nil {
		return fmt.Errorf("failed to find incident: %w", err)
	}

	if incident.Status != domain.SosStatusAccepted && incident.Status != domain.SosStatusBroadcasted {
		return nil // already resolved
	}

	helpers, err := s.sosRepo.GetHelpersByIncident(ctx, incidentID)
	if err != nil {
		return fmt.Errorf("failed to fetch helpers for consensus: %w", err)
	}

	var fakeCount, realCount int
	var fakeHelpers, realHelpers []domain.SosHelper

	for _, h := range helpers {
		if h.Verdict != nil {
			if *h.Verdict == "PRANK" {
				fakeCount++
				fakeHelpers = append(fakeHelpers, h)
			} else if *h.Verdict == "REAL" {
				realCount++
				realHelpers = append(realHelpers, h)
			}
		}
	}

	now := time.Now()

	// Timeout logic check (e.g. 30 mins)
	isTimeout := now.Sub(incident.CreatedAt) > 30*time.Minute

	// Consensus logic: 3 votes wins.
	if fakeCount >= 3 || (isTimeout && fakeCount > realCount) {
		return s.executeResolution(ctx, incident, domain.SosStatusResolvedFake, fakeHelpers)
	} else if realCount >= 3 || (isTimeout && realCount >= fakeCount && realCount > 0) {
		return s.executeResolution(ctx, incident, domain.SosStatusResolvedReal, realHelpers)
	} else if isTimeout && fakeCount == 0 && realCount == 0 {
		// No one reported, just close it
		incident.Status = domain.SosStatusAbandoned
		incident.UpdatedAt = now
		s.sosRepo.UpdateIncident(ctx, incident)
		// Set helpers to abandoned
		for _, h := range helpers {
			s.sosRepo.UpdateHelperStatus(ctx, incidentID, h.HelperCourierID, string(domain.SosStatusAbandoned))
		}
		return nil
	} else if isTimeout && fakeCount == realCount {
		incident.Status = domain.SosStatusDisputed
		incident.UpdatedAt = now
		s.sosRepo.UpdateIncident(ctx, incident)
		return nil
	}

	// Not enough votes yet, and not timed out
	return nil
}

func (s *DefaultSosService) CloseStaleIncidents(ctx context.Context) error {
	incidents, err := s.sosRepo.GetStaleIncidents(ctx, 30*time.Minute)
	if err != nil {
		return fmt.Errorf("failed to get stale incidents: %w", err)
	}

	for _, inc := range incidents {
		slog.InfoContext(ctx, "Closing stale SOS incident", "incident_id", inc.ID)
		if err := s.CheckAndResolveConsensus(ctx, inc.ID); err != nil {
			slog.ErrorContext(ctx, "failed to close stale SOS incident", "incident_id", inc.ID, "error", err)
		}
	}
	return nil
}

func (s *DefaultSosService) executeResolution(ctx context.Context, incident *domain.SosIncident, status domain.SosStatus, winningHelpers []domain.SosHelper) error {
	now := time.Now()
	incident.Status = status
	incident.ResolvedAt = &now
	incident.UpdatedAt = now

	if err := s.sosRepo.UpdateIncident(ctx, incident); err != nil {
		return err
	}

	if status == domain.SosStatusResolvedFake {
		// Penalty to victim: 100k
		go deductFakeSosPenalty(incident.VictimCourierID, 100000, incident.ID.String())

		// Check and apply suspend/terminate
		count, err := s.sosRepo.CountFakeSOSByVictim(ctx, incident.VictimCourierID)
		if err == nil {
			if count == 2 {
				slog.WarnContext(ctx, "Courier suspended due to 2nd fake SOS", "courier", incident.VictimCourierID)
				s.sosRepo.SuspendCourier(ctx, incident.VictimCourierID, 3*24*time.Hour)
			} else if count >= 3 {
				slog.WarnContext(ctx, "Courier terminated due to 3 or more fake SOS", "courier", incident.VictimCourierID)
				s.sosRepo.TerminateCourier(ctx, incident.VictimCourierID)
			}
		}

		// Reward winning helpers (divide 100k equally, up to 33.3k each, but maybe just 20k flat per helper as agreed)
		for _, h := range winningHelpers {
			go creditSosHelperReward(h.HelperCourierID, 20000, incident.ID.String())
			s.sosRepo.SetPriorityMultiplier(context.Background(), h.HelperCourierID, 24*time.Hour)
		}
	} else if status == domain.SosStatusResolvedReal {
		for _, h := range winningHelpers {
			s.sosRepo.SetPriorityMultiplier(context.Background(), h.HelperCourierID, 24*time.Hour)
		}
	}

	// 🚨 Send FCM to the Victim to CLEAR their local Tamper alarm
	go func() {
		victimUserID, err := s.sosRepo.GetUserIDByCourierProfileID(context.Background(), incident.VictimCourierID)
		if err == nil {
			s.sendFCMPushNotification(context.Background(), []uuid.UUID{victimUserID}, "sos_resolved", map[string]string{
				"incident_id": incident.ID.String(),
				"title":       "🚨 SOS Selesai",
				"message":     "Insiden SOS telah ditutup. Sistem peringatan dinormalkan kembali.",
			})
		}
	}()

	// MINOR-2: Notify all helpers that the case is closed
	go func() {
		allHelpers, err := s.sosRepo.GetHelpersByIncident(context.Background(), incident.ID)
		if err == nil {
			var helperUserIDs []uuid.UUID
			for _, h := range allHelpers {
				if uid, err := s.sosRepo.GetUserIDByCourierProfileID(context.Background(), h.HelperCourierID); err == nil {
					helperUserIDs = append(helperUserIDs, uid)
				}
			}
			if len(helperUserIDs) > 0 {
				s.sendFCMPushNotification(context.Background(), helperUserIDs, "sos_case_closed", map[string]string{
					"incident_id": incident.ID.String(),
					"title":       "✅ Kasus SOS Ditutup",
					"message":     "Kasus darurat telah diselesaikan, terima kasih atas respons Anda.",
				})
			}
		}
	}()

	return nil
}

func deductFakeSosPenalty(victimID uuid.UUID, amount float64, referenceID string) {
	paymentServiceURL := os.Getenv("PAYMENT_SERVICE_URL")
	if paymentServiceURL == "" {
		paymentServiceURL = "http://payment-service:8084"
	}

	payload := map[string]interface{}{
		"victim_id":    victimID,
		"amount":       amount,
		"reference_id": referenceID,
	}
	body, _ := json.Marshal(payload)

	req, _ := http.NewRequest("POST", paymentServiceURL+"/api/internal/wallet/sos-penalty", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		slog.Error("Failed to call payment service for penalty", "error", err)
		return
	}
	defer resp.Body.Close()
}

func creditSosHelperReward(helperID uuid.UUID, amount float64, referenceID string) {
	paymentServiceURL := os.Getenv("PAYMENT_SERVICE_URL")
	if paymentServiceURL == "" {
		paymentServiceURL = "http://payment-service:8084"
	}

	payload := map[string]interface{}{
		"helper_id":    helperID,
		"amount":       amount,
		"reference_id": referenceID,
	}
	body, _ := json.Marshal(payload)

	req, _ := http.NewRequest("POST", paymentServiceURL+"/api/internal/wallet/sos-reward", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		slog.Error("Failed to call payment service for reward", "error", err)
		return
	}
	defer resp.Body.Close()
}

func (s *DefaultSosService) ArriveAtSOS(ctx context.Context, req domain.SosArriveRequest) error {
	incident, err := s.sosRepo.GetIncidentByID(ctx, req.IncidentID)
	if err != nil {
		return fmt.Errorf("failed to get incident: %w", err)
	}

	if incident.Status == domain.SosStatusResolvedFake || incident.Status == domain.SosStatusResolvedReal {
		return fmt.Errorf("incident is already resolved")
	}

	// Update helper status to ARRIVED
	if err := s.sosRepo.UpdateHelperStatus(ctx, req.IncidentID, req.HelperID, "ARRIVED"); err != nil {
		slog.ErrorContext(ctx, "failed to update helper status to ARRIVED", "error", err)
	}

	// Resolve the incident
	now := time.Now()
	incident.Status = domain.SosStatusResolvedReal
	incident.ResolvedAt = &now
	incident.UpdatedAt = now

	if err := s.sosRepo.UpdateIncident(ctx, incident); err != nil {
		return fmt.Errorf("failed to resolve incident: %w", err)
	}

	// Notify Victim
	victimUserID, err := s.sosRepo.GetUserIDByCourierProfileID(context.Background(), incident.VictimCourierID)
	if err == nil {
		s.sendFCMPushNotification(context.Background(), []uuid.UUID{victimUserID}, "sos_resolved", map[string]string{
			"incident_id": incident.ID.String(),
			"message":     "Bantuan telah tiba di lokasi Anda.",
		})
	}

	// Notify other helpers that it's resolved
	allHelpers, err := s.sosRepo.GetHelpersByIncident(context.Background(), incident.ID)
	if err == nil {
		var helperUserIDs []uuid.UUID
		for _, h := range allHelpers {
			if h.HelperCourierID != req.HelperID {
				if uid, err := s.sosRepo.GetUserIDByCourierProfileID(context.Background(), h.HelperCourierID); err == nil {
					helperUserIDs = append(helperUserIDs, uid)
				}
			}
		}
		if len(helperUserIDs) > 0 {
			s.sendFCMPushNotification(context.Background(), helperUserIDs, "sos_case_closed", map[string]string{
				"incident_id": incident.ID.String(),
				"message":     "Bantuan sudah ditangani oleh kurir lain. Anda bisa kembali bekerja.",
			})
		}
	}

	return nil
}

func (s *DefaultSosService) MarkAsTampered(ctx context.Context, req domain.SosTamperRequest) error {
	incident, err := s.sosRepo.GetIncidentByID(ctx, req.IncidentID)
	if err != nil {
		return fmt.Errorf("failed to get incident: %w", err)
	}

	if incident.Status == domain.SosStatusResolvedFake || incident.Status == domain.SosStatusResolvedReal {
		return fmt.Errorf("incident is already resolved")
	}

	slog.WarnContext(ctx, "SUSPICIOUS: GPS TURNED OFF DURING SOS",
		"incident_id", req.IncidentID,
		"victim_id", req.VictimID,
	)

	err = s.sosRepo.MarkAsTampered(ctx, req.IncidentID)
	if err != nil {
		return err
	}

	// Otomatis bekukan akun selama 3 hari karena sabotase
	if err := s.sosRepo.SuspendCourier(ctx, req.VictimID, 3*24*time.Hour); err != nil {
		slog.ErrorContext(ctx, "failed to auto-suspend courier for GPS tampering", "error", err, "victim_id", req.VictimID)
	}

	return nil
}

// sendFCMPushNotification mengirim FCM data-only push notification ke satu device token
// melalui NOTIFICATION_PUSH_PROVIDER_URL (notification-service internal endpoint).
// Ini adalah fire-and-forget — dipanggil dari goroutine paralel.
func sendFCMPushNotification(deviceToken string, data map[string]string) error {
	pushURL := os.Getenv("NOTIFICATION_PUSH_PROVIDER_URL")
	if pushURL == "" {
		return fmt.Errorf("NOTIFICATION_PUSH_PROVIDER_URL tidak dikonfigurasi di environment")
	}

	payload := map[string]interface{}{
		"device_token": deviceToken,
		"data":         data,
		"priority":     "high",
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("gagal encode FCM payload: %w", err)
	}

	req, err := http.NewRequest(http.MethodPost, pushURL+"/internal/push", bytes.NewBuffer(body))
	if err != nil {
		return fmt.Errorf("gagal membuat HTTP request ke push provider: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	pushToken := os.Getenv("NOTIFICATION_PUSH_PROVIDER_TOKEN")
	if pushToken != "" {
		req.Header.Set("Authorization", "Bearer "+pushToken)
	}

	client := &http.Client{Timeout: 8 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("FCM provider HTTP error: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("FCM provider menolak request, status: %d", resp.StatusCode)
	}
	return nil
}

func (s *DefaultSosService) sendFCMPushNotification(ctx context.Context, userIDs []uuid.UUID, pushType string, data map[string]string) {
	if data == nil {
		data = make(map[string]string)
	}
	data["type"] = pushType

	tokensMap, err := s.sosRepo.GetFCMTokensByUserIDs(ctx, userIDs)
	if err != nil {
		slog.ErrorContext(ctx, "failed to get FCM tokens for push notification", "error", err)
		return
	}

	for _, tokens := range tokensMap {
		for _, token := range tokens {
			go func(t string) {
				if err := sendFCMPushNotification(t, data); err != nil {
					slog.WarnContext(ctx, "failed to send FCM push notification", "token", t, "error", err)
				}
			}(token)
		}
	}
}

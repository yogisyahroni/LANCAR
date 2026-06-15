package main

import (
	"log"
	"net/http"

	"tembus/order-service/internal/handler"
	"tembus/order-service/internal/middleware"
)

func main() {
	mux := http.NewServeMux()

	// Health
	mux.HandleFunc("/health", middleware.BaseChain(func(w http.ResponseWriter, r *http.Request) {
		middleware.WriteSuccess(w, http.StatusOK, map[string]string{"service": "order-service", "status": "ok"})
	}))

	orderHandler := handler.NewOrderHandler(nil, nil, nil)
	paymentHandler := handler.NewPaymentHandler(nil)
	trackingHandler := handler.NewTrackingHandler(nil)
	notificationHandler := handler.NewNotificationHandler(nil)
	relayHandler := handler.NewRelayHandler(nil)
	adminHandler := handler.NewAdminHandler(nil, nil)
	payoutHandler := handler.NewPayoutHandler(nil)
	insuranceHandler := handler.NewInsuranceHandler(nil)
	slaHandler := handler.NewSLAHandler(nil)
	analyticsHandler := handler.NewAnalyticsHandler(nil)
	refundHandler := handler.NewRefundHandler(nil)

	// Public-ish routes (build will validate when services are wired)
	mux.HandleFunc("/api/v1/pricing/estimate", middleware.BaseChain(middleware.ValidateBody(map[string]string{})(orderHandler.Estimate)))
	mux.HandleFunc("/api/v1/orders/detail", middleware.BaseChain(middleware.AuthMiddleware(orderHandler.GetOrder)))
	mux.HandleFunc("/api/v1/orders/poll", middleware.BaseChain(middleware.AuthMiddleware(orderHandler.PollOrderUpdates)))
	mux.HandleFunc("/api/v1/meeting-points/suggest", middleware.BaseChain(middleware.AuthMiddleware(orderHandler.SuggestMeetingPoints)))
	mux.HandleFunc("/api/v1/couriers/orders/accept", middleware.BaseChain(middleware.AuthMiddleware(orderHandler.AcceptOrder)))
	mux.HandleFunc("/api/v1/orders/status", middleware.BaseChain(middleware.AuthMiddleware(orderHandler.UpdateStatus)))
	mux.HandleFunc("/api/v1/tracking/location", middleware.BaseChain(middleware.AuthMiddleware(trackingHandler.UpdateLocation)))
	mux.HandleFunc("/api/v1/tracking/sync", middleware.BaseChain(middleware.AuthMiddleware(trackingHandler.SyncLocations)))
	mux.HandleFunc("/api/v1/tracking/public", middleware.BaseChain(trackingHandler.GetPublicTracking))
	mux.HandleFunc("/api/v1/tracking/", middleware.BaseChain(trackingHandler.GetTracking))
	mux.HandleFunc("/api/v1/notifications/inbox", middleware.BaseChain(middleware.AuthMiddleware(notificationHandler.GetInbox)))
	mux.HandleFunc("/api/v1/notifications/", middleware.BaseChain(notificationHandler.MarkAsRead))
	mux.HandleFunc("/api/v1/insurance/enroll-bpjs", middleware.BaseChain(middleware.AuthMiddleware(insuranceHandler.EnrollBPJSTK)))
	mux.HandleFunc("/api/v1/admin/relay-score/override", middleware.BaseChain(middleware.AuthMiddleware(relayHandler.AdminOverrideScore)))
	mux.HandleFunc("/api/v1/couriers/me/earnings", middleware.BaseChain(middleware.AuthMiddleware(payoutHandler.GetCourierEarnings)))
	mux.HandleFunc("/api/v1/payments/create", middleware.BaseChain(middleware.AuthMiddleware(paymentHandler.CreatePayment)))
	mux.HandleFunc("/api/v1/payments/", middleware.BaseChain(middleware.AuthMiddleware(paymentHandler.GetPaymentStatus)))
	mux.HandleFunc("/api/v1/payments/webhook", middleware.BaseChain(paymentHandler.HandleWebhook))
	mux.HandleFunc("/api/v1/admin/meeting-points", middleware.BaseChain(middleware.AuthMiddleware(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			adminHandler.CreateMeetingPoint(w, r)
		} else if r.Method == http.MethodGet {
			adminHandler.GetMeetingPointAnalytics(w, r)
		}
	})))
	mux.HandleFunc("/api/v1/admin/meeting-points/", middleware.BaseChain(middleware.AuthMiddleware(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPut || r.Method == http.MethodPatch {
			adminHandler.UpdateMeetingPoint(w, r)
		} else if r.Method == http.MethodDelete {
			adminHandler.DeleteMeetingPoint(w, r)
		}
	})))
	mux.HandleFunc("/api/v1/admin/payouts/trigger", middleware.BaseChain(middleware.AuthMiddleware(payoutHandler.TriggerBatchPayout)))
	mux.HandleFunc("/api/v1/admin/refunds", middleware.BaseChain(middleware.AuthMiddleware(refundHandler.CreateRefund)))
	mux.HandleFunc("/api/v1/admin/sla/dashboard", middleware.BaseChain(middleware.AuthMiddleware(slaHandler.GetDashboard)))
	mux.HandleFunc("/api/v1/admin/analytics/dashboard", middleware.BaseChain(middleware.AuthMiddleware(analyticsHandler.GetDashboardMetrics)))
	mux.HandleFunc("/api/v1/admin/analytics/reports", middleware.BaseChain(middleware.AuthMiddleware(analyticsHandler.GetReport)))
	mux.HandleFunc("/api/v1/admin/analytics/refresh", middleware.BaseChain(middleware.AuthMiddleware(analyticsHandler.RefreshData)))
	mux.HandleFunc("/api/v1/admin/pricing/config", middleware.BaseChain(middleware.AuthMiddleware(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			adminHandler.GetPricingConfig(w, r)
		} else if r.Method == http.MethodPut || r.Method == http.MethodPatch {
			adminHandler.UpdatePricingConfig(w, r)
		}
	})))
	mux.HandleFunc("/api/v1/admin/pricing/simulate", middleware.BaseChain(middleware.AuthMiddleware(adminHandler.SimulatePrice)))

	log.Println("order-service starting on :8080")
	if err := http.ListenAndServe(":8080", mux); err != nil {
		log.Fatal(err)
	}
}

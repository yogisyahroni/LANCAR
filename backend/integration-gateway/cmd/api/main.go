package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/joho/godotenv"
	"tembus/integration-gateway/internal/domain"
	"tembus/integration-gateway/internal/handler"
	"tembus/integration-gateway/internal/provider"
)

func main() {
	// Load environment variables
	err := godotenv.Load("../../.env")
	if err != nil {
		log.Println("No .env file found, using system environment variables")
	}

	// ─────────────────────────────────────────────
	// Provider Setup
	// ─────────────────────────────────────────────
	otpProv, err := provider.NewOTPProvider("")
	if err != nil {
		log.Fatalf("[integration-gateway] failed to init OTP Provider: %v", err)
	}
	log.Println("[integration-gateway] OTP provider initialized successfully")

	mapsProv, err := provider.NewMapsProvider("")
	if err != nil {
		log.Fatalf("[integration-gateway] failed to init Maps Provider: %v", err)
	}
	log.Println("[integration-gateway] Maps provider initialized successfully")

	jneProv := provider.NewJNEProvider()
	jntProv := provider.NewJNTProvider()
	logisticsRegistry := provider.NewLogisticsProviderRegistry()
	logisticsRegistry.Register(domain.ProviderRegistration{
		Descriptor: domain.ProviderDescriptor{
			Code: "jne", Name: "JNE Express",
			Capabilities: []domain.LogisticsCapability{domain.CapabilityTariff, domain.CapabilityShipment, domain.CapabilityTracking},
		},
		Tariff: jneProv, Shipment: jneProv, Tracking: jneProv,
	})
	logisticsRegistry.Register(domain.ProviderRegistration{
		Descriptor: domain.ProviderDescriptor{
			Code: "jnt", Name: "J&T Express",
			Capabilities: []domain.LogisticsCapability{domain.CapabilityTariff, domain.CapabilityShipment, domain.CapabilityTracking},
		},
		Tariff: jntProv, Shipment: jntProv, Tracking: jntProv,
	})
	log.Println("[integration-gateway] Logistics 3PL providers initialized successfully")

	// ─────────────────────────────────────────────
	// Handlers & Router Setup
	// ─────────────────────────────────────────────
	mux := http.NewServeMux()

	// Middleware for Internal API Key (Simple authentication between microservices)
	authMiddleware := func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			expectedKey := os.Getenv("INTERNAL_API_KEY")
			if expectedKey != "" {
				providedKey := r.Header.Get("X-Internal-Api-Key")
				if providedKey != expectedKey {
					http.Error(w, "Unauthorized internal request", http.StatusUnauthorized)
					return
				}
			}
			next.ServeHTTP(w, r)
		})
	}

	otpHandler := handler.NewOTPHandler(otpProv)
	paymentHandler := handler.NewPaymentHandler()
	mapsHandler := handler.NewMapsHandler(mapsProv)
	logisticsHandler := handler.NewLogisticsHandler(logisticsRegistry)
	trackingWebhookHandler := handler.NewTrackingWebhookHandler()

	// Routes
	mux.Handle("/api/internal/otp/send-wa", authMiddleware(http.HandlerFunc(otpHandler.SendWA)))
	mux.Handle("/api/internal/otp/send-sms", authMiddleware(http.HandlerFunc(otpHandler.SendSMS)))

	mux.Handle("/api/internal/payment/invoice", authMiddleware(http.HandlerFunc(paymentHandler.CreateInvoice)))
	mux.Handle("/api/internal/payment/disburse", authMiddleware(http.HandlerFunc(paymentHandler.CreateDisbursement)))

	mux.Handle("/api/internal/maps/distance-matrix", authMiddleware(http.HandlerFunc(mapsHandler.GetDistanceMatrix)))
	mux.Handle("/api/internal/maps/optimize-waypoints", authMiddleware(http.HandlerFunc(mapsHandler.OptimizeWaypoints)))

	mux.Handle("/api/internal/logistics/create-order", authMiddleware(http.HandlerFunc(logisticsHandler.CreateOrder)))
	mux.Handle("/api/internal/logistics/tariff", authMiddleware(http.HandlerFunc(logisticsHandler.CheckTariff)))
	mux.Handle("/api/internal/logistics/providers", authMiddleware(http.HandlerFunc(logisticsHandler.ListProviders)))

	// Webhook dari 3PL eksternal (verifikasi signature di dalam handler)
	mux.HandleFunc("/api/v1/logistics/webhook", trackingWebhookHandler.HandleProviderWebhook)
	mux.HandleFunc("/api/v1/logistics/webhook/", trackingWebhookHandler.HandleProviderWebhook)

	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	})

	// ─────────────────────────────────────────────
	// Server Start
	// ─────────────────────────────────────────────
	port := os.Getenv("INTEGRATION_GATEWAY_PORT")
	if port == "" {
		port = "8085"
	}

	srv := &http.Server{
		Addr:         ":" + port,
		Handler:      mux,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Graceful shutdown channel
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, os.Interrupt, syscall.SIGTERM)

	go func() {
		log.Printf("[integration-gateway] Server listening on port %s", port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("[integration-gateway] listen err: %v", err)
		}
	}()

	<-quit
	log.Println("[integration-gateway] Shutting down gracefully...")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		log.Fatalf("[integration-gateway] Server forced to shutdown: %v", err)
	}

	log.Println("[integration-gateway] Exited properly")
}

package main

import (
	"database/sql"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	_ "github.com/lib/pq"
	"tembus/ads-service/internal/auth"
	"tembus/ads-service/internal/handler"
	"tembus/ads-service/internal/repository"
	"tembus/ads-service/internal/service"
)

func main() {
	if len(os.Args) > 1 && os.Args[1] == "--healthcheck" {
		resp, err := http.Get("http://127.0.0.1:8091/health")
		if err != nil || resp.StatusCode != http.StatusOK {
			if resp != nil {
				_ = resp.Body.Close()
			}
			os.Exit(1)
		}
		_ = resp.Body.Close()
		return
	}
	databaseURL := strings.TrimSpace(os.Getenv("DATABASE_URL"))
	if databaseURL == "" {
		log.Fatal("DATABASE_URL is required")
	}
	db, err := sql.Open("postgres", databaseURL)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()
	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(5 * time.Minute)
	if err := db.Ping(); err != nil {
		log.Fatal("Ads database is unreachable: ", err)
	}

	repo := repository.NewPostgresRepository(db)
	campaigns := service.NewCampaignService(repo)
	secret := os.Getenv("ADS_DELIVERY_SIGNING_KEY")
	if len(secret) < 32 {
		log.Fatal("ADS_DELIVERY_SIGNING_KEY must be at least 32 characters")
	}
	internalGatewaySecret := strings.TrimSpace(os.Getenv("INTERNAL_GATEWAY_SECRET"))
	if len(internalGatewaySecret) < 32 {
		log.Fatal("INTERNAL_GATEWAY_SECRET must be at least 32 characters")
	}
	orderEventSecret := strings.TrimSpace(os.Getenv("ADS_ORDER_EVENT_SECRET"))
	if len(orderEventSecret) < 32 {
		log.Fatal("ADS_ORDER_EVENT_SECRET must be at least 32 characters")
	}
	delivery := service.NewDeliveryService(repo, secret)
	h := handler.NewAdsHandler(campaigns, delivery, repo, orderEventSecret)
	mux := http.NewServeMux()
	mux.HandleFunc("/health", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"status":"ok","service":"ads-service"}`))
	})
	mux.HandleFunc("/ready", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"status":"ready","service":"ads-service"}`))
	})
	mux.HandleFunc("/api/v1/merchant/ads", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			h.CreateCampaign(w, r)
			return
		}
		if r.Method == http.MethodGet {
			h.ListMerchantCampaigns(w, r)
			return
		}
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	})
	mux.HandleFunc("/api/v1/merchant/ads/{id}/lifecycle", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			h.Transition(w, r)
			return
		}
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	})
	mux.HandleFunc("/api/v1/merchant/ads/{id}/active", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			h.SetActive(w, r)
			return
		}
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	})
	mux.HandleFunc("/api/v1/merchant/ads/performance", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			h.MerchantPerformance(w, r)
			return
		}
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	})
	mux.HandleFunc("/api/v1/merchant/ads/{id}/clone", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			h.Clone(w, r)
			return
		}
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	})
	mux.HandleFunc("/api/v1/ads/placements/{placement}", h.Placement)
	mux.HandleFunc("/api/v1/ads/{event}", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost && (r.PathValue("event") == "impressions" || r.PathValue("event") == "clicks") {
			if r.PathValue("event") == "impressions" {
				r.SetPathValue("event", "impression")
			} else {
				r.SetPathValue("event", "click")
			}
			h.Event(w, r)
			return
		}
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	})
	mux.HandleFunc("/api/v1/ads/experiments/exposures", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			h.ExperimentExposure(w, r)
			return
		}
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	})
	mux.HandleFunc("/internal/v1/ads/conversions", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			h.ServerConversion(w, r)
			return
		}
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	})
	mux.HandleFunc("/api/v1/admin/ads/campaigns", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			h.AdminCampaigns(w, r)
			return
		}
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	})
	mux.HandleFunc("/api/v1/admin/ads/campaigns/{id}/suspend", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			h.AdminSuspend(w, r)
			return
		}
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	})
	mux.HandleFunc("/api/v1/admin/ads/campaigns/{id}/moderation", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			h.AdminModerate(w, r)
			return
		}
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	})
	mux.HandleFunc("/api/v1/admin/ads/campaigns/{id}/billing-adjustment", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			h.AdminBillingAdjustment(w, r)
			return
		}
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	})
	mux.HandleFunc("/api/v1/admin/ads/policy/proposals", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			h.AdminPolicyProposal(w, r)
			return
		}
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	})
	mux.HandleFunc("/api/v1/admin/ads/debug", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			h.AdminDebug(w, r)
			return
		}
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	})
	mux.HandleFunc("/api/v1/admin/ads/inventory", h.Inventory)
	mux.HandleFunc("/api/v1/admin/ads/audit", h.Audit)
	port := os.Getenv("ADS_SERVICE_PORT")
	if port == "" {
		port = "8091"
	}
	server := &http.Server{Addr: ":" + port, Handler: withRequestTimeout(auth.RequireGatewayAuth(internalGatewaySecret, mux)), ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 10 * time.Second, WriteTimeout: 15 * time.Second, IdleTimeout: 60 * time.Second}
	log.Printf("ads-service listening on %s", server.Addr)
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatal(err)
	}
}

func withRequestTimeout(next http.Handler) http.Handler {
	return http.TimeoutHandler(next, 2*time.Second, `{"status":"error","error":"ads request timeout; use organic fallback"}`)
}

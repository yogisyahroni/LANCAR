package main

import (
	"database/sql"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	_ "github.com/lib/pq"
	"tembus/search-service/internal/auth"
	"tembus/search-service/internal/handler"
	"tembus/search-service/internal/repository"
)

func main() {
	if len(os.Args) > 1 && os.Args[1] == "--healthcheck" {
		resp, err := http.Get("http://127.0.0.1:8092/health")
		if err != nil || resp.StatusCode != 200 {
			os.Exit(1)
		}
		_ = resp.Body.Close()
		return
	}
	url := strings.TrimSpace(os.Getenv("DATABASE_URL"))
	if url == "" {
		log.Fatal("DATABASE_URL is required")
	}
	db, err := sql.Open("postgres", url)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()
	db.SetMaxOpenConns(20)
	db.SetMaxIdleConns(5)
	if err := db.Ping(); err != nil {
		log.Fatal("Search database is unreachable: ", err)
	}
	h := handler.New(repository.New(db))
	mux := http.NewServeMux()
	mux.HandleFunc("/health", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"status":"ok","service":"search-service"}`))
	})
	mux.HandleFunc("/ready", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"status":"ready","service":"search-service"}`))
	})
	mux.HandleFunc("/api/v1/search", h.Search)
	mux.HandleFunc("/api/v1/search/autocomplete", h.Autocomplete)
	mux.HandleFunc("/api/v1/search/history", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodDelete {
			h.ClearHistory(w, r)
		} else {
			h.History(w, r)
		}
	})
	mux.HandleFunc("/internal/v1/search/index-events", h.IndexEvent)
	mux.HandleFunc("/internal/v1/search/rebuild", h.Rebuild)
	mux.HandleFunc("/api/v1/admin/search/synonyms", h.Synonyms)
	mux.HandleFunc("/api/v1/admin/search/merchandising", h.Merchandising)
	mux.HandleFunc("/api/v1/admin/search/quality", h.Quality)
	mux.HandleFunc("/api/v1/admin/search/rebuild", h.Rebuild)
	secret := os.Getenv("INTERNAL_GATEWAY_SECRET")
	port := os.Getenv("SEARCH_SERVICE_PORT")
	if port == "" {
		port = "8092"
	}
	srv := &http.Server{Addr: ":" + port, Handler: auth.RequireGatewayAuth(secret, db, mux), ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 10 * time.Second, WriteTimeout: 15 * time.Second, IdleTimeout: 60 * time.Second}
	log.Printf("search-service listening on %s", srv.Addr)
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatal(err)
	}
}

package middleware

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/jmoiron/sqlx"
	_ "github.com/lib/pq"
)

// This test uses an isolated PostgreSQL database when
// TEMBUS_ORDER_SERVICE_TEST_DATABASE_URL is configured. It verifies the
// actual cross-request reservation, rather than a process-local mutex.
func TestRequireIdempotencyKeyParallelCreateRunsHandlerOnce(t *testing.T) {
	dsn := os.Getenv("TEMBUS_ORDER_SERVICE_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEMBUS_ORDER_SERVICE_TEST_DATABASE_URL is not configured")
	}
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		t.Fatalf("open postgres: %v", err)
	}
	defer db.Close()
	if err := db.PingContext(context.Background()); err != nil {
		t.Fatalf("ping postgres: %v", err)
	}

	sqlxDB := sqlx.NewDb(db, "postgres")
	scope := "qa.parallel.create"
	actor := "qa-parallel-create-user"
	key := "qa-parallel-create-" + time.Now().UTC().Format("20060102150405.000000000")
	defer func() {
		_, _ = db.Exec(`DELETE FROM api_idempotency_keys WHERE scope = $1 AND actor_key = $2 AND idempotency_key = $3`, scope, actor, key)
	}()

	var handlerCalls atomic.Int32
	handler := RequireIdempotencyKey(sqlxDB, scope, func(w http.ResponseWriter, _ *http.Request) {
		if handlerCalls.Add(1) != 1 {
			t.Errorf("parallel idempotency reservation allowed duplicate handler execution")
		}
		time.Sleep(100 * time.Millisecond)
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte(`{"order_id":"parallel-order"}`))
	})

	ctx := context.WithValue(context.Background(), UserIDKey, actor)
	start := make(chan struct{})
	const parallelAttempts = 10
	responses := make(chan int, parallelAttempts)
	var wg sync.WaitGroup
	for i := 0; i < parallelAttempts; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			req := httptest.NewRequest(http.MethodPost, "/orders", strings.NewReader(`{"estimate_id":"parallel"}`)).WithContext(ctx)
			req.Header.Set("X-Idempotency-Key", key)
			res := httptest.NewRecorder()
			handler(res, req)
			responses <- res.Code
		}()
	}
	close(start)
	wg.Wait()
	close(responses)

	if handlerCalls.Load() != 1 {
		t.Fatalf("parallel create handler calls = %d, want 1", handlerCalls.Load())
	}
	createdOrConflict := 0
	for status := range responses {
		if status != http.StatusCreated && status != http.StatusConflict {
			t.Fatalf("parallel create returned unexpected status %d", status)
		}
		createdOrConflict++
	}
	if createdOrConflict != parallelAttempts {
		t.Fatalf("parallel response count = %d, want %d", createdOrConflict, parallelAttempts)
	}

	var reservationCount int
	if err := db.QueryRowContext(context.Background(), `
		SELECT COUNT(*) FROM api_idempotency_keys
		WHERE scope = $1 AND actor_key = $2 AND idempotency_key = $3`, scope, actor, key).Scan(&reservationCount); err != nil {
		t.Fatalf("count persisted idempotency reservation: %v", err)
	}
	if reservationCount != 1 {
		t.Fatalf("persisted idempotency reservations = %d, want 1", reservationCount)
	}

	// A retry after the winner completes must replay the persisted response
	// without invoking the create handler a second time.
	replayReq := httptest.NewRequest(http.MethodPost, "/orders", strings.NewReader(`{"estimate_id":"parallel"}`)).WithContext(ctx)
	replayReq.Header.Set("X-Idempotency-Key", key)
	replayRes := httptest.NewRecorder()
	handler(replayRes, replayReq)
	var replayBody struct {
		OrderID string `json:"order_id"`
	}
	if err := json.Unmarshal(replayRes.Body.Bytes(), &replayBody); err != nil {
		t.Fatalf("decode replay response: %v", err)
	}
	if replayRes.Code != http.StatusCreated || replayBody.OrderID != "parallel-order" {
		t.Fatalf("replay response = %d %q, want 201 and original order", replayRes.Code, replayRes.Body.String())
	}
	if handlerCalls.Load() != 1 {
		t.Fatalf("replay invoked create handler; calls = %d, want 1", handlerCalls.Load())
	}
}

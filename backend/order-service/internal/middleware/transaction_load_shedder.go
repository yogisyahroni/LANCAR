package middleware

import (
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync/atomic"
)

const defaultTransactionalInFlight = 64

// TransactionLoadShedder bounds concurrent mutating requests per service
// instance. It deliberately fails fast instead of queueing unbounded work so
// the database pool and authoritative state transitions remain protected.
type TransactionLoadShedder struct {
	limit    int64
	inFlight atomic.Int64
}

func NewTransactionLoadShedder(limit int) *TransactionLoadShedder {
	if limit < 1 {
		limit = defaultTransactionalInFlight
	}
	return &TransactionLoadShedder{limit: int64(limit)}
}

// NewTransactionLoadShedderFromEnv reads TRANSACTION_MAX_INFLIGHT. The
// default is intentionally conservative and should be raised only with a
// measured database/queue capacity result.
func NewTransactionLoadShedderFromEnv() *TransactionLoadShedder {
	limit, err := strconv.Atoi(strings.TrimSpace(os.Getenv("TRANSACTION_MAX_INFLIGHT")))
	if err != nil || limit < 1 {
		limit = defaultTransactionalInFlight
	}
	return NewTransactionLoadShedder(limit)
}

func (s *TransactionLoadShedder) Limit() int {
	return int(s.limit)
}

func (s *TransactionLoadShedder) InFlight() int {
	return int(s.inFlight.Load())
}

// TryAcquire reserves one mutating request slot without waiting.
func (s *TransactionLoadShedder) TryAcquire() bool {
	for {
		current := s.inFlight.Load()
		if current >= s.limit {
			return false
		}
		if s.inFlight.CompareAndSwap(current, current+1) {
			return true
		}
	}
}

func (s *TransactionLoadShedder) Release() {
	for {
		current := s.inFlight.Load()
		if current <= 0 {
			return
		}
		if s.inFlight.CompareAndSwap(current, current-1) {
			return
		}
	}
}

// Wrap protects mutating HTTP requests while allowing quotes, reads, health
// probes, and other non-authoritative requests to remain available. The
// allowlist of transactional prefixes is intentionally explicit so a new
// write path cannot silently bypass this guard.
func (s *TransactionLoadShedder) Wrap(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		transactional := isTransactionalWrite(r)
		if !transactional {
			next.ServeHTTP(w, r)
			return
		}
		if s.TryAcquire() {
			defer s.Release()
			next.ServeHTTP(w, r)
			return
		}

		correlationID := r.Header.Get(correlationIDHeader)
		if correlationID == "" {
			correlationID = generateCorrelationID()
		}
		w.Header().Set(correlationIDHeader, correlationID)
		w.Header().Set("Retry-After", "1")
		w.Header().Set("X-Load-Shed", "transaction-capacity")
		WriteError(w, http.StatusServiceUnavailable, "ERR_TRANSACTION_LOAD_SHED",
			"Transactional capacity is temporarily full. Please retry shortly.", correlationID)
		LogJSON("warn", "transaction request load shed", structuredLogEvent{
			"correlation_id": correlationID,
			"method":         r.Method,
			"path":           r.URL.Path,
			"limit":          s.Limit(),
			"in_flight":      s.InFlight(),
			"reason":         "transaction_capacity",
		})
	})
}

func isTransactionalWrite(r *http.Request) bool {
	switch r.Method {
	case http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete:
	default:
		return false
	}

	path := strings.ToLower(r.URL.Path)
	for _, prefix := range []string{
		"/api/v1/orders",
		"/api/v1/payments",
		"/api/v1/payment-links",
		"/api/v1/internal/",
		"/api/v1/food/",
		"/api/v1/courier/",
		"/api/v1/couriers/",
		"/api/v1/customer/",
		"/api/v1/experiments/",
		"/api/v1/device-tokens",
		"/api/v1/products",
		"/api/v1/logistics/",
		"/api/v1/admin/",
	} {
		if strings.HasPrefix(path, prefix) {
			return !isReadLikeMutation(path)
		}
	}
	return false
}

func isReadLikeMutation(path string) bool {
	for _, marker := range []string{"/quote", "/estimate", "/calculate", "/simulate", "/suggest", "/validate", "/check", "/poll", "/search", "/preview", "/dashboard", "/reports"} {
		if strings.Contains(path, marker) {
			return true
		}
	}
	return false
}

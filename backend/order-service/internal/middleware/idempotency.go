package middleware

import (
	"bytes"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/jmoiron/sqlx"
)

const idempotencyTTL = 7 * 24 * time.Hour

// RequireIdempotencyKey reserves one user intent before running a mutating
// handler and persists its response for safe retries. The reservation is
// deliberately backed by Postgres rather than process memory so multiple
// order-service replicas share the same replay/conflict semantics.
func RequireIdempotencyKey(db *sqlx.DB, scope string, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		key := strings.TrimSpace(r.Header.Get("X-Idempotency-Key"))
		if key == "" {
			key = strings.TrimSpace(r.Header.Get("Idempotency-Key"))
		}
		if len(key) < 12 || len(key) > 160 {
			WriteError(w, http.StatusBadRequest, "ERR_IDEMPOTENCY_KEY_REQUIRED", "Idempotency key wajib diisi dan panjangnya harus 12-160 karakter", GetCorrelationID(r.Context()))
			return
		}

		bodyReader := r.Body
		if bodyReader == nil {
			bodyReader = http.NoBody
		}
		body, err := io.ReadAll(bodyReader)
		if err != nil {
			WriteError(w, http.StatusBadRequest, "ERR_INVALID_REQUEST_BODY", "Request body tidak dapat dibaca", GetCorrelationID(r.Context()))
			return
		}
		r.Body = io.NopCloser(bytes.NewReader(body))
		requestHash := hashBytes(body)
		actorKey := GetUserIDFromContext(r.Context())
		if actorKey == "" {
			actorKey = "ip:" + realIP(r)
		}

		if db == nil {
			WriteError(w, http.StatusServiceUnavailable, "ERR_IDEMPOTENCY_UNAVAILABLE", "Proteksi idempotency sedang tidak tersedia", GetCorrelationID(r.Context()))
			return
		}

		reservationID, err := reserveIdempotency(r.Context(), db, scope, actorKey, key, requestHash)
		if err != nil {
			if !errors.Is(err, sql.ErrNoRows) {
				WriteError(w, http.StatusServiceUnavailable, "ERR_IDEMPOTENCY_UNAVAILABLE", "Proteksi idempotency sedang tidak tersedia", GetCorrelationID(r.Context()))
				return
			}
			replay, replayErr := replayIdempotency(r.Context(), db, scope, actorKey, key, requestHash, w)
			if replayErr == nil && replay {
				return
			}
			if replayErr != nil && !errors.Is(replayErr, sql.ErrNoRows) {
				WriteError(w, http.StatusServiceUnavailable, "ERR_IDEMPOTENCY_UNAVAILABLE", "Proteksi idempotency sedang tidak tersedia", GetCorrelationID(r.Context()))
				return
			}
			WriteError(w, http.StatusConflict, "ERR_IDEMPOTENCY_CONFLICT", "Idempotency key sudah digunakan untuk payload berbeda atau request masih diproses", GetCorrelationID(r.Context()))
			return
		}

		capture := newIdempotentResponseWriter(w)
		next(capture, r)
		persistIdempotencyResponse(r.Context(), db, reservationID, capture.statusCode, capture.body.Bytes())
	}
}

func reserveIdempotency(ctx context.Context, db *sqlx.DB, scope, actorKey, key, requestHash string) (string, error) {
	var id string
	err := db.QueryRowContext(ctx, `
		INSERT INTO api_idempotency_keys
		  (scope, actor_key, actor_type, idempotency_key, request_hash, locked_until)
		VALUES ($1, $2, 'user', $3, $4, NOW() + $5::interval)
		ON CONFLICT (scope, actor_key, idempotency_key) DO NOTHING
		RETURNING id`, scope, actorKey, key, requestHash, idempotencyTTL.String()).Scan(&id)
	if err == nil {
		return id, nil
	}
	return "", err
}

func replayIdempotency(ctx context.Context, db *sqlx.DB, scope, actorKey, key, requestHash string, w http.ResponseWriter) (bool, error) {
	var storedHash, state string
	var statusCode sql.NullInt64
	var responseBody []byte
	var lockedUntil time.Time
	err := db.QueryRowContext(ctx, `
		SELECT request_hash, state, status_code, response_body, locked_until
		FROM api_idempotency_keys
		WHERE scope = $1 AND actor_key = $2 AND idempotency_key = $3`, scope, actorKey, key).
		Scan(&storedHash, &state, &statusCode, &responseBody, &lockedUntil)
	if err != nil {
		return false, err
	}
	if storedHash != requestHash {
		return false, sql.ErrNoRows
	}
	if state != "completed" || !statusCode.Valid || len(responseBody) == 0 {
		if state == "processing" && lockedUntil.After(time.Now()) {
			return false, sql.ErrNoRows
		}
		return false, sql.ErrNoRows
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(int(statusCode.Int64))
	_, err = w.Write(responseBody)
	return true, err
}

func persistIdempotencyResponse(ctx context.Context, db *sqlx.DB, reservationID string, statusCode int, body []byte) {
	responseBody := json.RawMessage(body)
	if !json.Valid(body) {
		responseBody, _ = json.Marshal(string(body))
	}
	state := "completed"
	if statusCode >= http.StatusInternalServerError {
		state = "failed"
	}
	_, _ = db.ExecContext(ctx, `
		UPDATE api_idempotency_keys
		SET state = $2, status_code = $3, response_hash = $4,
		    response_body = $5::jsonb, locked_until = NOW(), updated_at = NOW()
		WHERE id = $1`, reservationID, state, statusCode, hashBytes(body), responseBody)
}

func hashBytes(value []byte) string {
	sum := sha256.Sum256(value)
	return hex.EncodeToString(sum[:])
}

type idempotentResponseWriter struct {
	http.ResponseWriter
	body       bytes.Buffer
	statusCode int
}

func newIdempotentResponseWriter(w http.ResponseWriter) *idempotentResponseWriter {
	return &idempotentResponseWriter{ResponseWriter: w, statusCode: http.StatusOK}
}

func (w *idempotentResponseWriter) WriteHeader(code int) {
	if w.statusCode != http.StatusOK {
		return
	}
	w.statusCode = code
	w.ResponseWriter.WriteHeader(code)
}

func (w *idempotentResponseWriter) Write(body []byte) (int, error) {
	if w.statusCode == http.StatusOK {
		w.WriteHeader(http.StatusOK)
	}
	_, _ = w.body.Write(body)
	return w.ResponseWriter.Write(body)
}

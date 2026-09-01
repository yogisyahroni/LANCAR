package middleware

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/jmoiron/sqlx"
)

func TestRequireIdempotencyKeyRejectsMissingKey(t *testing.T) {
	handler := RequireIdempotencyKey(nil, "order.create", func(http.ResponseWriter, *http.Request) {
		t.Fatal("handler must not run without an idempotency key")
	})
	req := httptest.NewRequest(http.MethodPost, "/orders", strings.NewReader(`{"name":"one"}`))
	res := httptest.NewRecorder()

	handler(res, req)

	if res.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", res.Code, http.StatusBadRequest)
	}
}

func TestRequireIdempotencyKeyFailsClosedWhenStoreUnavailable(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	sqlxDB := sqlx.NewDb(db, "postgres")
	mock.ExpectQuery(`INSERT INTO api_idempotency_keys`).
		WithArgs("order.create", "ip:192.0.2.1:1234", "key-unavailable-1", sqlmock.AnyArg(), "168h0m0s").
		WillReturnError(errors.New("database unavailable"))

	handler := RequireIdempotencyKey(sqlxDB, "order.create", func(http.ResponseWriter, *http.Request) {
		t.Fatal("handler must not run when idempotency store is unavailable")
	})
	req := httptest.NewRequest(http.MethodPost, "/orders", strings.NewReader(`{"name":"one"}`))
	req.Header.Set("X-Idempotency-Key", "key-unavailable-1")
	res := httptest.NewRecorder()
	handler(res, req)

	if res.Code != http.StatusServiceUnavailable || !strings.Contains(res.Body.String(), "ERR_IDEMPOTENCY_UNAVAILABLE") {
		t.Fatalf("unavailable response = %d %q", res.Code, res.Body.String())
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestRequireIdempotencyKeyPersistsAndReplaysResponse(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	sqlxDB := sqlx.NewDb(db, "sqlmock")
	body := `{"name":"one"}`
	hash := sha256.Sum256([]byte(body))
	hashText := hex.EncodeToString(hash[:])
	ctx := context.WithValue(context.Background(), UserIDKey, "user-1")

	insertPattern := `INSERT INTO api_idempotency_keys`
	mock.ExpectQuery(insertPattern).
		WithArgs("order.create", "user-1", "key-123456789", hashText, "168h0m0s").
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow("reservation-1"))
	mock.ExpectExec(`UPDATE api_idempotency_keys`).
		WithArgs("reservation-1", "completed", 201, sqlmock.AnyArg(), sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(0, 1))

	first := RequireIdempotencyKey(sqlxDB, "order.create", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte(body))
	})
	firstReq := httptest.NewRequest(http.MethodPost, "/orders", strings.NewReader(body)).WithContext(ctx)
	firstReq.Header.Set("X-Idempotency-Key", "key-123456789")
	firstRes := httptest.NewRecorder()
	first(firstRes, firstReq)
	if firstRes.Code != http.StatusCreated || firstRes.Body.String() != body {
		t.Fatalf("first response = %d %q", firstRes.Code, firstRes.Body.String())
	}

	mock.ExpectQuery(insertPattern).WillReturnError(sql.ErrNoRows)
	mock.ExpectQuery(`SELECT request_hash, state, status_code, response_body, locked_until`).
		WithArgs("order.create", "user-1", "key-123456789").
		WillReturnRows(sqlmock.NewRows([]string{"request_hash", "state", "status_code", "response_body", "locked_until"}).
			AddRow(hashText, "completed", 201, []byte(body), time.Now().Add(time.Hour)))

	second := RequireIdempotencyKey(sqlxDB, "order.create", func(http.ResponseWriter, *http.Request) {
		t.Fatal("handler must not run for a completed retry")
	})
	secondReq := httptest.NewRequest(http.MethodPost, "/orders", strings.NewReader(body)).WithContext(ctx)
	secondReq.Header.Set("X-Idempotency-Key", "key-123456789")
	secondRes := httptest.NewRecorder()
	second(secondRes, secondReq)
	if secondRes.Code != http.StatusCreated || secondRes.Body.String() != body {
		t.Fatalf("replay response = %d %q", secondRes.Code, secondRes.Body.String())
	}

	conflictBody := `{"name":"different"}`
	mock.ExpectQuery(insertPattern).WillReturnError(sql.ErrNoRows)
	mock.ExpectQuery(`SELECT request_hash, state, status_code, response_body, locked_until`).
		WithArgs("order.create", "user-1", "key-123456789").
		WillReturnRows(sqlmock.NewRows([]string{"request_hash", "state", "status_code", "response_body", "locked_until"}).
			AddRow(hashText, "completed", 201, []byte(body), time.Now().Add(time.Hour)))
	conflict := RequireIdempotencyKey(sqlxDB, "order.create", func(http.ResponseWriter, *http.Request) {
		t.Fatal("handler must not run for a different payload with the same key")
	})
	conflictReq := httptest.NewRequest(http.MethodPost, "/orders", strings.NewReader(conflictBody)).WithContext(ctx)
	conflictReq.Header.Set("X-Idempotency-Key", "key-123456789")
	conflictRes := httptest.NewRecorder()
	conflict(conflictRes, conflictReq)
	if conflictRes.Code != http.StatusConflict || !strings.Contains(conflictRes.Body.String(), "ERR_IDEMPOTENCY_CONFLICT") {
		t.Fatalf("conflict response = %d %q", conflictRes.Code, conflictRes.Body.String())
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
)

func TestAuthMiddlewareAcceptsMerchantWebSession(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("create sqlmock: %v", err)
	}
	defer db.Close()

	previousDB := globalDB
	globalDB = db
	defer func() { globalDB = previousDB }()

	mock.ExpectQuery(`SELECT s\.user_id, u\.role`).
		WithArgs("merchant-session-token").
		WillReturnRows(sqlmock.NewRows([]string{"user_id", "role"}).
			AddRow("merchant-user-id", "merchant_owner"))

	req := httptest.NewRequest(http.MethodGet, "/api/v1/notifications?limit=8", nil)
	req.AddCookie(&http.Cookie{Name: "merchant_session", Value: "merchant-session-token"})
	rec := httptest.NewRecorder()

	var gotUserID, gotRole string
	handler := AuthMiddleware(func(w http.ResponseWriter, r *http.Request) {
		gotUserID = GetUserIDFromContext(r.Context())
		gotRole = GetRoleFromContext(r.Context())
		w.WriteHeader(http.StatusNoContent)
	})
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("expected merchant session to authenticate, got status %d", rec.Code)
	}
	if gotUserID != "merchant-user-id" || gotRole != "merchant_owner" {
		t.Fatalf("unexpected identity: user=%q role=%q", gotUserID, gotRole)
	}
	if got := req.Header.Get("X-User-ID"); got != "merchant-user-id" {
		t.Fatalf("expected X-User-ID header, got %q", got)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("database expectations: %v", err)
	}
}

func TestAuthMiddlewareRejectsInvalidMerchantWebSession(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("create sqlmock: %v", err)
	}
	defer db.Close()

	previousDB := globalDB
	globalDB = db
	defer func() { globalDB = previousDB }()

	mock.ExpectQuery(`SELECT s\.user_id, u\.role`).
		WithArgs("expired-merchant-session-token").
		WillReturnError(sqlmock.ErrCancelled)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/notifications", nil)
	req.AddCookie(&http.Cookie{Name: "merchant_session", Value: "expired-merchant-session-token"})
	rec := httptest.NewRecorder()

	AuthMiddleware(func(w http.ResponseWriter, _ *http.Request) {
		t.Fatal("invalid merchant session must not reach the handler")
	}).ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected invalid merchant session to return 401, got %d", rec.Code)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("database expectations: %v", err)
	}
}

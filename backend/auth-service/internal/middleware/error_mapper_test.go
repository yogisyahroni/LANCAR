package middleware

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestErrorMapperMiddlewareSanitizesInternalHttpError(t *testing.T) {
	handler := CorrelationIDMiddleware(ErrorMapperMiddleware(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "database failed for customer@example.com token eyJaaaaaaaaaaa.bbbbbbbbbbbb.cccccccccccc", http.StatusInternalServerError)
	}))

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	req.Header.Set(correlationIDHeader, "corr-test")
	res := httptest.NewRecorder()

	handler(res, req)

	if res.Code != http.StatusInternalServerError {
		t.Fatalf("expected status 500, got %d", res.Code)
	}
	body := res.Body.String()
	if !strings.Contains(body, `"code":"ERR_INTERNAL_SERVER"`) {
		t.Fatalf("expected generic error code in body: %s", body)
	}
	if strings.Contains(body, "customer@example.com") || strings.Contains(body, "database failed") || strings.Contains(body, "eyJ") {
		t.Fatalf("expected sensitive error details to be removed, got: %s", body)
	}
}

func TestErrorMapperMiddlewareKeepsClientErrorsReadable(t *testing.T) {
	handler := CorrelationIDMiddleware(ErrorMapperMiddleware(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
	}))

	req := httptest.NewRequest(http.MethodPost, "/test", nil)
	res := httptest.NewRecorder()

	handler(res, req)

	if res.Code != http.StatusBadRequest {
		t.Fatalf("expected status 400, got %d", res.Code)
	}
	if !strings.Contains(res.Body.String(), "Invalid request body") {
		t.Fatalf("expected client error detail to remain, got: %s", res.Body.String())
	}
}

func TestRedactStringMasksCommonSecretsAndPII(t *testing.T) {
	redacted := RedactString("email customer@example.com phone 081234567890 bearer Bearer eyJabc.def.ghi card 4111111111111111 db postgres://user:password@db")

	for _, forbidden := range []string{"customer@example.com", "081234567890", "eyJabc", "4111111111111111", "user:password"} {
		if strings.Contains(redacted, forbidden) {
			t.Fatalf("expected %s to be redacted from %q", forbidden, redacted)
		}
	}
}

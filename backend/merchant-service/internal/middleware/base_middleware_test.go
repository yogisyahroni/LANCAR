package middleware

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

type mutationAuditRecorderStub struct {
	events []MutationAuditEvent
}

func (s *mutationAuditRecorderStub) RecordMutation(_ context.Context, event MutationAuditEvent) error {
	s.events = append(s.events, event)
	return nil
}

func TestMutationAuditMiddlewareRecordsSuccessfulMutation(t *testing.T) {
	recorder := &mutationAuditRecorderStub{}
	handler := MutationAuditMiddlewareWithRecorder(recorder)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))
	req := httptest.NewRequest(http.MethodPatch, "/api/v1/merchant/menu/11111111-1111-4111-8111-111111111111", nil)
	req.Header.Set("X-User-ID", "22222222-2222-4222-8222-222222222222")
	req.Header.Set("X-User-Role", "manager")
	req.Header.Set("X-Merchant-Branch-ID", "33333333-3333-4333-8333-333333333333")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, req)

	if response.Code != http.StatusNoContent {
		t.Fatalf("expected 204 response, got %d", response.Code)
	}
	if len(recorder.events) != 1 {
		t.Fatalf("expected one audit event, got %d", len(recorder.events))
	}
	event := recorder.events[0]
	if event.Result != "success" || event.FailureReason != "" {
		t.Fatalf("unexpected success result: %+v", event)
	}
	if event.ObjectID != "11111111-1111-4111-8111-111111111111" {
		t.Fatalf("expected object ID from route, got %q", event.ObjectID)
	}
	if event.OutletID != "33333333-3333-4333-8333-333333333333" {
		t.Fatalf("expected outlet scope, got %q", event.OutletID)
	}
}

func TestMutationAuditMiddlewareRecordsFailureWithReason(t *testing.T) {
	recorder := &mutationAuditRecorderStub{}
	handler := MutationAuditMiddlewareWithRecorder(recorder)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "forbidden", http.StatusForbidden)
	}))
	req := httptest.NewRequest(http.MethodPost, "/api/v1/merchant/orders", nil)
	req.Header.Set("X-User-ID", "22222222-2222-4222-8222-222222222222")
	req.Header.Set("X-User-Role", "kitchen")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, req)

	if len(recorder.events) != 1 {
		t.Fatalf("expected one failed audit event, got %d", len(recorder.events))
	}
	event := recorder.events[0]
	if event.Result != "failure" || event.FailureReason != "http_status_403" {
		t.Fatalf("unexpected failure result: %+v", event)
	}
}

func TestMutationAuditMiddlewareIgnoresReadRequests(t *testing.T) {
	recorder := &mutationAuditRecorderStub{}
	handler := MutationAuditMiddlewareWithRecorder(recorder)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	req := httptest.NewRequest(http.MethodGet, "/api/v1/merchant/context", nil)
	req.Header.Set("X-User-ID", "22222222-2222-4222-8222-222222222222")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, req)

	if len(recorder.events) != 0 {
		t.Fatalf("expected no audit event for GET, got %d", len(recorder.events))
	}
}

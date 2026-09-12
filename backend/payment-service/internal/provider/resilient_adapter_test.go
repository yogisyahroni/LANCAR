package provider

import (
	"context"
	"errors"
	"testing"
	"time"
)

type resilientStub struct {
	attempts int
	err      error
}

func (s *resilientStub) Name() string { return "stub" }
func (s *resilientStub) Capabilities() map[Capability]bool {
	return map[Capability]bool{CapabilityCreate: true}
}
func (s *resilientStub) Create(context.Context, PaymentRequest) (PaymentResponse, error) {
	s.attempts++
	return PaymentResponse{}, s.err
}
func (s *resilientStub) Lookup(context.Context, string) (PaymentResponse, error) {
	return PaymentResponse{}, nil
}
func (s *resilientStub) Refund(context.Context, RefundRequest) (RefundResponse, error) {
	return RefundResponse{}, nil
}
func (s *resilientStub) VerifyWebhook(context.Context, []byte, string) error { return nil }

func TestResilientAdapterRetriesAndOpensCircuit(t *testing.T) {
	stub := &resilientStub{err: errors.New("provider timeout")}
	adapter := NewResilientAdapter(stub, time.Second, 2, 1, time.Minute)
	if _, err := adapter.Create(context.Background(), PaymentRequest{IdempotencyKey: "intent-1"}); err == nil || stub.attempts != 2 {
		t.Fatalf("expected two bounded attempts, attempts=%d err=%v", stub.attempts, err)
	}
	if _, err := adapter.Create(context.Background(), PaymentRequest{IdempotencyKey: "intent-1"}); !errors.Is(err, ErrCircuitOpen) {
		t.Fatalf("expected open circuit, got %v", err)
	}
}

func TestResilientAdapterRejectsMutationWithoutIdempotency(t *testing.T) {
	stub := &resilientStub{err: errors.New("provider timeout")}
	adapter := NewResilientAdapter(stub, time.Second, 3, 1, time.Minute)
	if _, err := adapter.Create(context.Background(), PaymentRequest{}); !errors.Is(err, ErrProviderIdempotencyRequired) {
		t.Fatalf("expected idempotency guard, got %v", err)
	}
	if stub.attempts != 0 {
		t.Fatalf("mutation without idempotency must not reach provider, attempts=%d", stub.attempts)
	}
}

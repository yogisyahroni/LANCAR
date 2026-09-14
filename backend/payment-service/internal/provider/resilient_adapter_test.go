package provider

import (
	"context"
	"errors"
	"testing"
	"time"
)

type resilientStub struct {
	attempts       int
	lookups        int
	lookupAttempts int
	err            error
	lookupErr      error
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
	s.lookups++
	s.lookupAttempts++
	if s.lookupErr != nil {
		return PaymentResponse{}, s.lookupErr
	}
	return PaymentResponse{ProviderReference: "provider-result-1", RawStatus: "PAID"}, nil
}
func (s *resilientStub) Refund(context.Context, RefundRequest) (RefundResponse, error) {
	return RefundResponse{}, nil
}
func (s *resilientStub) VerifyWebhook(context.Context, []byte, string) error { return nil }

func TestResilientAdapterRetriesAndOpensCircuit(t *testing.T) {
	stub := &resilientStub{lookupErr: errors.New("provider timeout")}
	adapter := NewResilientAdapter(stub, time.Second, 2, 1, time.Minute)
	if _, err := adapter.Lookup(context.Background(), "provider-ref-1"); err == nil || stub.lookupAttempts != 2 {
		t.Fatalf("expected two bounded lookup attempts, attempts=%d err=%v", stub.lookupAttempts, err)
	}
	if _, err := adapter.Lookup(context.Background(), "provider-ref-1"); !errors.Is(err, ErrCircuitOpen) {
		t.Fatalf("expected open circuit, got %v", err)
	}
}

func TestResilientAdapterNeverRetriesUnknownCreate(t *testing.T) {
	stub := &resilientStub{err: errors.New("provider timeout")}
	adapter := NewResilientAdapter(stub, time.Second, 3, 5, time.Minute)
	if _, err := adapter.Create(context.Background(), PaymentRequest{IdempotencyKey: "intent-unknown-2"}); err == nil {
		t.Fatal("provider timeout must remain unknown")
	}
	if stub.attempts != 1 {
		t.Fatalf("unknown create must never be retried, attempts=%d", stub.attempts)
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

func TestResilientAdapterRecoversUnknownCreateByLookupWithoutSecondCreate(t *testing.T) {
	stub := &resilientStub{err: errors.New("provider timeout")}
	adapter := NewResilientAdapter(stub, time.Second, 1, 5, time.Minute)

	if _, err := adapter.Create(context.Background(), PaymentRequest{IdempotencyKey: "intent-unknown-1"}); err == nil {
		t.Fatal("provider timeout must remain unknown until lookup")
	}
	response, err := adapter.LookupAfterUnknownCreate(context.Background(), "provider-result-1")
	if err != nil || response.RawStatus != "PAID" || stub.lookups != 1 || stub.attempts != 1 {
		t.Fatalf("expected one create followed by one lookup, create=%d lookup=%d response=%+v err=%v", stub.attempts, stub.lookups, response, err)
	}
	if _, err := adapter.LookupAfterUnknownCreate(context.Background(), ""); !errors.Is(err, ErrProviderReferenceRequired) {
		t.Fatalf("missing reference must fail closed, got %v", err)
	}
}

package service

import (
	"context"
	"testing"

	"tembus/order-service/internal/domain"
)

func TestMaskContactDetails(t *testing.T) {
	got := maskContactDetails("hubungi 0812 3456 7890 atau https://wa.me/628123456789")
	if got == "" || got == "hubungi 0812 3456 7890 atau https://wa.me/628123456789" {
		t.Fatalf("contact details were not masked: %q", got)
	}
}

type chatRepositoryStub struct {
	allowed       bool
	reportCalled  bool
	reportedOrder string
}

func (s *chatRepositoryStub) SaveMessage(context.Context, *domain.ChatMessage) error { return nil }
func (s *chatRepositoryStub) GetMessagesByOrderID(context.Context, string) ([]domain.ChatMessage, error) {
	return nil, nil
}
func (s *chatRepositoryStub) CanAccessOrder(context.Context, string, string, string) (bool, error) {
	return s.allowed, nil
}
func (s *chatRepositoryStub) AuditAccess(context.Context, string, string, string, string) error {
	return nil
}
func (s *chatRepositoryStub) ReportChat(_ context.Context, orderID, _, _, _ string) error {
	s.reportCalled = true
	s.reportedOrder = orderID
	return nil
}

type eventBusStub struct{}

func (eventBusStub) Publish(context.Context, string, interface{}) error { return nil }
func (eventBusStub) Subscribe(context.Context, string) (<-chan string, error) {
	return make(chan string), nil
}

func TestReportChatRequiresOrderParticipantAndStoresOnlyReportMetadata(t *testing.T) {
	repo := &chatRepositoryStub{allowed: true}
	svc := NewChatService(repo, eventBusStub{})
	if err := svc.ReportChat(context.Background(), "order-1", "user-1", "customer", "message-1", "harassment"); err != nil {
		t.Fatalf("report should be accepted: %v", err)
	}
	if !repo.reportCalled || repo.reportedOrder != "order-1" {
		t.Fatalf("report was not persisted through the chat repository")
	}

	repo.allowed = false
	if err := svc.ReportChat(context.Background(), "order-2", "user-2", "customer", "", "spam"); err != ErrChatUnauthorized {
		t.Fatalf("expected unauthorized report, got %v", err)
	}
}

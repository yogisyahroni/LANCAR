package domain

import (
	"github.com/google/uuid"
	"testing"
)

func validCommunicationEvent() CommunicationEvent {
	return CommunicationEvent{EventID: uuid.New(), RecipientID: uuid.New(), SemanticType: "order.delivered", MarketCode: "id-jk", Locale: "id-ID", Category: CommunicationOrder, Priority: CommunicationCritical, TemplateKey: "order.delivered", TemplateVersion: 1, CorrelationID: "corr-1"}
}
func TestCommunicationEventRequiresSemanticContract(t *testing.T) {
	e := validCommunicationEvent()
	e.TemplateKey = ""
	if e.Validate() == nil {
		t.Fatal("expected invalid semantic event")
	}
}
func TestMarketingNeverGetsExternalFallbackByDefault(t *testing.T) {
	e := validCommunicationEvent()
	e.Category = CommunicationMarketing
	got := ChannelsFor(e)
	if len(got) != 2 || got[0] != CommunicationInApp || got[1] != CommunicationPush {
		t.Fatalf("unexpected channels: %#v", got)
	}
}

func TestFallbackChainKeepsMarketingInsideConsentedChannels(t *testing.T) {
	e := validCommunicationEvent()
	e.Category = CommunicationMarketing
	chain := FallbackChain(e, CommunicationPush)
	if len(chain) != 2 || chain[0] != CommunicationPush || chain[1] != CommunicationInApp {
		t.Fatalf("unexpected marketing fallback: %#v", chain)
	}
	e.Category = CommunicationOrder
	chain = FallbackChain(e, CommunicationPush)
	if len(chain) != 2 || chain[1] != CommunicationInApp {
		t.Fatalf("transactional fallback must preserve inbox delivery: %#v", chain)
	}
}
func TestDeliveryClassificationStopsPermanentErrors(t *testing.T) {
	d := ClassifyDelivery(410, 1)
	if !d.DeadLetter || d.Retry {
		t.Fatalf("unexpected decision: %+v", d)
	}
	d = ClassifyDelivery(503, 2)
	if !d.Retry || d.Delay <= 0 {
		t.Fatalf("expected retry: %+v", d)
	}
}

func TestProtectedTemplateRequiresApproval(t *testing.T) {
	tplt := CommunicationTemplate{TemplateKey: "safety.alert", Version: 1, MarketCode: "id-jk", Locale: "id-ID", BodyTemplate: "{{message}}", RequiredVariables: []string{"message"}, ProtectedCopy: true, ApprovalStatus: "draft"}
	if tplt.Validate() == nil {
		t.Fatal("expected approval requirement")
	}
}

package service

import (
	"tembus/order-service/internal/domain"
	"testing"

	"github.com/google/uuid"
)

func TestClaimInputRequiresEvidenceForLostAndDamaged(t *testing.T) {
	claim := &domain.LogisticsExceptionClaim{OrderID: uuid.New(), AWBNumber: "AWB-1", ProviderName: "JNE", ExceptionType: "LOST_CLAIM"}
	if _, err := (&aggregatorFinanceService{}).SubmitClaim(nil, claim); err == nil {
		t.Fatal("expected evidence validation before repository access")
	}
}

func TestClaimResolutionTerminalStatusIsExplicitlyRejected(t *testing.T) {
	if !terminalClaimStatus("PAID") || !terminalClaimStatus("COMPENSATED") {
		t.Fatal("terminal claim statuses must be protected")
	}
	if terminalClaimStatus("APPROVED") {
		t.Fatal("approved claim is not yet terminal")
	}
}

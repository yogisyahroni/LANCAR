package main

import (
	"os"
	"regexp"
	"strings"
	"testing"
)

// Merchant mutations must pass through the same authenticated middleware that
// records the server-resolved actor/tenant/outlet scope. This source contract
// prevents a newly added /api/v1/merchant route from silently bypassing the
// durable audit recorder.
func TestMerchantRoutesAreAuditWrapped(t *testing.T) {
	source, err := os.ReadFile("main.go")
	if err != nil {
		t.Fatalf("read merchant API route source: %v", err)
	}

	routeLine := regexp.MustCompile(`^\s*mux\.Handle(?:Func)?\("(/api/v1/merchant[^\"]*)".*$`)
	var routes []string
	for _, line := range strings.Split(string(source), "\n") {
		match := routeLine.FindStringSubmatch(line)
		if len(match) == 0 {
			continue
		}
		routes = append(routes, match[1])
		if !strings.Contains(line, "withAudit(") {
			t.Errorf("merchant route %s is not wrapped with withAudit", match[1])
		}
	}

	if len(routes) < 40 {
		t.Fatalf("expected the portal route inventory to include at least 40 merchant routes, found %d", len(routes))
	}
	if !strings.Contains(string(source), "auditRecorder := middleware.NewSQLMutationAuditRecorder(db)") {
		t.Fatal("merchant API does not wire the durable SQL mutation audit recorder")
	}
}

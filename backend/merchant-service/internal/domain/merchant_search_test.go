package domain

import "testing"

func TestNormalizeMerchantSearchQuery(t *testing.T) {
	tests := []struct {
		name    string
		input   string
		want    string
		wantErr bool
	}{
		{name: "collapses whitespace", input: "  Soto   Ayam  ", want: "Soto Ayam"},
		{name: "rejects short query", input: "a", wantErr: true},
		{name: "rejects empty query", input: "   ", wantErr: true},
		{name: "rejects oversized query", input: "123456789012345678901234567890123456789012345678901234567890123456789012345678901", wantErr: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := NormalizeMerchantSearchQuery(tt.input)
			if tt.wantErr {
				if err == nil {
					t.Fatalf("expected error, got query %q", got)
				}
				return
			}
			if err != nil {
				t.Fatalf("NormalizeMerchantSearchQuery() error = %v", err)
			}
			if got != tt.want {
				t.Fatalf("NormalizeMerchantSearchQuery() = %q, want %q", got, tt.want)
			}
		})
	}
}

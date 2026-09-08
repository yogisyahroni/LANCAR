package platform

import "testing"

func TestNewOrderClientValidatesServiceURL(t *testing.T) {
	tests := []struct {
		name    string
		baseURL string
		wantErr bool
	}{
		{name: "valid internal service", baseURL: "http://order-service:8083/"},
		{name: "missing host", baseURL: "http:///orders", wantErr: true},
		{name: "unsupported scheme", baseURL: "file:///etc/passwd", wantErr: true},
		{name: "credentials", baseURL: "http://user:pass@order-service:8083", wantErr: true},
		{name: "query", baseURL: "http://order-service:8083?target=other", wantErr: true},
		{name: "fragment", baseURL: "http://order-service:8083#other", wantErr: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			client, err := NewOrderClient(tt.baseURL, "test-secret")
			if tt.wantErr {
				if err == nil {
					t.Fatalf("NewOrderClient(%q) error = nil, want error", tt.baseURL)
				}
				return
			}
			if err != nil {
				t.Fatalf("NewOrderClient(%q) error = %v", tt.baseURL, err)
			}
			if client == nil {
				t.Fatal("NewOrderClient returned nil client")
			}
		})
	}
}

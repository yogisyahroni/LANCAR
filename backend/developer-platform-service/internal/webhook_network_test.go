package platform

import (
	"net"
	"testing"
)

func TestIsBlockedWebhookIP(t *testing.T) {
	tests := []struct {
		name string
		ip   string
		want bool
	}{
		{name: "private IPv4", ip: "10.0.0.1", want: true},
		{name: "loopback IPv4", ip: "127.0.0.1", want: true},
		{name: "link local IPv4", ip: "169.254.1.1", want: true},
		{name: "private IPv6", ip: "fd00::1", want: true},
		{name: "loopback IPv6", ip: "::1", want: true},
		{name: "unspecified", ip: "0.0.0.0", want: true},
		{name: "public address", ip: "8.8.8.8", want: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := isBlockedWebhookIP(net.ParseIP(tt.ip)); got != tt.want {
				t.Fatalf("isBlockedWebhookIP(%q) = %v, want %v", tt.ip, got, tt.want)
			}
		})
	}
}

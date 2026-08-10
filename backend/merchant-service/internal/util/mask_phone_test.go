package util

import "testing"

func TestMaskPhone(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  string
	}{
		{"kosong", "", ""},
		{"terlalu pendek", "0812", "0812"},
		{"standar 12 digit", "081234567890", "0812-XXXX-XX90"},
		{"dengan separator +62", "+62 812-3456-7890", "6281-XXXX-XX90"},
		{"prefix 0", "087812345678", "0878-XXXX-XX78"},
		{"idempotent: sudah mask", "0812-XXXX-XX90", "0812-XXXX-XX90"},
		{"idempotent: asterisk", "0812******90", "0812******90"},
		{"huruf diabaikan → mask dari digit", "0812-AB-7890", "0812-XXXX-XX90"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := MaskPhone(tt.input); got != tt.want {
				t.Errorf("MaskPhone(%q) = %q, want %q", tt.input, got, tt.want)
			}
		})
	}
}

func TestIsPhoneMasked(t *testing.T) {
	if IsPhoneMasked("081234567890") {
		t.Error("nomor asli terdeteksi ter-mask")
	}
	if !IsPhoneMasked("0812-XXXX-XX90") {
		t.Error("nomor ter-mask tidak terdeteksi")
	}
	if !IsPhoneMasked("0812******90") {
		t.Error("asterisk tidak terdeteksi")
	}
}

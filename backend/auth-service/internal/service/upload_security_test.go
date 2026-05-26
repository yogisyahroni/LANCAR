package service

import (
	"strings"
	"testing"
)

func TestValidateSecureUploadRejectsExecutableDisguisedAsPdf(t *testing.T) {
	_, err := ValidateSecureUpload(CourierDocumentUpload, "document.pdf", strings.NewReader("MZfake executable"))
	if err == nil {
		t.Fatal("expected executable upload to be rejected")
	}
}

func TestValidateSecureUploadUsesDetectedExtension(t *testing.T) {
	png := []byte{0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00}
	secureUpload, err := ValidateSecureUpload(CourierDocumentUpload, "document.png", strings.NewReader(string(png)))
	if err != nil {
		t.Fatalf("expected PNG upload to be accepted: %v", err)
	}
	if secureUpload.Extension != ".png" {
		t.Fatalf("expected .png extension, got %s", secureUpload.Extension)
	}
	if !strings.HasSuffix(secureUpload.Filename, ".png") {
		t.Fatalf("expected server-side filename to end with .png, got %s", secureUpload.Filename)
	}
}

func TestValidateSecureUploadRejectsExtensionMismatch(t *testing.T) {
	pdf := "%PDF-1.7\n"
	_, err := ValidateSecureUpload(CourierDocumentUpload, "document.jpg", strings.NewReader(pdf))
	if err == nil {
		t.Fatal("expected extension mismatch to be rejected")
	}
}

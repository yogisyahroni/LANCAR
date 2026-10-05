package service

import (
	"bytes"
	"context"
	"image"
	"image/jpeg"
	"image/png"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestValidateMenuPhotoContentAcceptsRealPNGAndJPEG(t *testing.T) {
	img := image.NewRGBA(image.Rect(0, 0, 32, 24))
	var pngBytes bytes.Buffer
	if err := png.Encode(&pngBytes, img); err != nil {
		t.Fatal(err)
	}
	if err := validateMenuPhotoContent(pngBytes.Bytes(), ".png"); err != nil {
		t.Fatalf("valid PNG rejected: %v", err)
	}
	var jpegBytes bytes.Buffer
	if err := jpeg.Encode(&jpegBytes, img, nil); err != nil {
		t.Fatal(err)
	}
	if err := validateMenuPhotoContent(jpegBytes.Bytes(), ".jpg"); err != nil {
		t.Fatalf("valid JPEG rejected: %v", err)
	}
}

func TestValidateMenuPhotoContentRejectsOversizedDimensions(t *testing.T) {
	img := image.NewRGBA(image.Rect(0, 0, maxMenuPhotoDimension+1, 1))
	var encoded bytes.Buffer
	if err := png.Encode(&encoded, img); err != nil {
		t.Fatal(err)
	}
	if err := validateMenuPhotoContent(encoded.Bytes(), ".png"); err != ErrMenuPhotoDimensions {
		t.Fatalf("expected dimension policy error, got %v", err)
	}
}

func TestValidateMenuPhotoContentRejectsEicarSignature(t *testing.T) {
	content := append([]byte{0x89, 'P', 'N', 'G', 0x0d, 0x0a, 0x1a, 0x0a}, []byte(eicarSignature)...)
	if err := validateMenuPhotoContent(content, ".png"); err != ErrMenuPhotoMalware {
		t.Fatalf("expected malware policy error, got %v", err)
	}
	if !strings.Contains(ErrMenuPhotoMalware.Error(), "keamanan") {
		t.Fatal("malware rejection should be safe for user-facing error mapping")
	}
}

func TestWebpDimensionsVP8X(t *testing.T) {
	content := make([]byte, 30)
	copy(content[0:4], "RIFF")
	copy(content[8:12], "WEBP")
	copy(content[12:16], "VP8X")
	content[24] = 99
	content[27] = 49
	width, height, err := webpDimensions(content)
	if err != nil || width != 100 || height != 50 {
		t.Fatalf("unexpected VP8X dimensions: %d x %d, err=%v", width, height, err)
	}
}

func TestHTTPMenuPhotoScannerFailsClosedAndSendsDigest(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-File-SHA256") == "" || r.Header.Get("X-File-Name") != "menu.png" {
			t.Fatalf("scanner request missing safe metadata")
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"clean":false}`))
	}))
	defer server.Close()
	scanner := HTTPMenuPhotoScanner{Endpoint: server.URL, FailClosed: true, Client: server.Client()}
	err := scanner.Scan(context.Background(), "../../menu.png", "image/png", []byte("bytes"))
	if err != ErrMenuPhotoMalware {
		t.Fatalf("expected malware rejection, got %v", err)
	}
}

package service

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/google/uuid"
)

// MenuPhotoStorage — penyimpanan foto menu (local disk, pola LocalStorage auth-service).
// URL publik di-return dari baseURL env supaya konsisten dengan gateway/nginx.
type MenuPhotoStorage struct {
	basePath string
	baseURL  string
}

func NewMenuPhotoStorage(basePath, baseURL string) (*MenuPhotoStorage, error) {
	if err := os.MkdirAll(basePath, 0o750); err != nil {
		return nil, fmt.Errorf("failed to create menu upload dir: %w", err)
	}
	return &MenuPhotoStorage{basePath: basePath, baseURL: baseURL}, nil
}

// ErrMenuPhotoTooLarge — foto menu melebihi 2MB.
var ErrMenuPhotoTooLarge = errors.New("file terlalu besar (maks 2MB)")
var ErrMenuPhotoDimensions = errors.New("dimensi gambar tidak memenuhi kebijakan (maks 4096x4096 dan 16 megapiksel)")
var ErrMenuPhotoMalware = errors.New("file ditolak oleh pemeriksaan keamanan")

// Save — validasi tipe gambar + simpan dengan nama UUID + ekstensi aman.
// Limit 2MB (foto menu). Kembalikan URL publik.
func (s *MenuPhotoStorage) Save(ctx context.Context, filename string, content []byte) (string, error) {
	if len(content) == 0 {
		return "", errors.New("file kosong")
	}
	if len(content) > 2*1024*1024 {
		return "", ErrMenuPhotoTooLarge
	}

	ext, err := imageExtByContent(content)
	if err != nil {
		return "", err
	}
	if err := validateMenuPhotoContent(content, ext); err != nil {
		return "", err
	}

	newFilename := uuid.New().String() + ext
	filePath := filepath.Join(s.basePath, newFilename)

	out, err := os.OpenFile(filePath, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o640)
	if err != nil {
		return "", fmt.Errorf("failed to create file: %w", err)
	}
	defer out.Close()

	if _, err := io.Copy(out, bytes.NewReader(content)); err != nil {
		return "", fmt.Errorf("failed to write file: %w", err)
	}

	return fmt.Sprintf("%s/%s", strings.TrimSuffix(s.baseURL, "/"), newFilename), nil
}

// imageExtByContent — deteksi tipe dari magic bytes (bukan dari header filename),
// anti spoof ekstensi. Return ext ".jpg" / ".png" / ".webp".
func imageExtByContent(b []byte) (string, error) {
	switch {
	case len(b) >= 3 && b[0] == 0xFF && b[1] == 0xD8 && b[2] == 0xFF:
		return ".jpg", nil
	case len(b) >= 8 && b[0] == 0x89 && b[1] == 'P' && b[2] == 'N' && b[3] == 'G':
		return ".png", nil
	case len(b) >= 12 && b[0] == 'R' && b[1] == 'I' && b[2] == 'F' && b[3] == 'F' && b[8] == 'W' && b[9] == 'E' && b[10] == 'B' && b[11] == 'P':
		return ".webp", nil
	default:
		return "", errors.New("file harus berupa gambar (JPG/PNG/WebP)")
	}
}

const (
	maxMenuPhotoDimension = 4096
	maxMenuPhotoPixels    = 16 * 1024 * 1024
	eicarSignature        = "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"
)

func validateMenuPhotoContent(content []byte, ext string) error {
	// This deterministic signature check protects local/staging environments and
	// keeps the upload contract testable. A production AV/CDN scanner remains a
	// deployment requirement and is deliberately not represented as complete here.
	if bytes.Contains(content, []byte(eicarSignature)) {
		return ErrMenuPhotoMalware
	}
	width, height, err := imageDimensions(content, ext)
	if err != nil {
		return fmt.Errorf("gambar tidak dapat dibaca: %w", err)
	}
	if width < 1 || height < 1 || width > maxMenuPhotoDimension || height > maxMenuPhotoDimension || int64(width)*int64(height) > maxMenuPhotoPixels {
		return ErrMenuPhotoDimensions
	}
	return nil
}

func imageDimensions(content []byte, ext string) (int, int, error) {
	if ext == ".webp" {
		return webpDimensions(content)
	}
	config, _, err := image.DecodeConfig(bytes.NewReader(content))
	if err != nil {
		return 0, 0, err
	}
	return config.Width, config.Height, nil
}

// webpDimensions supports the three WebP container variants without trusting
// a filename or a client-provided Content-Type.
func webpDimensions(content []byte) (int, int, error) {
	if len(content) < 30 || string(content[0:4]) != "RIFF" || string(content[8:12]) != "WEBP" {
		return 0, 0, errors.New("header WebP tidak valid")
	}
	chunk := string(content[12:16])
	switch chunk {
	case "VP8X":
		width := 1 + int(content[24]) + (int(content[25]) << 8) + (int(content[26]) << 16)
		height := 1 + int(content[27]) + (int(content[28]) << 8) + (int(content[29]) << 16)
		return width, height, nil
	case "VP8 ":
		if len(content) < 30 || content[23] != 0x9d || content[24] != 0x01 || content[25] != 0x2a {
			return 0, 0, errors.New("frame WebP lossy tidak valid")
		}
		return int(content[26]) | int(content[27])<<8, int(content[28]) | int(content[29])<<8, nil
	case "VP8L":
		if len(content) < 26 || content[20] != 0x2f {
			return 0, 0, errors.New("frame WebP lossless tidak valid")
		}
		width := 1 + int(content[21]) + (int(content[22]) << 8) + ((int(content[23]) & 0x3f) << 16)
		height := 1 + (int(content[23]) >> 6) + (int(content[24]) << 2) + ((int(content[25]) & 0x0f) << 10)
		return width, height, nil
	default:
		return 0, 0, errors.New("varian WebP tidak didukung")
	}
}

// ContentTypeByExt — helper untuk response/middleware kalau perlu.
func ContentTypeByExt(ext string) string {
	switch strings.ToLower(ext) {
	case ".png":
		return "image/png"
	case ".webp":
		return "image/webp"
	default:
		return "image/jpeg"
	}
}

// StaticUploadHandler — serve file /merchant-uploads/* (pola FileServer dengan cache header).
// Path unik (bukan /uploads) supaya tidak bentrok dengan admin-service di gateway.
func StaticUploadHandler(uploadDir string) http.HandlerFunc {
	// StripPrefix WAJIB: ServeMux tidak menghapus prefix path; tanpa ini
	// FileServer mencari <dir>/merchant-uploads/<file> → 404.
	fs := http.StripPrefix("/merchant-uploads/", http.FileServer(http.Dir(uploadDir)))
	return func(w http.ResponseWriter, r *http.Request) {
		// Hanya GET — file upload tidak boleh ditimpa/dihapus via HTTP.
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Content-Security-Policy", "default-src 'none'; img-src 'self' data:")
		fs.ServeHTTP(w, r)
	}
}

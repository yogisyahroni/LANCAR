package service

import (
	"bytes"
	"context"
	"errors"
	"fmt"
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

// StaticUploadHandler — serve file /uploads/* (pola FileServer dengan cache header).
func StaticUploadHandler(uploadDir string) http.HandlerFunc {
	// StripPrefix WAJIB: ServeMux tidak menghapus prefix path; tanpa ini
	// FileServer mencari <dir>/uploads/<file> → 404.
	fs := http.StripPrefix("/uploads/", http.FileServer(http.Dir(uploadDir)))
	return func(w http.ResponseWriter, r *http.Request) {
		// Hanya GET — file upload tidak boleh ditimpa/dihapus via HTTP.
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		fs.ServeHTTP(w, r)
	}
}

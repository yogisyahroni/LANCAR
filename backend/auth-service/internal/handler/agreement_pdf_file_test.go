package handler

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func TestOpenAgreementPDFUnderRootAllowsNestedFile(t *testing.T) {
	root := t.TempDir()
	relative := filepath.Join("agreements", "customer", "user-1", "agreement.pdf")
	fullPath := filepath.Join(root, relative)
	if err := os.MkdirAll(filepath.Dir(fullPath), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(fullPath, []byte("pdf-data"), 0o600); err != nil {
		t.Fatal(err)
	}

	file, err := openAgreementPDFUnderRoot(root, relative)
	if err != nil {
		t.Fatalf("expected nested PDF to open: %v", err)
	}
	defer file.Close()
}

func TestOpenAgreementPDFUnderRootRejectsParentTraversal(t *testing.T) {
	root := t.TempDir()
	outside := filepath.Join(filepath.Dir(root), "outside-agreement.pdf")
	if err := os.WriteFile(outside, []byte("secret"), 0o600); err != nil {
		t.Fatal(err)
	}
	defer os.Remove(outside)

	if _, err := openAgreementPDFUnderRoot(root, filepath.Join("..", filepath.Base(outside))); err == nil {
		t.Fatal("expected parent traversal to be rejected")
	}
}

func TestOpenAgreementPDFUnderRootRejectsAbsolutePath(t *testing.T) {
	root := t.TempDir()
	outside := filepath.Join(t.TempDir(), "outside.pdf")
	if err := os.WriteFile(outside, []byte("secret"), 0o600); err != nil {
		t.Fatal(err)
	}

	if _, err := openAgreementPDFUnderRoot(root, outside); err == nil {
		t.Fatal("expected absolute path to be rejected")
	}
}

func TestOpenAgreementPDFUnderRootRejectsSymlinkEscape(t *testing.T) {
	root := t.TempDir()
	outsideDir := t.TempDir()
	outside := filepath.Join(outsideDir, "outside.pdf")
	if err := os.WriteFile(outside, []byte("secret"), 0o600); err != nil {
		t.Fatal(err)
	}

	link := filepath.Join(root, "escape.pdf")
	if err := os.Symlink(outside, link); err != nil {
		if runtime.GOOS == "windows" {
			t.Skipf("symlink creation is unavailable on this Windows runner: %v", err)
		}
		t.Fatal(err)
	}

	if _, err := openAgreementPDFUnderRoot(root, "escape.pdf"); err == nil {
		t.Fatal("expected symlink escape to be rejected")
	}
}

func TestOpenAgreementPDFUnderRootRejectsDirectory(t *testing.T) {
	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, "agreements"), 0o755); err != nil {
		t.Fatal(err)
	}

	if _, err := openAgreementPDFUnderRoot(root, "agreements"); err == nil {
		t.Fatal("expected directory to be rejected")
	}
}

package filesystem

import (
	"context"
	"errors"
	"io"
	"os"
	"path/filepath"
	"testing"

	"github.com/axelfrache/paper/backend/internal/core/domain"
)

func TestImageStorageRoundTrip(t *testing.T) {
	storage, err := New(filepath.Join(t.TempDir(), "uploads"))
	if err != nil {
		t.Fatal(err)
	}
	upload := domain.ImageUpload{Name: "diagram.png", ContentType: "image/png", Data: []byte("image")}
	if err := storage.Put(context.Background(), "images/image.png", upload); err != nil {
		t.Fatal(err)
	}

	stored, err := storage.Open(context.Background(), "images/image.png")
	if err != nil {
		t.Fatal(err)
	}
	defer stored.Body.Close()
	data, err := io.ReadAll(stored.Body)
	if err != nil {
		t.Fatal(err)
	}
	if string(data) != "image" {
		t.Fatalf("unexpected image data %q", data)
	}
	if stored.ContentType != "image/png" || stored.Size != int64(len(upload.Data)) {
		t.Fatalf("unexpected stored image: %#v", stored)
	}

	if err := storage.Delete(context.Background(), "images/image.png"); err != nil {
		t.Fatal(err)
	}
	_, err = storage.Open(context.Background(), "images/image.png")
	var appErr *domain.AppError
	if !errors.As(err, &appErr) || appErr.Kind != domain.KindNotFound {
		t.Fatalf("expected not found error, got %v", err)
	}
}

func TestImageStorageRejectsKeysOutsideRoot(t *testing.T) {
	root := t.TempDir()
	storage, err := New(filepath.Join(root, "uploads"))
	if err != nil {
		t.Fatal(err)
	}
	if err := storage.Put(context.Background(), "../outside.png", domain.ImageUpload{Data: []byte("image")}); err == nil {
		t.Fatal("expected traversal key to be rejected")
	}
	if _, err := os.Stat(filepath.Join(root, "outside.png")); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("unexpected file outside storage root: %v", err)
	}
}

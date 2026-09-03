package service

import (
	"context"
	"io"
	"strings"
	"testing"

	"github.com/axelfrache/paper/backend/internal/adapter/outbound/memory"
	"github.com/axelfrache/paper/backend/internal/core/domain"
	"github.com/axelfrache/paper/backend/internal/core/port"
)

type imageStorageStub struct {
	key    string
	upload domain.ImageUpload
}

func (s *imageStorageStub) Delete(_ context.Context, key string) error {
	s.key = key
	return nil
}

func (s *imageStorageStub) Put(_ context.Context, key string, upload domain.ImageUpload) error {
	s.key = key
	s.upload = upload
	return nil
}

func (s *imageStorageStub) Open(_ context.Context, _ string) (port.StoredImage, error) {
	return port.StoredImage{Body: io.NopCloser(strings.NewReader("image")), ContentType: "image/png", Size: 5}, nil
}

func TestImageUploadStoresImageForExistingNote(t *testing.T) {
	repo := memory.NewNoteRepository()
	ctx := domain.ContextWithUser(context.Background(), domain.User{ID: "user-1"})
	note, err := repo.Create(ctx, "user-1", domain.NoteDraft{Title: "Architecture"})
	if err != nil {
		t.Fatal(err)
	}
	storage := &imageStorageStub{}
	service := NewImage(repo, repo, storage)
	png := []byte{0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52}

	image, err := service.Upload(ctx, note.ID, domain.ImageUpload{Name: "diagram.png", ContentType: "image/png", Data: png})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(storage.key, "images/") {
		t.Fatalf("unexpected storage key %q", storage.key)
	}
	if image.URL != "/api/images/"+image.ID {
		t.Fatalf("unexpected image URL %q", image.URL)
	}
	if image.ContentType != "image/png" || storage.upload.ContentType != "image/png" {
		t.Fatalf("unexpected content type %q", image.ContentType)
	}
}

func TestImageUploadRejectsUnsupportedContent(t *testing.T) {
	repo := memory.NewNoteRepository()
	ctx := domain.ContextWithUser(context.Background(), domain.User{ID: "user-1"})
	note, err := repo.Create(ctx, "user-1", domain.NoteDraft{})
	if err != nil {
		t.Fatal(err)
	}
	service := NewImage(repo, repo, &imageStorageStub{})

	_, err = service.Upload(ctx, note.ID, domain.ImageUpload{Name: "payload.txt", ContentType: "text/plain", Data: []byte("not an image")})
	if err == nil {
		t.Fatal("expected unsupported image to be rejected")
	}
}

func TestImageAccessIsScopedToItsOwner(t *testing.T) {
	repo := memory.NewNoteRepository()
	owner := domain.ContextWithUser(context.Background(), domain.User{ID: "user-1"})
	other := domain.ContextWithUser(context.Background(), domain.User{ID: "user-2"})
	note, err := repo.Create(owner, "user-1", domain.NoteDraft{})
	if err != nil {
		t.Fatal(err)
	}
	service := NewImage(repo, repo, &imageStorageStub{})
	png := []byte{0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52}
	image, err := service.Upload(owner, note.ID, domain.ImageUpload{Name: "private.png", ContentType: "image/png", Data: png})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := service.Open(other, image.ID); err == nil {
		t.Fatal("another user can open the image")
	}
	if err := service.Delete(other, image.ID); err == nil {
		t.Fatal("another user can delete the image")
	}
}

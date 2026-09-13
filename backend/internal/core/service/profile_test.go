package service

import (
	"context"
	"testing"

	"github.com/axelfrache/paper/backend/internal/core/domain"
)

type profileRepoStub struct {
	profiles map[string]domain.UserProfile
}

func newProfileRepoStub() *profileRepoStub {
	return &profileRepoStub{profiles: make(map[string]domain.UserProfile)}
}

func (r *profileRepoStub) Get(_ context.Context, userID string) (domain.UserProfile, error) {
	profile, ok := r.profiles[userID]
	if !ok {
		return domain.UserProfile{}, domain.NewNotFoundError("Profile was not found.")
	}
	return profile, nil
}

func (r *profileRepoStub) Upsert(_ context.Context, profile domain.UserProfile) error {
	r.profiles[profile.UserID] = profile
	return nil
}

func pngBytes() []byte {
	return []byte{0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52}
}

func TestProfileSetsDisplayName(t *testing.T) {
	ctx := domain.ContextWithUser(context.Background(), domain.User{ID: "user-1"})
	service := NewProfile(newProfileRepoStub(), &imageStorageStub{})

	profile, err := service.SetDisplayName(ctx, "  Ada  ")
	if err != nil {
		t.Fatal(err)
	}
	if profile.DisplayName != "Ada" {
		t.Fatalf("unexpected display name %q", profile.DisplayName)
	}
	stored, err := service.Get(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if stored.DisplayName != "Ada" {
		t.Fatalf("display name was not persisted: %q", stored.DisplayName)
	}
}

func TestProfileSetAndRemoveAvatar(t *testing.T) {
	ctx := domain.ContextWithUser(context.Background(), domain.User{ID: "user-1"})
	storage := &imageStorageStub{}
	service := NewProfile(newProfileRepoStub(), storage)

	profile, err := service.SetAvatar(ctx, domain.ImageUpload{Name: "me.png", ContentType: "image/png", Data: pngBytes()})
	if err != nil {
		t.Fatal(err)
	}
	if profile.AvatarKey == "" || profile.AvatarContentType != "image/png" {
		t.Fatalf("unexpected avatar profile: %#v", profile)
	}
	if storage.key != profile.AvatarKey {
		t.Fatalf("avatar was not stored under the profile key: %q vs %q", storage.key, profile.AvatarKey)
	}

	cleared, err := service.RemoveAvatar(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if cleared.AvatarKey != "" || cleared.AvatarContentType != "" {
		t.Fatalf("avatar was not cleared: %#v", cleared)
	}
}

func TestProfileRejectsNonRasterAvatar(t *testing.T) {
	ctx := domain.ContextWithUser(context.Background(), domain.User{ID: "user-1"})
	service := NewProfile(newProfileRepoStub(), &imageStorageStub{})

	svg := []byte(`<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>`)
	if _, err := service.SetAvatar(ctx, domain.ImageUpload{Name: "x.svg", ContentType: "image/svg+xml", Data: svg}); err == nil {
		t.Fatal("expected an SVG avatar to be rejected")
	}
}

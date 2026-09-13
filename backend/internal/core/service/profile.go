package service

import (
	"context"
	"errors"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/axelfrache/paper/backend/internal/core/domain"
	"github.com/axelfrache/paper/backend/internal/core/port"
)

const MaxAvatarBytes int64 = 2 << 20

var avatarAllowedTypes = map[string]bool{
	"image/png":  true,
	"image/jpeg": true,
	"image/gif":  true,
	"image/webp": true,
}

var avatarKeyUnsafe = regexp.MustCompile(`[^a-zA-Z0-9_-]`)

type Profile struct {
	profiles port.UserProfileRepository
	storage  port.ImageStorage
	now      func() time.Time
}

func NewProfile(profiles port.UserProfileRepository, storage port.ImageStorage) *Profile {
	return &Profile{profiles: profiles, storage: storage, now: time.Now}
}

func (s *Profile) Get(ctx context.Context) (domain.UserProfile, error) {
	user, err := domain.RequireUser(ctx)
	if err != nil {
		return domain.UserProfile{}, err
	}
	return s.load(ctx, user.ID)
}

func (s *Profile) SetDisplayName(ctx context.Context, name string) (domain.UserProfile, error) {
	user, err := domain.RequireUser(ctx)
	if err != nil {
		return domain.UserProfile{}, err
	}
	trimmed := strings.TrimSpace(name)
	if len(trimmed) > 80 {
		return domain.UserProfile{}, domain.NewInvalidError("The display name is too long.")
	}
	profile, err := s.load(ctx, user.ID)
	if err != nil {
		return domain.UserProfile{}, err
	}
	profile.DisplayName = trimmed
	profile.UpdatedAt = s.now().UTC()
	if err := s.profiles.Upsert(ctx, profile); err != nil {
		return domain.UserProfile{}, err
	}
	return profile, nil
}

func (s *Profile) SetAvatar(ctx context.Context, upload domain.ImageUpload) (domain.UserProfile, error) {
	user, err := domain.RequireUser(ctx)
	if err != nil {
		return domain.UserProfile{}, err
	}
	if len(upload.Data) == 0 {
		return domain.UserProfile{}, domain.NewInvalidError("The image is empty.")
	}
	if int64(len(upload.Data)) > MaxAvatarBytes {
		return domain.UserProfile{}, &domain.AppError{Kind: domain.KindTooLarge, Message: "The avatar must be 2 MB or smaller."}
	}
	contentType := http.DetectContentType(upload.Data)
	if !avatarAllowedTypes[contentType] {
		return domain.UserProfile{}, &domain.AppError{Kind: domain.KindUnsupportedMedia, Message: "The avatar must be a PNG, JPEG, GIF or WebP image."}
	}
	profile, err := s.load(ctx, user.ID)
	if err != nil {
		return domain.UserProfile{}, err
	}
	key := avatarKey(user.ID)
	upload.ContentType = contentType
	upload.Name = "avatar"
	if err := s.storage.Put(ctx, key, upload); err != nil {
		return domain.UserProfile{}, err
	}
	profile.AvatarKey = key
	profile.AvatarContentType = contentType
	profile.UpdatedAt = s.now().UTC()
	if err := s.profiles.Upsert(ctx, profile); err != nil {
		return domain.UserProfile{}, err
	}
	return profile, nil
}

func (s *Profile) RemoveAvatar(ctx context.Context) (domain.UserProfile, error) {
	user, err := domain.RequireUser(ctx)
	if err != nil {
		return domain.UserProfile{}, err
	}
	profile, err := s.load(ctx, user.ID)
	if err != nil {
		return domain.UserProfile{}, err
	}
	if profile.AvatarKey != "" {
		if err := s.storage.Delete(ctx, profile.AvatarKey); err != nil {
			return domain.UserProfile{}, err
		}
	}
	profile.AvatarKey = ""
	profile.AvatarContentType = ""
	profile.UpdatedAt = s.now().UTC()
	if err := s.profiles.Upsert(ctx, profile); err != nil {
		return domain.UserProfile{}, err
	}
	return profile, nil
}

func (s *Profile) OpenAvatar(ctx context.Context) (port.StoredImage, error) {
	user, err := domain.RequireUser(ctx)
	if err != nil {
		return port.StoredImage{}, err
	}
	profile, err := s.load(ctx, user.ID)
	if err != nil {
		return port.StoredImage{}, err
	}
	if profile.AvatarKey == "" {
		return port.StoredImage{}, domain.NewNotFoundError("No avatar is set.")
	}
	stored, err := s.storage.Open(ctx, profile.AvatarKey)
	if err != nil {
		return port.StoredImage{}, err
	}
	stored.ContentType = profile.AvatarContentType
	stored.Name = "avatar"
	return stored, nil
}

func (s *Profile) load(ctx context.Context, userID string) (domain.UserProfile, error) {
	profile, err := s.profiles.Get(ctx, userID)
	if err != nil {
		var appErr *domain.AppError
		if errors.As(err, &appErr) && appErr.Kind == domain.KindNotFound {
			return domain.UserProfile{UserID: userID}, nil
		}
		return domain.UserProfile{}, err
	}
	return profile, nil
}

func avatarKey(userID string) string {
	return "avatars/" + avatarKeyUnsafe.ReplaceAllString(userID, "-")
}

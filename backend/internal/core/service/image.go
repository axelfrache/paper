package service

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"mime"
	"net/http"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/axelfrache/paper/backend/internal/core/domain"
	"github.com/axelfrache/paper/backend/internal/core/port"
)

const MaxImageBytes int64 = 8 << 20

var imageIDPattern = regexp.MustCompile(`^[a-f0-9]{32}\.(?:png|jpg|gif|webp|svg)$`)

var allowedImageTypes = map[string]string{
	"image/png":     ".png",
	"image/jpeg":    ".jpg",
	"image/gif":     ".gif",
	"image/webp":    ".webp",
	"image/svg+xml": ".svg",
}

type Image struct {
	repo    port.NoteRepository
	storage port.ImageStorage
}

func NewImage(repo port.NoteRepository, storage port.ImageStorage) *Image {
	return &Image{repo: repo, storage: storage}
}

func (s *Image) Upload(ctx context.Context, noteID string, upload domain.ImageUpload) (domain.NoteImage, error) {
	if _, err := s.repo.GetByID(ctx, noteID); err != nil {
		return domain.NoteImage{}, err
	}
	if len(upload.Data) == 0 {
		return domain.NoteImage{}, domain.NewInvalidError("The image is empty.")
	}
	if int64(len(upload.Data)) > MaxImageBytes {
		return domain.NoteImage{}, &domain.AppError{Kind: domain.KindTooLarge, Message: "The image must be 8 MB or smaller."}
	}

	contentType := normalizeImageContentType(upload.ContentType, upload.Data)
	extension, ok := allowedImageTypes[contentType]
	if !ok {
		return domain.NoteImage{}, &domain.AppError{Kind: domain.KindUnsupportedMedia, Message: "The selected file is not a supported image."}
	}

	id, err := newImageID(extension)
	if err != nil {
		return domain.NoteImage{}, fmt.Errorf("generate image id: %w", err)
	}
	name := cleanImageName(upload.Name, extension)
	upload.Name = name
	upload.ContentType = contentType
	if err := s.storage.Put(ctx, imageKey(id), upload); err != nil {
		return domain.NoteImage{}, fmt.Errorf("store image: %w", err)
	}

	return domain.NoteImage{
		ID:          id,
		Name:        name,
		ContentType: contentType,
		Size:        int64(len(upload.Data)),
		URL:         "/api/images/" + id,
	}, nil
}

func (s *Image) Open(ctx context.Context, imageID string) (port.StoredImage, error) {
	if !imageIDPattern.MatchString(imageID) {
		return port.StoredImage{}, domain.NewNotFoundError("Image was not found.")
	}
	return s.storage.Open(ctx, imageKey(imageID))
}

func (s *Image) Delete(ctx context.Context, imageID string) error {
	if !imageIDPattern.MatchString(imageID) {
		return domain.NewNotFoundError("Image was not found.")
	}
	return s.storage.Delete(ctx, imageKey(imageID))
}

func normalizeImageContentType(claimed string, data []byte) string {
	claimed, _, _ = mime.ParseMediaType(claimed)
	claimed = strings.ToLower(claimed)
	detected := http.DetectContentType(data)
	if claimed == "image/svg+xml" && looksLikeSVG(data) {
		return claimed
	}
	if _, ok := allowedImageTypes[detected]; ok {
		return detected
	}
	return ""
}

func looksLikeSVG(data []byte) bool {
	head := strings.ToLower(strings.TrimSpace(string(data[:min(len(data), 512)])))
	return strings.HasPrefix(head, "<svg") || (strings.HasPrefix(head, "<?xml") && strings.Contains(head, "<svg"))
}

func cleanImageName(name, extension string) string {
	name = filepath.Base(strings.TrimSpace(name))
	if name == "." || name == "" {
		return "image" + extension
	}
	return name
}

func newImageID(extension string) (string, error) {
	bytes := make([]byte, 16)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return hex.EncodeToString(bytes) + extension, nil
}

func imageKey(imageID string) string {
	return "images/" + imageID
}

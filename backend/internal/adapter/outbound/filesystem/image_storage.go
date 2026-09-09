package filesystem

import (
	"context"
	"errors"
	"fmt"
	"mime"
	"os"
	"path/filepath"
	"strings"

	"github.com/axelfrache/paper/backend/internal/core/domain"
	"github.com/axelfrache/paper/backend/internal/core/port"
)

type ImageStorage struct {
	root string
}

func New(root string) (*ImageStorage, error) {
	root = strings.TrimSpace(root)
	if root == "" {
		return nil, errors.New("local storage path is required")
	}
	absRoot, err := filepath.Abs(root)
	if err != nil {
		return nil, fmt.Errorf("resolve local storage path: %w", err)
	}
	if err := os.MkdirAll(absRoot, 0o750); err != nil {
		return nil, fmt.Errorf("create local storage path: %w", err)
	}
	info, err := os.Stat(absRoot)
	if err != nil {
		return nil, fmt.Errorf("inspect local storage path: %w", err)
	}
	if !info.IsDir() {
		return nil, errors.New("local storage path is not a directory")
	}
	return &ImageStorage{root: absRoot}, nil
}

func (s *ImageStorage) Put(ctx context.Context, key string, upload domain.ImageUpload) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	path, err := s.resolve(key)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o750); err != nil {
		return fmt.Errorf("create image directory: %w", err)
	}
	file, err := os.CreateTemp(filepath.Dir(path), ".paper-upload-*")
	if err != nil {
		return fmt.Errorf("create image file: %w", err)
	}
	tempPath := file.Name()
	defer os.Remove(tempPath)
	defer file.Close()

	if err := file.Chmod(0o640); err != nil {
		return fmt.Errorf("set image permissions: %w", err)
	}
	if _, err := file.Write(upload.Data); err != nil {
		return fmt.Errorf("write image: %w", err)
	}
	if err := file.Sync(); err != nil {
		return fmt.Errorf("sync image: %w", err)
	}
	if err := file.Close(); err != nil {
		return fmt.Errorf("close image: %w", err)
	}
	if err := os.Rename(tempPath, path); err != nil {
		return fmt.Errorf("store image: %w", err)
	}
	return nil
}

func (s *ImageStorage) Open(ctx context.Context, key string) (port.StoredImage, error) {
	if err := ctx.Err(); err != nil {
		return port.StoredImage{}, err
	}
	path, err := s.resolve(key)
	if err != nil {
		return port.StoredImage{}, err
	}
	file, err := os.Open(path)
	if errors.Is(err, os.ErrNotExist) {
		return port.StoredImage{}, domain.NewNotFoundError("Image was not found.")
	}
	if err != nil {
		return port.StoredImage{}, err
	}
	info, err := file.Stat()
	if err != nil {
		file.Close()
		return port.StoredImage{}, err
	}
	return port.StoredImage{
		Body:        file,
		Name:        filepath.Base(path),
		ContentType: mime.TypeByExtension(filepath.Ext(path)),
		Size:        info.Size(),
	}, nil
}

func (s *ImageStorage) Delete(ctx context.Context, key string) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	path, err := s.resolve(key)
	if err != nil {
		return err
	}
	if err := os.Remove(path); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	return nil
}

func (s *ImageStorage) resolve(key string) (string, error) {
	clean := filepath.Clean(filepath.FromSlash(strings.TrimSpace(key)))
	if clean == "." || filepath.IsAbs(clean) || clean == ".." || strings.HasPrefix(clean, ".."+string(filepath.Separator)) {
		return "", errors.New("invalid local storage key")
	}
	return filepath.Join(s.root, clean), nil
}

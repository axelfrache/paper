package config

import "testing"

func TestStorageDefaultsToFilesystem(t *testing.T) {
	t.Setenv("STORAGE_PROVIDER", "")
	t.Setenv("FILESYSTEM_STORAGE_PATH", "")
	cfg := Load()
	if cfg.StorageProvider != "filesystem" {
		t.Fatalf("unexpected storage provider %q", cfg.StorageProvider)
	}
	if cfg.FilesystemStoragePath != "data/uploads" {
		t.Fatalf("unexpected filesystem storage path %q", cfg.FilesystemStoragePath)
	}
}

func TestStorageProviderIsNormalized(t *testing.T) {
	t.Setenv("STORAGE_PROVIDER", " S3 ")
	t.Setenv("FILESYSTEM_STORAGE_PATH", "/tmp/paper-images")
	cfg := Load()
	if cfg.StorageProvider != "s3" {
		t.Fatalf("unexpected storage provider %q", cfg.StorageProvider)
	}
	if cfg.FilesystemStoragePath != "/tmp/paper-images" {
		t.Fatalf("unexpected filesystem storage path %q", cfg.FilesystemStoragePath)
	}
}

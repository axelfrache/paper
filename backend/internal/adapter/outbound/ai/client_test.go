package ai

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/axelfrache/paper/backend/internal/core/domain"
)

func appError(t *testing.T, err error) *domain.AppError {
	t.Helper()
	var appErr *domain.AppError
	if !errors.As(err, &appErr) {
		t.Fatalf("expected an *domain.AppError, got %v", err)
	}
	return appErr
}

// A provider that answers slowly must not be reported as unreachable: the two need
// different fixes, and the wrong message sends debugging the wrong way.
func TestGenerateReportsATimeoutSeparatelyFromAnUnreachableService(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(150 * time.Millisecond)
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	client := New(Config{Provider: "ai-gateway", BaseURL: server.URL, APIKey: "k", Model: "test", Timeout: 20 * time.Millisecond})
	_, err := client.Generate(context.Background(), "draw something")

	appErr := appError(t, err)
	if appErr.Status != http.StatusGatewayTimeout {
		t.Fatalf("status = %d, want %d", appErr.Status, http.StatusGatewayTimeout)
	}
	if appErr.Message != "The AI service took too long to respond." {
		t.Fatalf("message = %q", appErr.Message)
	}
}

func TestGenerateReportsAnUnreachableService(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	url := server.URL
	server.Close()

	client := New(Config{Provider: "ai-gateway", BaseURL: url, APIKey: "k", Model: "test"})
	_, err := client.Generate(context.Background(), "draw something")

	appErr := appError(t, err)
	if appErr.Status != http.StatusBadGateway {
		t.Fatalf("status = %d, want %d", appErr.Status, http.StatusBadGateway)
	}
	if appErr.Message != "The AI service is currently unreachable." {
		t.Fatalf("message = %q", appErr.Message)
	}
}

func TestNewFallsBackToTheDefaultTimeout(t *testing.T) {
	if got := New(Config{}).http.Timeout; got != DefaultTimeout {
		t.Fatalf("timeout = %v, want %v", got, DefaultTimeout)
	}
	if got := New(Config{Timeout: 5 * time.Second}).http.Timeout; got != 5*time.Second {
		t.Fatalf("timeout = %v, want 5s", got)
	}
}

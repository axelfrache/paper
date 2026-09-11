package http

import (
	stdhttp "net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestRateLimiterAllowsBurstThenBlocksAndRefills(t *testing.T) {
	now := time.Unix(0, 0)
	limiter := newRateLimiter(60, 3)
	limiter.now = func() time.Time { return now }

	for i := 0; i < 3; i++ {
		if ok, _ := limiter.allow("k"); !ok {
			t.Fatalf("request %d within the burst should be allowed", i+1)
		}
	}
	ok, retryAfter := limiter.allow("k")
	if ok {
		t.Fatal("request beyond the burst should be blocked")
	}
	if retryAfter <= 0 {
		t.Fatalf("expected a positive retry-after, got %v", retryAfter)
	}

	now = now.Add(time.Second)
	if ok, _ := limiter.allow("k"); !ok {
		t.Fatal("a token should have refilled after one second at 60/min")
	}
}

func TestRateLimiterIsolatesKeys(t *testing.T) {
	limiter := newRateLimiter(60, 1)
	if ok, _ := limiter.allow("a"); !ok {
		t.Fatal("first key should be allowed")
	}
	if ok, _ := limiter.allow("b"); !ok {
		t.Fatal("a different key must have its own bucket")
	}
}

func TestRateLimitMiddlewareBlocksOverTheLimit(t *testing.T) {
	limiter := newRateLimiter(60, 1)
	next := stdhttp.HandlerFunc(func(w stdhttp.ResponseWriter, _ *stdhttp.Request) {
		w.WriteHeader(stdhttp.StatusOK)
	})
	handler := rateLimit(limiter, func(_ *stdhttp.Request) string { return "client" }, next)

	first := httptest.NewRecorder()
	handler.ServeHTTP(first, httptest.NewRequest(stdhttp.MethodPost, "/api/auth/login", nil))
	if first.Code != stdhttp.StatusOK {
		t.Fatalf("first request should pass, got %d", first.Code)
	}

	second := httptest.NewRecorder()
	handler.ServeHTTP(second, httptest.NewRequest(stdhttp.MethodPost, "/api/auth/login", nil))
	if second.Code != stdhttp.StatusTooManyRequests {
		t.Fatalf("second request should be rate limited, got %d", second.Code)
	}
	if second.Header().Get("Retry-After") == "" {
		t.Fatal("a rate limited response must carry a Retry-After header")
	}
}

func TestRateLimitDisabledIsNoop(t *testing.T) {
	next := stdhttp.HandlerFunc(func(w stdhttp.ResponseWriter, _ *stdhttp.Request) {
		w.WriteHeader(stdhttp.StatusOK)
	})
	handler := rateLimit(nil, func(_ *stdhttp.Request) string { return "client" }, next)
	for i := 0; i < 10; i++ {
		recorder := httptest.NewRecorder()
		handler.ServeHTTP(recorder, httptest.NewRequest(stdhttp.MethodPost, "/api/auth/login", nil))
		if recorder.Code != stdhttp.StatusOK {
			t.Fatalf("a nil limiter must not block, got %d", recorder.Code)
		}
	}
}

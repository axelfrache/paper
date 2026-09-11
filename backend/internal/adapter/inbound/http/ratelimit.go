package http

import (
	"net"
	stdhttp "net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/axelfrache/paper/backend/internal/core/domain"
)

type RateLimitConfig struct {
	Enabled       bool
	TrustProxy    bool
	AuthPerMinute int
	AuthBurst     int
	AIPerMinute   int
	AIBurst       int
	APIPerMinute  int
	APIBurst      int
}

type tokenBucket struct {
	tokens float64
	last   time.Time
}

type rateLimiter struct {
	mu        sync.Mutex
	buckets   map[string]*tokenBucket
	rate      float64
	burst     float64
	now       func() time.Time
	lastSweep time.Time
}

func newRateLimiter(perMinute, burst int) *rateLimiter {
	if perMinute <= 0 || burst <= 0 {
		return nil
	}
	return &rateLimiter{
		buckets: make(map[string]*tokenBucket),
		rate:    float64(perMinute) / 60.0,
		burst:   float64(burst),
		now:     time.Now,
	}
}

func (l *rateLimiter) allow(key string) (bool, time.Duration) {
	l.mu.Lock()
	defer l.mu.Unlock()

	now := l.now()
	l.sweep(now)

	bucket, ok := l.buckets[key]
	if !ok {
		bucket = &tokenBucket{tokens: l.burst, last: now}
		l.buckets[key] = bucket
	}

	elapsed := now.Sub(bucket.last).Seconds()
	if elapsed > 0 {
		bucket.tokens = min(l.burst, bucket.tokens+elapsed*l.rate)
		bucket.last = now
	}

	if bucket.tokens >= 1 {
		bucket.tokens -= 1
		return true, 0
	}

	retryAfter := time.Duration((1 - bucket.tokens) / l.rate * float64(time.Second))
	return false, retryAfter
}

func (l *rateLimiter) sweep(now time.Time) {
	if now.Sub(l.lastSweep) < 5*time.Minute {
		return
	}
	l.lastSweep = now
	for key, bucket := range l.buckets {
		if now.Sub(bucket.last) > 10*time.Minute {
			delete(l.buckets, key)
		}
	}
}

func rejectRateLimited(w stdhttp.ResponseWriter, retryAfter time.Duration) {
	seconds := int(retryAfter.Seconds())
	if seconds < 1 {
		seconds = 1
	}
	w.Header().Set("Retry-After", strconv.Itoa(seconds))
	writeError(w, domain.NewRateLimitedError("Too many requests. Please slow down."))
}

func rateLimit(limiter *rateLimiter, keyFn func(*stdhttp.Request) string, next stdhttp.Handler) stdhttp.Handler {
	if limiter == nil {
		return next
	}
	return stdhttp.HandlerFunc(func(w stdhttp.ResponseWriter, r *stdhttp.Request) {
		key := keyFn(r)
		if key == "" {
			next.ServeHTTP(w, r)
			return
		}
		if ok, retryAfter := limiter.allow(key); !ok {
			rejectRateLimited(w, retryAfter)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func rateLimitAPI(limiter *rateLimiter, ipFn func(*stdhttp.Request) string, next stdhttp.Handler) stdhttp.Handler {
	if limiter == nil {
		return next
	}
	return stdhttp.HandlerFunc(func(w stdhttp.ResponseWriter, r *stdhttp.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/") && r.URL.Path != "/api/health" {
			if ok, retryAfter := limiter.allow(ipFn(r)); !ok {
				rejectRateLimited(w, retryAfter)
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

func clientIPFunc(trustProxy bool) func(*stdhttp.Request) string {
	return func(r *stdhttp.Request) string {
		if trustProxy {
			if forwarded := r.Header.Get("X-Forwarded-For"); forwarded != "" {
				return strings.TrimSpace(strings.Split(forwarded, ",")[0])
			}
			if realIP := strings.TrimSpace(r.Header.Get("X-Real-Ip")); realIP != "" {
				return realIP
			}
		}
		host, _, err := net.SplitHostPort(r.RemoteAddr)
		if err != nil {
			return r.RemoteAddr
		}
		return host
	}
}

func userKey(r *stdhttp.Request) string {
	if user, ok := domain.UserFromContext(r.Context()); ok {
		return user.ID
	}
	return ""
}

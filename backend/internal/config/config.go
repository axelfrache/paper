package config

import (
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Port           string
	DatabaseURL    string
	AIProvider     string
	AIBaseURL      string
	AIAPIKey       string
	AIModel        string
	AITimeout      time.Duration
	S3Endpoint     string
	S3AccessKey    string
	S3SecretKey    string
	S3Bucket       string
	S3Region       string
	AllowedOrigins []string
}

func Load() Config {
	provider := getEnv("AI_PROVIDER", "ai-gateway")
	return Config{
		Port:           getEnv("PORT", "8080"),
		DatabaseURL:    getEnv("DATABASE_URL", "postgres://paper:paper@postgres:5432/paper?sslmode=disable"),
		AIProvider:     provider,
		AIBaseURL:      defaultBaseURL(provider),
		AIAPIKey:       getEnv("AI_API_KEY", os.Getenv("AI_GATEWAY_API_KEY")),
		AIModel:        getEnv("AI_MODEL", getEnv("AI_GATEWAY_MODEL", defaultModel(provider))),
		AITimeout:      getDuration("AI_TIMEOUT_SECONDS", 120*time.Second),
		S3Endpoint:     getEnv("S3_ENDPOINT", "http://localhost:3902"),
		S3AccessKey:    getEnv("S3_ACCESS_KEY", getEnv("GARAGE_ACCESS_KEY_ID", "GK31c2f27ecc0e4d0c1928e5fa")),
		S3SecretKey:    getEnv("S3_SECRET_KEY", getEnv("GARAGE_SECRET_ACCESS_KEY", "7d37e5a2f7c18b4e9d5f6a2c3b4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e")),
		S3Bucket:       getEnv("S3_BUCKET", "paper-images"),
		S3Region:       getEnv("S3_REGION", "garage"),
		AllowedOrigins: splitOrigins(getEnv("ALLOWED_ORIGINS", "http://localhost:5173")),
	}
}

func (c Config) Addr() string {
	return ":" + c.Port
}

func getEnv(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}

// getDuration reads a whole number of seconds, falling back when unset or unusable.
func getDuration(key string, fallback time.Duration) time.Duration {
	seconds, err := strconv.Atoi(getEnv(key, ""))
	if err != nil || seconds <= 0 {
		return fallback
	}
	return time.Duration(seconds) * time.Second
}

func defaultBaseURL(provider string) string {
	switch provider {
	case "ollama":
		return getEnv("AI_BASE_URL", "http://localhost:11434")
	case "openai-compatible":
		return getEnv("AI_BASE_URL", "http://localhost:11434/v1")
	default:
		return getEnv("AI_BASE_URL", getEnv("AI_GATEWAY_URL", "http://ai-gateway.ai.svc.cluster.local:8080"))
	}
}

func defaultModel(provider string) string {
	switch provider {
	case "ollama":
		return "llama3.1"
	case "openai-compatible":
		return "llama3.1"
	default:
		return "ai-gateway:json"
	}
}

func splitOrigins(raw string) []string {
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out
}

package config

import (
	"os"
	"strings"
)

type Config struct {
	Port           string
	DatabaseURL    string
	AIProvider     string
	AIBaseURL      string
	AIAPIKey       string
	AIModel        string
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

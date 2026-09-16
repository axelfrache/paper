package http

import (
	"testing"
	"time"

	"github.com/axelfrache/paper/backend/internal/core/domain"
)

func TestUserResponseUsesProfileNameAndAvatarVersion(t *testing.T) {
	profileTime := time.Unix(1700000000, 123456789)
	response := userResponse(
		domain.User{ID: "keycloak-subject", Name: "Keycloak name", Email: "user@example.com"},
		domain.UserProfile{DisplayName: "Paper name", AvatarKey: "avatars/keycloak-subject", UpdatedAt: profileTime},
	)

	if response["name"] != "Paper name" {
		t.Fatalf("unexpected display name %v", response["name"])
	}
	if response["avatarUrl"] != "/api/profile/avatar?v=1700000000123456789" {
		t.Fatalf("unexpected avatar URL %v", response["avatarUrl"])
	}
}

func TestUserResponseFallsBackToIdentityName(t *testing.T) {
	response := userResponse(
		domain.User{Name: "Keycloak name"},
		domain.UserProfile{},
	)

	if response["name"] != "Keycloak name" {
		t.Fatalf("unexpected display name %v", response["name"])
	}
	if response["avatarUrl"] != nil {
		t.Fatalf("unexpected avatar URL %v", response["avatarUrl"])
	}
}

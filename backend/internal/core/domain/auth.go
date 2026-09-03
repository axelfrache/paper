package domain

import (
	"context"
	"time"
)

type User struct {
	ID    string
	Email string
	Name  string
	Roles []string
}

func (u User) IsAdmin() bool {
	for _, role := range u.Roles {
		if role == "paper-admin" {
			return true
		}
	}
	return false
}

type IdentityTokens struct {
	AccessToken  string
	RefreshToken string
	IDToken      string
	Expiry       time.Time
}

type Session struct {
	ID            string
	User          User
	TokenEnvelope string
	ExpiresAt     time.Time
	CreatedAt     time.Time
	UpdatedAt     time.Time
}

type LoginStart struct {
	URL        string
	StateToken string
}

type LoginResult struct {
	SessionToken string
	ReturnTo     string
	User         User
}

type AuthConfig struct {
	Provider            string
	RegistrationEnabled bool
}

type userContextKey struct{}

func ContextWithUser(ctx context.Context, user User) context.Context {
	return context.WithValue(ctx, userContextKey{}, user)
}

func UserFromContext(ctx context.Context) (User, bool) {
	user, ok := ctx.Value(userContextKey{}).(User)
	return user, ok && user.ID != ""
}

func RequireUser(ctx context.Context) (User, error) {
	user, ok := UserFromContext(ctx)
	if !ok {
		return User{}, NewUnauthorizedError("Authentication is required.")
	}
	return user, nil
}

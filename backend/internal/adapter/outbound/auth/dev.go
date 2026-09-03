package auth

import (
	"context"
	"net/url"

	"github.com/axelfrache/paper/backend/internal/core/domain"
)

type Dev struct {
	user domain.User
}

func NewDev(user domain.User) *Dev {
	return &Dev{user: user}
}

func (d *Dev) Name() string {
	return "dev"
}

func (d *Dev) AuthorizationURL(state, _, _ string, _ bool) string {
	values := url.Values{"state": {state}, "code": {"dev"}}
	return "/api/auth/callback?" + values.Encode()
}

func (d *Dev) Exchange(_ context.Context, _, _, _ string) (domain.User, domain.IdentityTokens, error) {
	return d.user, domain.IdentityTokens{}, nil
}

func (d *Dev) Refresh(_ context.Context, tokens domain.IdentityTokens) (domain.IdentityTokens, error) {
	return tokens, nil
}

func (d *Dev) LogoutURL(_, returnTo string) string {
	return returnTo
}

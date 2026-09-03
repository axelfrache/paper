package service

import (
	"context"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/axelfrache/paper/backend/internal/core/domain"
)

type authProviderStub struct {
	tokens    domain.IdentityTokens
	user      domain.User
	refreshed int
}

func (p *authProviderStub) Name() string {
	return "oidc"
}

func (p *authProviderStub) AuthorizationURL(state, nonce, codeChallenge string, register bool) string {
	query := url.Values{
		"state": {state}, "nonce": {nonce}, "code_challenge": {codeChallenge},
	}
	if register {
		query.Set("register", "true")
	}
	return "https://identity.example/auth?" + query.Encode()
}

func (p *authProviderStub) Exchange(_ context.Context, _, _, _ string) (domain.User, domain.IdentityTokens, error) {
	return p.user, p.tokens, nil
}

func (p *authProviderStub) Refresh(_ context.Context, tokens domain.IdentityTokens) (domain.IdentityTokens, error) {
	p.refreshed++
	tokens.AccessToken = "refreshed-access"
	tokens.Expiry = time.Now().Add(time.Hour)
	return tokens, nil
}

func (p *authProviderStub) LogoutURL(_, returnTo string) string {
	return "https://identity.example/logout?returnTo=" + url.QueryEscape(returnTo)
}

type sessionRepositoryStub struct {
	sessions map[string]domain.Session
}

func newSessionRepositoryStub() *sessionRepositoryStub {
	return &sessionRepositoryStub{sessions: make(map[string]domain.Session)}
}

func (r *sessionRepositoryStub) Save(_ context.Context, session domain.Session) error {
	r.sessions[session.ID] = session
	return nil
}

func (r *sessionRepositoryStub) Get(_ context.Context, id string) (domain.Session, error) {
	session, ok := r.sessions[id]
	if !ok {
		return domain.Session{}, domain.NewNotFoundError("Session was not found.")
	}
	return session, nil
}

func (r *sessionRepositoryStub) Delete(_ context.Context, id string) error {
	delete(r.sessions, id)
	return nil
}

func TestAuthCompletesLoginAndRefreshesServerSideSession(t *testing.T) {
	provider := &authProviderStub{
		user: domain.User{ID: "user-1", Email: "user@example.com", Roles: []string{"paper-admin"}},
		tokens: domain.IdentityTokens{
			AccessToken: "access", RefreshToken: "refresh-secret", IDToken: "id-token",
			Expiry: time.Now().Add(30 * time.Second),
		},
	}
	repository := newSessionRepositoryStub()
	auth, err := NewAuth(provider, repository, AuthConfig{
		Secret: "test-secret", RegistrationEnabled: true, PostLogoutRedirectURL: "https://paper.example",
	})
	if err != nil {
		t.Fatal(err)
	}
	start, err := auth.BeginLogin(false, "/notes")
	if err != nil {
		t.Fatal(err)
	}
	loginURL, err := url.Parse(start.URL)
	if err != nil {
		t.Fatal(err)
	}
	result, err := auth.CompleteLogin(context.Background(), start.StateToken, loginURL.Query().Get("state"), "code")
	if err != nil {
		t.Fatal(err)
	}
	if result.ReturnTo != "/notes" || result.User.ID != "user-1" {
		t.Fatalf("unexpected login result: %#v", result)
	}
	stored := repository.sessions[hashToken(result.SessionToken)]
	if strings.Contains(stored.TokenEnvelope, "refresh-secret") {
		t.Fatal("refresh token was stored without encryption")
	}
	user, err := auth.Authenticate(context.Background(), result.SessionToken)
	if err != nil {
		t.Fatal(err)
	}
	if user.ID != "user-1" || provider.refreshed != 1 {
		t.Fatalf("unexpected authenticated user or refresh count: %#v %d", user, provider.refreshed)
	}
	logoutURL, err := auth.Logout(context.Background(), result.SessionToken)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(logoutURL, "https://identity.example/logout") {
		t.Fatalf("unexpected logout URL %q", logoutURL)
	}
}

func TestAuthRejectsRegistrationWhenDisabled(t *testing.T) {
	auth, err := NewAuth(&authProviderStub{}, newSessionRepositoryStub(), AuthConfig{Secret: "test", RegistrationEnabled: false})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := auth.BeginLogin(true, "/"); err == nil {
		t.Fatal("expected registration to be rejected")
	}
}

func TestAuthRejectsTamperedState(t *testing.T) {
	auth, err := NewAuth(&authProviderStub{user: domain.User{ID: "user-1"}}, newSessionRepositoryStub(), AuthConfig{Secret: "test"})
	if err != nil {
		t.Fatal(err)
	}
	start, err := auth.BeginLogin(false, "/")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := auth.CompleteLogin(context.Background(), start.StateToken, "wrong", "code"); err == nil {
		t.Fatal("expected mismatched state to be rejected")
	}
}

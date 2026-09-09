package service

import (
	"context"
	"testing"

	"github.com/axelfrache/paper/backend/internal/core/domain"
)

type credentialProviderStub struct {
	user          domain.User
	registerErr   error
	authErr       error
	registered    bool
	authenticated bool
}

func (p *credentialProviderStub) Register(_ context.Context, _, _, _ string) (domain.User, error) {
	if p.registerErr != nil {
		return domain.User{}, p.registerErr
	}
	p.registered = true
	return p.user, nil
}

func (p *credentialProviderStub) Authenticate(_ context.Context, _, _ string) (domain.User, error) {
	if p.authErr != nil {
		return domain.User{}, p.authErr
	}
	p.authenticated = true
	return p.user, nil
}

func TestCredentialAuthLogsInAndCreatesSession(t *testing.T) {
	provider := &credentialProviderStub{user: domain.User{ID: "user-1", Email: "person@example.com"}}
	sessions := newSessionRepositoryStub()
	auth, err := NewCredentialAuth("local", provider, sessions, AuthConfig{Secret: "test-secret", RegistrationEnabled: true})
	if err != nil {
		t.Fatal(err)
	}
	if auth.Config().Provider != "local" {
		t.Fatalf("unexpected provider name %q", auth.Config().Provider)
	}
	result, err := auth.LoginWithPassword(context.Background(), "person@example.com", "supersecret", "/notes")
	if err != nil {
		t.Fatal(err)
	}
	if !provider.authenticated || result.ReturnTo != "/notes" || result.User.ID != "user-1" {
		t.Fatalf("unexpected login result: %#v", result)
	}
	user, err := auth.Authenticate(context.Background(), result.SessionToken)
	if err != nil {
		t.Fatal(err)
	}
	if user.ID != "user-1" {
		t.Fatalf("session did not resolve to the user: %#v", user)
	}
}

func TestCredentialAuthRejectsRegistrationWhenDisabled(t *testing.T) {
	provider := &credentialProviderStub{user: domain.User{ID: "user-1"}}
	auth, err := NewCredentialAuth("local", provider, newSessionRepositoryStub(), AuthConfig{Secret: "test-secret", RegistrationEnabled: false})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := auth.RegisterWithPassword(context.Background(), "person@example.com", "Person", "supersecret", "/"); err == nil {
		t.Fatal("expected registration to be rejected")
	}
	if provider.registered {
		t.Fatal("registration should not have reached the provider")
	}
}

func TestCredentialAuthRejectsRedirectLogin(t *testing.T) {
	auth, err := NewCredentialAuth("local", &credentialProviderStub{}, newSessionRepositoryStub(), AuthConfig{Secret: "test-secret"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := auth.BeginLogin(false, "/"); err == nil {
		t.Fatal("expected redirect login to be unsupported for the local provider")
	}
}

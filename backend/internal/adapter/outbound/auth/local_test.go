package auth

import (
	"context"
	"testing"

	"github.com/axelfrache/paper/backend/internal/core/domain"
)

type userRepositoryStub struct {
	byEmail map[string]domain.UserRecord
	byID    map[string]string
}

func newUserRepositoryStub() *userRepositoryStub {
	return &userRepositoryStub{byEmail: make(map[string]domain.UserRecord), byID: make(map[string]string)}
}

func (r *userRepositoryStub) Create(_ context.Context, record domain.UserRecord) error {
	r.byEmail[record.Email] = record
	r.byID[record.ID] = record.Email
	return nil
}

func (r *userRepositoryStub) GetByEmail(_ context.Context, email string) (domain.UserRecord, error) {
	record, ok := r.byEmail[email]
	if !ok {
		return domain.UserRecord{}, domain.NewNotFoundError("User was not found.")
	}
	return record, nil
}

func (r *userRepositoryStub) SetRoles(_ context.Context, id string, roles []string) error {
	email, ok := r.byID[id]
	if !ok {
		return domain.NewNotFoundError("User was not found.")
	}
	record := r.byEmail[email]
	record.Roles = roles
	r.byEmail[email] = record
	return nil
}

func TestLocalRegistersThenAuthenticates(t *testing.T) {
	local := NewLocal(newUserRepositoryStub())
	created, err := local.Register(context.Background(), "  Person@Example.com ", "Person", "supersecret")
	if err != nil {
		t.Fatal(err)
	}
	if created.Email != "person@example.com" || created.ID == "" {
		t.Fatalf("unexpected registered user: %#v", created)
	}
	authed, err := local.Authenticate(context.Background(), "person@example.com", "supersecret")
	if err != nil {
		t.Fatal(err)
	}
	if authed.ID != created.ID {
		t.Fatalf("authenticated a different user: %#v", authed)
	}
}

func TestLocalRejectsWrongPassword(t *testing.T) {
	local := NewLocal(newUserRepositoryStub())
	if _, err := local.Register(context.Background(), "person@example.com", "Person", "supersecret"); err != nil {
		t.Fatal(err)
	}
	if _, err := local.Authenticate(context.Background(), "person@example.com", "wrongpass"); err == nil {
		t.Fatal("expected wrong password to be rejected")
	}
	if _, err := local.Authenticate(context.Background(), "missing@example.com", "supersecret"); err == nil {
		t.Fatal("expected unknown account to be rejected")
	}
}

func TestLocalRejectsShortPasswordAndDuplicate(t *testing.T) {
	local := NewLocal(newUserRepositoryStub())
	if _, err := local.Register(context.Background(), "person@example.com", "Person", "short"); err == nil {
		t.Fatal("expected short password to be rejected")
	}
	if _, err := local.Register(context.Background(), "person@example.com", "Person", "supersecret"); err != nil {
		t.Fatal(err)
	}
	if _, err := local.Register(context.Background(), "person@example.com", "Person", "supersecret"); err == nil {
		t.Fatal("expected duplicate email to be rejected")
	}
}

func TestLocalEnsureAdminIsIdempotentAndGrantsRole(t *testing.T) {
	local := NewLocal(newUserRepositoryStub())
	admin, err := local.EnsureAdmin(context.Background(), "admin@example.com", "Admin", "supersecret")
	if err != nil {
		t.Fatal(err)
	}
	if !admin.IsAdmin() {
		t.Fatalf("expected admin role, got %#v", admin.Roles)
	}
	again, err := local.EnsureAdmin(context.Background(), "admin@example.com", "Admin", "supersecret")
	if err != nil {
		t.Fatal(err)
	}
	if again.ID != admin.ID || !again.IsAdmin() {
		t.Fatalf("ensure admin was not idempotent: %#v", again)
	}
	authed, err := local.Authenticate(context.Background(), "admin@example.com", "supersecret")
	if err != nil {
		t.Fatal(err)
	}
	if !authed.IsAdmin() {
		t.Fatalf("expected authenticated admin to keep the role: %#v", authed)
	}
}

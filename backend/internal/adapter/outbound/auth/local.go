package auth

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"strings"
	"time"

	"github.com/axelfrache/paper/backend/internal/core/domain"
	"github.com/axelfrache/paper/backend/internal/core/port"
	"golang.org/x/crypto/bcrypt"
)

const minPasswordLength = 8

type Local struct {
	users port.UserRepository
	now   func() time.Time
}

func NewLocal(users port.UserRepository) *Local {
	return &Local{users: users, now: time.Now}
}

func (l *Local) Register(ctx context.Context, email, name, password string) (domain.User, error) {
	normalizedEmail, err := normalizeEmail(email)
	if err != nil {
		return domain.User{}, err
	}
	if len(password) < minPasswordLength {
		return domain.User{}, domain.NewInvalidError("The password must be at least %d characters.", minPasswordLength)
	}
	if _, err := l.users.GetByEmail(ctx, normalizedEmail); err == nil {
		return domain.User{}, domain.NewInvalidError("An account with this email already exists.")
	} else if !isNotFound(err) {
		return domain.User{}, err
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return domain.User{}, err
	}
	now := l.now().UTC()
	record := domain.UserRecord{
		ID:           newUserID(),
		Email:        normalizedEmail,
		Name:         resolveName(name, normalizedEmail),
		Roles:        []string{},
		PasswordHash: string(hash),
		CreatedAt:    now,
		UpdatedAt:    now,
	}
	if err := l.users.Create(ctx, record); err != nil {
		return domain.User{}, err
	}
	return userFromRecord(record), nil
}

func (l *Local) Authenticate(ctx context.Context, email, password string) (domain.User, error) {
	normalizedEmail, err := normalizeEmail(email)
	if err != nil {
		return domain.User{}, domain.NewUnauthorizedError("The email or password is incorrect.")
	}
	record, err := l.users.GetByEmail(ctx, normalizedEmail)
	if err != nil {
		if isNotFound(err) {
			return domain.User{}, domain.NewUnauthorizedError("The email or password is incorrect.")
		}
		return domain.User{}, err
	}
	if bcrypt.CompareHashAndPassword([]byte(record.PasswordHash), []byte(password)) != nil {
		return domain.User{}, domain.NewUnauthorizedError("The email or password is incorrect.")
	}
	return userFromRecord(record), nil
}

func (l *Local) EnsureAdmin(ctx context.Context, email, name, password string) (domain.User, error) {
	normalizedEmail, err := normalizeEmail(email)
	if err != nil {
		return domain.User{}, err
	}
	record, err := l.users.GetByEmail(ctx, normalizedEmail)
	if err != nil {
		if !isNotFound(err) {
			return domain.User{}, err
		}
		user, err := l.Register(ctx, normalizedEmail, name, password)
		if err != nil {
			return domain.User{}, err
		}
		if err := l.users.SetRoles(ctx, user.ID, []string{adminRole}); err != nil {
			return domain.User{}, err
		}
		user.Roles = []string{adminRole}
		return user, nil
	}
	if !hasRole(record.Roles, adminRole) {
		roles := append(append([]string{}, record.Roles...), adminRole)
		if err := l.users.SetRoles(ctx, record.ID, roles); err != nil {
			return domain.User{}, err
		}
		record.Roles = roles
	}
	return userFromRecord(record), nil
}

const adminRole = "paper-admin"

func userFromRecord(record domain.UserRecord) domain.User {
	return domain.User{ID: record.ID, Email: record.Email, Name: record.Name, Roles: record.Roles}
}

func normalizeEmail(email string) (string, error) {
	normalized := strings.ToLower(strings.TrimSpace(email))
	if normalized == "" || !strings.Contains(normalized, "@") {
		return "", domain.NewInvalidError("A valid email is required.")
	}
	return normalized, nil
}

func resolveName(name, email string) string {
	if trimmed := strings.TrimSpace(name); trimmed != "" {
		return trimmed
	}
	if at := strings.IndexByte(email, '@'); at > 0 {
		return email[:at]
	}
	return email
}

func hasRole(roles []string, role string) bool {
	for _, current := range roles {
		if current == role {
			return true
		}
	}
	return false
}

func isNotFound(err error) bool {
	var appErr *domain.AppError
	return errors.As(err, &appErr) && appErr.Kind == domain.KindNotFound
}

func newUserID() string {
	value := make([]byte, 16)
	if _, err := rand.Read(value); err != nil {
		return hex.EncodeToString([]byte(time.Now().UTC().Format(time.RFC3339Nano)))
	}
	return hex.EncodeToString(value)
}

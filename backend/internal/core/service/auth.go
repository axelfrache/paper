package service

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/axelfrache/paper/backend/internal/core/domain"
	"github.com/axelfrache/paper/backend/internal/core/port"
)

type AuthConfig struct {
	Secret                string
	SessionTTL            time.Duration
	LoginTTL              time.Duration
	RegistrationEnabled   bool
	PostLogoutRedirectURL string
}

type Auth struct {
	provider port.IdentityProvider
	sessions port.SessionRepository
	aead     cipher.AEAD
	config   AuthConfig
	now      func() time.Time
}

type loginState struct {
	State    string    `json:"state"`
	Nonce    string    `json:"nonce"`
	Verifier string    `json:"verifier"`
	ReturnTo string    `json:"returnTo"`
	Expires  time.Time `json:"expires"`
}

func NewAuth(provider port.IdentityProvider, sessions port.SessionRepository, config AuthConfig) (*Auth, error) {
	if strings.TrimSpace(config.Secret) == "" {
		return nil, fmt.Errorf("auth secret is required")
	}
	if config.SessionTTL <= 0 {
		config.SessionTTL = 30 * 24 * time.Hour
	}
	if config.LoginTTL <= 0 {
		config.LoginTTL = 5 * time.Minute
	}
	key := sha256.Sum256([]byte(config.Secret))
	block, err := aes.NewCipher(key[:])
	if err != nil {
		return nil, err
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	return &Auth{provider: provider, sessions: sessions, aead: aead, config: config, now: time.Now}, nil
}

func (s *Auth) Config() domain.AuthConfig {
	return domain.AuthConfig{Provider: s.provider.Name(), RegistrationEnabled: s.config.RegistrationEnabled}
}

func (s *Auth) BeginLogin(register bool, returnTo string) (domain.LoginStart, error) {
	if register && !s.config.RegistrationEnabled {
		return domain.LoginStart{}, domain.NewForbiddenError("Account registration is disabled.")
	}
	state, err := randomToken(24)
	if err != nil {
		return domain.LoginStart{}, err
	}
	nonce, err := randomToken(24)
	if err != nil {
		return domain.LoginStart{}, err
	}
	verifier, err := randomToken(48)
	if err != nil {
		return domain.LoginStart{}, err
	}
	payload := loginState{
		State:    state,
		Nonce:    nonce,
		Verifier: verifier,
		ReturnTo: safeReturnTo(returnTo),
		Expires:  s.now().UTC().Add(s.config.LoginTTL),
	}
	stateToken, err := s.seal(payload)
	if err != nil {
		return domain.LoginStart{}, err
	}
	digest := sha256.Sum256([]byte(verifier))
	challenge := base64.RawURLEncoding.EncodeToString(digest[:])
	return domain.LoginStart{
		URL:        s.provider.AuthorizationURL(state, nonce, challenge, register),
		StateToken: stateToken,
	}, nil
}

func (s *Auth) CompleteLogin(ctx context.Context, stateToken, state, code string) (domain.LoginResult, error) {
	var login loginState
	if err := s.open(stateToken, &login); err != nil {
		return domain.LoginResult{}, domain.NewUnauthorizedError("The login request is invalid or expired.")
	}
	if s.now().After(login.Expires) || subtle.ConstantTimeCompare([]byte(login.State), []byte(state)) != 1 {
		return domain.LoginResult{}, domain.NewUnauthorizedError("The login request is invalid or expired.")
	}
	user, tokens, err := s.provider.Exchange(ctx, code, login.Verifier, login.Nonce)
	if err != nil {
		return domain.LoginResult{}, domain.NewUnauthorizedError("Authentication could not be completed.")
	}
	if strings.TrimSpace(user.ID) == "" {
		return domain.LoginResult{}, domain.NewUnauthorizedError("The identity provider returned an invalid user.")
	}
	tokenEnvelope := ""
	if tokens != (domain.IdentityTokens{}) {
		tokenEnvelope, err = s.seal(tokens)
		if err != nil {
			return domain.LoginResult{}, err
		}
	}
	sessionToken, err := randomToken(32)
	if err != nil {
		return domain.LoginResult{}, err
	}
	now := s.now().UTC()
	session := domain.Session{
		ID:            hashToken(sessionToken),
		User:          user,
		TokenEnvelope: tokenEnvelope,
		ExpiresAt:     now.Add(s.config.SessionTTL),
		CreatedAt:     now,
		UpdatedAt:     now,
	}
	if err := s.sessions.Save(ctx, session); err != nil {
		return domain.LoginResult{}, err
	}
	return domain.LoginResult{SessionToken: sessionToken, ReturnTo: login.ReturnTo, User: user}, nil
}

func (s *Auth) Authenticate(ctx context.Context, sessionToken string) (domain.User, error) {
	if sessionToken == "" {
		return domain.User{}, domain.NewUnauthorizedError("Authentication is required.")
	}
	session, err := s.sessions.Get(ctx, hashToken(sessionToken))
	if err != nil {
		var appErr *domain.AppError
		if errors.As(err, &appErr) && appErr.Kind == domain.KindNotFound {
			return domain.User{}, domain.NewUnauthorizedError("The session is invalid or expired.")
		}
		return domain.User{}, err
	}
	if !session.ExpiresAt.After(s.now()) {
		_ = s.sessions.Delete(ctx, session.ID)
		return domain.User{}, domain.NewUnauthorizedError("The session is invalid or expired.")
	}
	if session.TokenEnvelope == "" {
		return session.User, nil
	}
	var tokens domain.IdentityTokens
	if err := s.open(session.TokenEnvelope, &tokens); err != nil {
		_ = s.sessions.Delete(ctx, session.ID)
		return domain.User{}, domain.NewUnauthorizedError("The session is invalid or expired.")
	}
	if tokens.Expiry.After(s.now().Add(time.Minute)) {
		return session.User, nil
	}
	tokens, err = s.provider.Refresh(ctx, tokens)
	if err != nil {
		_ = s.sessions.Delete(ctx, session.ID)
		return domain.User{}, domain.NewUnauthorizedError("The session is invalid or expired.")
	}
	session.TokenEnvelope, err = s.seal(tokens)
	if err != nil {
		return domain.User{}, err
	}
	session.UpdatedAt = s.now().UTC()
	if err := s.sessions.Save(ctx, session); err != nil {
		return domain.User{}, err
	}
	return session.User, nil
}

func (s *Auth) Logout(ctx context.Context, sessionToken string) (string, error) {
	redirect := s.config.PostLogoutRedirectURL
	if sessionToken == "" {
		return redirect, nil
	}
	id := hashToken(sessionToken)
	session, err := s.sessions.Get(ctx, id)
	if err != nil {
		var appErr *domain.AppError
		if errors.As(err, &appErr) && appErr.Kind == domain.KindNotFound {
			return redirect, nil
		}
		return "", err
	}
	if err := s.sessions.Delete(ctx, id); err != nil {
		return "", err
	}
	if session.TokenEnvelope == "" {
		return redirect, nil
	}
	var tokens domain.IdentityTokens
	if err := s.open(session.TokenEnvelope, &tokens); err != nil {
		return redirect, nil
	}
	return s.provider.LogoutURL(tokens.IDToken, redirect), nil
}

func (s *Auth) seal(value any) (string, error) {
	plaintext, err := json.Marshal(value)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, s.aead.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return "", err
	}
	sealed := s.aead.Seal(nonce, nonce, plaintext, nil)
	return base64.RawURLEncoding.EncodeToString(sealed), nil
}

func (s *Auth) open(encoded string, value any) error {
	sealed, err := base64.RawURLEncoding.DecodeString(encoded)
	if err != nil || len(sealed) < s.aead.NonceSize() {
		return fmt.Errorf("invalid encrypted payload")
	}
	nonce := sealed[:s.aead.NonceSize()]
	plaintext, err := s.aead.Open(nil, nonce, sealed[s.aead.NonceSize():], nil)
	if err != nil {
		return err
	}
	return json.Unmarshal(plaintext, value)
}

func randomToken(size int) (string, error) {
	value := make([]byte, size)
	if _, err := rand.Read(value); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(value), nil
}

func hashToken(token string) string {
	digest := sha256.Sum256([]byte(token))
	return hex.EncodeToString(digest[:])
}

func safeReturnTo(value string) string {
	value = strings.TrimSpace(value)
	if !strings.HasPrefix(value, "/") || strings.HasPrefix(value, "//") {
		return "/"
	}
	return value
}

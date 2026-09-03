package auth

import (
	"context"
	"fmt"
	"net/url"
	"strings"

	"github.com/axelfrache/paper/backend/internal/core/domain"
	"github.com/coreos/go-oidc/v3/oidc"
	"golang.org/x/oauth2"
)

type OIDCConfig struct {
	IssuerURL    string
	ClientID     string
	ClientSecret string
	RedirectURL  string
}

type OIDC struct {
	oauth     oauth2.Config
	verifier  *oidc.IDTokenVerifier
	logoutURL string
}

type oidcClaims struct {
	Subject           string `json:"sub"`
	Email             string `json:"email"`
	Name              string `json:"name"`
	PreferredUsername string `json:"preferred_username"`
	Nonce             string `json:"nonce"`
	RealmAccess       struct {
		Roles []string `json:"roles"`
	} `json:"realm_access"`
}

type providerMetadata struct {
	EndSessionEndpoint string `json:"end_session_endpoint"`
}

func NewOIDC(ctx context.Context, config OIDCConfig) (*OIDC, error) {
	provider, err := oidc.NewProvider(ctx, strings.TrimRight(config.IssuerURL, "/"))
	if err != nil {
		return nil, fmt.Errorf("discover oidc provider: %w", err)
	}
	var metadata providerMetadata
	if err := provider.Claims(&metadata); err != nil {
		return nil, fmt.Errorf("read oidc provider metadata: %w", err)
	}
	return &OIDC{
		oauth: oauth2.Config{
			ClientID:     config.ClientID,
			ClientSecret: config.ClientSecret,
			Endpoint:     provider.Endpoint(),
			RedirectURL:  config.RedirectURL,
			Scopes:       []string{oidc.ScopeOpenID, "profile", "email"},
		},
		verifier:  provider.Verifier(&oidc.Config{ClientID: config.ClientID}),
		logoutURL: metadata.EndSessionEndpoint,
	}, nil
}

func (o *OIDC) Name() string {
	return "oidc"
}

func (o *OIDC) AuthorizationURL(state, nonce, codeChallenge string, register bool) string {
	options := []oauth2.AuthCodeOption{
		oidc.Nonce(nonce),
		oauth2.SetAuthURLParam("code_challenge", codeChallenge),
		oauth2.SetAuthURLParam("code_challenge_method", "S256"),
	}
	if register {
		options = append(options, oauth2.SetAuthURLParam("prompt", "create"))
	}
	return o.oauth.AuthCodeURL(state, options...)
}

func (o *OIDC) Exchange(ctx context.Context, code, verifier, nonce string) (domain.User, domain.IdentityTokens, error) {
	token, err := o.oauth.Exchange(ctx, code, oauth2.VerifierOption(verifier))
	if err != nil {
		return domain.User{}, domain.IdentityTokens{}, err
	}
	rawIDToken, ok := token.Extra("id_token").(string)
	if !ok || rawIDToken == "" {
		return domain.User{}, domain.IdentityTokens{}, fmt.Errorf("oidc response did not contain an id token")
	}
	idToken, err := o.verifier.Verify(ctx, rawIDToken)
	if err != nil {
		return domain.User{}, domain.IdentityTokens{}, err
	}
	var claims oidcClaims
	if err := idToken.Claims(&claims); err != nil {
		return domain.User{}, domain.IdentityTokens{}, err
	}
	if claims.Nonce != nonce {
		return domain.User{}, domain.IdentityTokens{}, fmt.Errorf("oidc nonce mismatch")
	}
	name := strings.TrimSpace(claims.Name)
	if name == "" {
		name = strings.TrimSpace(claims.PreferredUsername)
	}
	return domain.User{
			ID:    claims.Subject,
			Email: claims.Email,
			Name:  name,
			Roles: append([]string(nil), claims.RealmAccess.Roles...),
		}, domain.IdentityTokens{
			AccessToken:  token.AccessToken,
			RefreshToken: token.RefreshToken,
			IDToken:      rawIDToken,
			Expiry:       token.Expiry,
		}, nil
}

func (o *OIDC) Refresh(ctx context.Context, tokens domain.IdentityTokens) (domain.IdentityTokens, error) {
	refreshed, err := o.oauth.TokenSource(ctx, &oauth2.Token{
		AccessToken:  tokens.AccessToken,
		RefreshToken: tokens.RefreshToken,
		Expiry:       tokens.Expiry,
	}).Token()
	if err != nil {
		return domain.IdentityTokens{}, err
	}
	idToken := tokens.IDToken
	refreshToken := refreshed.RefreshToken
	if refreshToken == "" {
		refreshToken = tokens.RefreshToken
	}
	if nextIDToken, ok := refreshed.Extra("id_token").(string); ok && nextIDToken != "" {
		idToken = nextIDToken
	}
	return domain.IdentityTokens{
		AccessToken:  refreshed.AccessToken,
		RefreshToken: refreshToken,
		IDToken:      idToken,
		Expiry:       refreshed.Expiry,
	}, nil
}

func (o *OIDC) LogoutURL(idToken, returnTo string) string {
	if o.logoutURL == "" {
		return returnTo
	}
	endpoint, err := url.Parse(o.logoutURL)
	if err != nil {
		return returnTo
	}
	query := endpoint.Query()
	if idToken != "" {
		query.Set("id_token_hint", idToken)
	}
	if returnTo != "" {
		query.Set("post_logout_redirect_uri", returnTo)
		query.Set("client_id", o.oauth.ClientID)
	}
	endpoint.RawQuery = query.Encode()
	return endpoint.String()
}

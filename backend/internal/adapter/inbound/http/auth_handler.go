package http

import (
	stdhttp "net/http"
	"time"

	"github.com/axelfrache/paper/backend/internal/core/domain"
	"github.com/axelfrache/paper/backend/internal/core/port"
)

const sessionCookieName = "paper_session"
const loginStateCookieName = "paper_login"

type AuthHTTPConfig struct {
	CookieSecure bool
}

type AuthHandler struct {
	service port.AuthService
	config  AuthHTTPConfig
}

func NewAuthHandler(service port.AuthService, config AuthHTTPConfig) *AuthHandler {
	return &AuthHandler{service: service, config: config}
}

func (h *AuthHandler) Config(w stdhttp.ResponseWriter, _ *stdhttp.Request) {
	config := h.service.Config()
	writeJSON(w, stdhttp.StatusOK, map[string]any{
		"provider":            config.Provider,
		"registrationEnabled": config.RegistrationEnabled,
	})
}

func (h *AuthHandler) Login(w stdhttp.ResponseWriter, r *stdhttp.Request) {
	start, err := h.service.BeginLogin(r.URL.Query().Get("mode") == "register", r.URL.Query().Get("returnTo"))
	if err != nil {
		writeError(w, err)
		return
	}
	stdhttp.SetCookie(w, &stdhttp.Cookie{
		Name: loginStateCookieName, Value: start.StateToken, Path: "/api/auth/callback",
		HttpOnly: true, Secure: h.config.CookieSecure, SameSite: stdhttp.SameSiteLaxMode,
		MaxAge: 300,
	})
	stdhttp.Redirect(w, r, start.URL, stdhttp.StatusFound)
}

func (h *AuthHandler) Callback(w stdhttp.ResponseWriter, r *stdhttp.Request) {
	stateCookie, err := r.Cookie(loginStateCookieName)
	if err != nil || r.URL.Query().Get("error") != "" {
		h.clearLoginCookie(w)
		stdhttp.Redirect(w, r, "/?authError=login", stdhttp.StatusFound)
		return
	}
	result, err := h.service.CompleteLogin(r.Context(), stateCookie.Value, r.URL.Query().Get("state"), r.URL.Query().Get("code"))
	h.clearLoginCookie(w)
	if err != nil {
		stdhttp.Redirect(w, r, "/?authError=login", stdhttp.StatusFound)
		return
	}
	stdhttp.SetCookie(w, &stdhttp.Cookie{
		Name: sessionCookieName, Value: result.SessionToken, Path: "/",
		HttpOnly: true, Secure: h.config.CookieSecure, SameSite: stdhttp.SameSiteLaxMode,
		MaxAge: int((30 * 24 * time.Hour).Seconds()),
	})
	stdhttp.Redirect(w, r, result.ReturnTo, stdhttp.StatusFound)
}

func (h *AuthHandler) Me(w stdhttp.ResponseWriter, r *stdhttp.Request) {
	user, err := domain.RequireUser(r.Context())
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, stdhttp.StatusOK, map[string]any{
		"id": user.ID, "email": user.Email, "name": user.Name,
		"roles": user.Roles, "isAdmin": user.IsAdmin(),
	})
}

func (h *AuthHandler) Logout(w stdhttp.ResponseWriter, r *stdhttp.Request) {
	sessionToken := ""
	if cookie, err := r.Cookie(sessionCookieName); err == nil {
		sessionToken = cookie.Value
	}
	redirect, err := h.service.Logout(r.Context(), sessionToken)
	if err != nil {
		writeError(w, err)
		return
	}
	stdhttp.SetCookie(w, &stdhttp.Cookie{
		Name: sessionCookieName, Value: "", Path: "/", HttpOnly: true,
		Secure: h.config.CookieSecure, SameSite: stdhttp.SameSiteLaxMode, MaxAge: -1,
	})
	writeJSON(w, stdhttp.StatusOK, map[string]string{"redirectTo": redirect})
}

func (h *AuthHandler) clearLoginCookie(w stdhttp.ResponseWriter) {
	stdhttp.SetCookie(w, &stdhttp.Cookie{
		Name: loginStateCookieName, Value: "", Path: "/api/auth/callback",
		HttpOnly: true, Secure: h.config.CookieSecure, SameSite: stdhttp.SameSiteLaxMode, MaxAge: -1,
	})
}

func requireAuth(service port.AuthService, next stdhttp.Handler) stdhttp.Handler {
	return stdhttp.HandlerFunc(func(w stdhttp.ResponseWriter, r *stdhttp.Request) {
		cookie, err := r.Cookie(sessionCookieName)
		if err != nil {
			writeError(w, domain.NewUnauthorizedError("Authentication is required."))
			return
		}
		user, err := service.Authenticate(r.Context(), cookie.Value)
		if err != nil {
			writeError(w, err)
			return
		}
		next.ServeHTTP(w, r.WithContext(domain.ContextWithUser(r.Context(), user)))
	})
}

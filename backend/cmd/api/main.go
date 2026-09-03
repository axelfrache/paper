package main

import (
	"context"
	"errors"
	"log"
	stdhttp "net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	httpadapter "github.com/axelfrache/paper/backend/internal/adapter/inbound/http"
	"github.com/axelfrache/paper/backend/internal/adapter/outbound/ai"
	authadapter "github.com/axelfrache/paper/backend/internal/adapter/outbound/auth"
	"github.com/axelfrache/paper/backend/internal/adapter/outbound/postgres"
	s3adapter "github.com/axelfrache/paper/backend/internal/adapter/outbound/s3"
	"github.com/axelfrache/paper/backend/internal/config"
	"github.com/axelfrache/paper/backend/internal/core/domain"
	"github.com/axelfrache/paper/backend/internal/core/port"
	"github.com/axelfrache/paper/backend/internal/core/service"
)

func main() {
	cfg := config.Load()

	if cfg.AIProvider == "ai-gateway" && cfg.AIAPIKey == "" {
		log.Println("warning: AI_API_KEY/AI_GATEWAY_API_KEY is not set; ai-gateway actions will fail.")
	}

	startupCtx, cancelStartup := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancelStartup()

	notes, err := postgres.NewNoteRepository(startupCtx, cfg.DatabaseURL, cfg.AuthLegacyOwner)
	if err != nil {
		log.Fatalf("database connection failed: %v", err)
	}
	defer notes.Close()
	sessions, err := postgres.NewSessionRepository(startupCtx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("session database connection failed: %v", err)
	}
	defer sessions.Close()

	var identityProvider port.IdentityProvider
	switch cfg.AuthProvider {
	case "dev":
		identityProvider = authadapter.NewDev(domain.User{
			ID: cfg.AuthDevUserID, Email: cfg.AuthDevEmail, Name: cfg.AuthDevName, Roles: cfg.AuthDevRoles,
		})
	case "oidc":
		if cfg.AuthClientSecret == "" {
			log.Fatal("OIDC_CLIENT_SECRET is required when AUTH_PROVIDER=oidc")
		}
		identityProvider, err = authadapter.NewOIDC(startupCtx, authadapter.OIDCConfig{
			IssuerURL: cfg.AuthIssuerURL, ClientID: cfg.AuthClientID,
			ClientSecret: cfg.AuthClientSecret, RedirectURL: cfg.AuthRedirectURL,
		})
		if err != nil {
			log.Fatalf("oidc configuration failed: %v", err)
		}
	default:
		log.Fatalf("unsupported AUTH_PROVIDER %q", cfg.AuthProvider)
	}
	authService, err := service.NewAuth(identityProvider, sessions, service.AuthConfig{
		Secret: cfg.AuthSecret, RegistrationEnabled: cfg.AuthRegistration,
		PostLogoutRedirectURL: cfg.AuthPublicURL,
	})
	if err != nil {
		log.Fatalf("auth configuration failed: %v", err)
	}

	assistant := ai.New(ai.Config{
		Provider: cfg.AIProvider,
		BaseURL:  cfg.AIBaseURL,
		APIKey:   cfg.AIAPIKey,
		Model:    cfg.AIModel,
		Timeout:  cfg.AITimeout,
	})
	noteService := service.NewNote(notes, assistant)
	imageStorage, err := s3adapter.New(startupCtx, s3adapter.Config{
		Endpoint:  cfg.S3Endpoint,
		Region:    cfg.S3Region,
		Bucket:    cfg.S3Bucket,
		AccessKey: cfg.S3AccessKey,
		SecretKey: cfg.S3SecretKey,
	})
	if err != nil {
		log.Fatalf("image storage configuration failed: %v", err)
	}
	imageService := service.NewImage(notes, notes, imageStorage)

	router := httpadapter.NewRouter(noteService, imageService, authService, httpadapter.AuthHTTPConfig{
		CookieSecure: cfg.AuthCookieSecure,
	}, cfg.AllowedOrigins)
	server := httpadapter.NewServer(cfg.Addr(), router, cfg.AITimeout+30*time.Second)

	go func() {
		log.Printf("Paper API listening on %s", cfg.Addr())
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, stdhttp.ErrServerClosed) {
			log.Fatalf("server error: %v", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop

	log.Println("shutting down...")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := server.Shutdown(shutdownCtx); err != nil {
		log.Printf("unclean shutdown: %v", err)
	}
}

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
	"github.com/axelfrache/paper/backend/internal/adapter/outbound/memory"
	"github.com/axelfrache/paper/backend/internal/config"
	"github.com/axelfrache/paper/backend/internal/core/service"
)

func main() {
	cfg := config.Load()

	if cfg.AIProvider == "ai-gateway" && cfg.AIAPIKey == "" {
		log.Println("warning: AI_API_KEY/AI_GATEWAY_API_KEY is not set; ai-gateway actions will fail.")
	}

	notes := memory.NewNoteRepository()
	assistant := ai.New(ai.Config{
		Provider: cfg.AIProvider,
		BaseURL:  cfg.AIBaseURL,
		APIKey:   cfg.AIAPIKey,
		Model:    cfg.AIModel,
	})
	noteService := service.NewNote(notes, assistant)

	router := httpadapter.NewRouter(noteService, cfg.AllowedOrigins)
	server := httpadapter.NewServer(cfg.Addr(), router)

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

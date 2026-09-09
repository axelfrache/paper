package ai

import (
	"context"

	"github.com/axelfrache/paper/backend/internal/core/domain"
)

type Disabled struct{}

func NewDisabled() *Disabled {
	return &Disabled{}
}

func (Disabled) Assist(_ context.Context, _ domain.Note, _ domain.AIAction) (domain.AISuggestion, error) {
	return domain.AISuggestion{}, errDisabled()
}

func (Disabled) Ask(_ context.Context, _ string, _ []domain.Note) (domain.AskAnswer, error) {
	return domain.AskAnswer{}, errDisabled()
}

func (Disabled) Generate(_ context.Context, _ string) (domain.AICompletion, error) {
	return domain.AICompletion{}, errDisabled()
}

func errDisabled() error {
	return domain.NewAIError(0, "AI features are not enabled on this server.")
}

package port

import (
	"context"

	"github.com/axelfrache/paper/backend/internal/core/domain"
)

type NoteService interface {
	CreateNote(ctx context.Context, draft domain.NoteDraft) (domain.Note, error)
	UpdateNote(ctx context.Context, id string, draft domain.NoteDraft) (domain.Note, error)
	GetNote(ctx context.Context, id string) (domain.Note, error)
	ListNotes(ctx context.Context) ([]domain.Note, error)
	SearchNotes(ctx context.Context, query domain.SearchQuery) ([]domain.Note, error)
	DeleteNote(ctx context.Context, id string) error
	AssistNote(ctx context.Context, id string, action domain.AIAction) (domain.AISuggestion, error)
	AskNotes(ctx context.Context, req domain.AskRequest) (domain.AskAnswer, error)
	GenerateAI(ctx context.Context, req domain.AICompletionRequest) (domain.AICompletion, error)
}

type NoteRepository interface {
	Create(ctx context.Context, draft domain.NoteDraft) (domain.Note, error)
	Update(ctx context.Context, id string, draft domain.NoteDraft) (domain.Note, error)
	GetByID(ctx context.Context, id string) (domain.Note, error)
	List(ctx context.Context) ([]domain.Note, error)
	Delete(ctx context.Context, id string) error
}

type NoteAssistant interface {
	Assist(ctx context.Context, note domain.Note, action domain.AIAction) (domain.AISuggestion, error)
	Ask(ctx context.Context, question string, notes []domain.Note) (domain.AskAnswer, error)
	Generate(ctx context.Context, prompt string) (domain.AICompletion, error)
}

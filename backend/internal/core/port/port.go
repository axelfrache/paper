package port

import (
	"context"
	"io"

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
	ClaimLegacyNotes(ctx context.Context) (int64, error)
}

type NoteRepository interface {
	Create(ctx context.Context, ownerID string, draft domain.NoteDraft) (domain.Note, error)
	Update(ctx context.Context, ownerID, id string, draft domain.NoteDraft) (domain.Note, error)
	GetByID(ctx context.Context, ownerID, id string) (domain.Note, error)
	List(ctx context.Context, ownerID string) ([]domain.Note, error)
	Delete(ctx context.Context, ownerID, id string) error
	ClaimOwner(ctx context.Context, previousOwnerID, ownerID string) (int64, error)
}

type NoteAssistant interface {
	Assist(ctx context.Context, note domain.Note, action domain.AIAction) (domain.AISuggestion, error)
	Ask(ctx context.Context, question string, notes []domain.Note) (domain.AskAnswer, error)
	Generate(ctx context.Context, prompt string) (domain.AICompletion, error)
}

type NoteImageService interface {
	Upload(ctx context.Context, noteID string, upload domain.ImageUpload) (domain.NoteImage, error)
	Open(ctx context.Context, imageID string) (StoredImage, error)
	Delete(ctx context.Context, imageID string) error
}

type ImageStorage interface {
	Put(ctx context.Context, key string, upload domain.ImageUpload) error
	Open(ctx context.Context, key string) (StoredImage, error)
	Delete(ctx context.Context, key string) error
}

type NoteImageRepository interface {
	SaveImage(ctx context.Context, image domain.NoteImageRecord) error
	GetImage(ctx context.Context, ownerID, imageID string) (domain.NoteImageRecord, error)
	DeleteImage(ctx context.Context, ownerID, imageID string) error
}

type StoredImage struct {
	Body        io.ReadCloser
	Name        string
	ContentType string
	Size        int64
	ETag        string
}

type AuthService interface {
	Config() domain.AuthConfig
	BeginLogin(register bool, returnTo string) (domain.LoginStart, error)
	CompleteLogin(ctx context.Context, stateToken, state, code string) (domain.LoginResult, error)
	Authenticate(ctx context.Context, sessionToken string) (domain.User, error)
	Logout(ctx context.Context, sessionToken string) (string, error)
}

type IdentityProvider interface {
	Name() string
	AuthorizationURL(state, nonce, codeChallenge string, register bool) string
	Exchange(ctx context.Context, code, verifier, nonce string) (domain.User, domain.IdentityTokens, error)
	Refresh(ctx context.Context, tokens domain.IdentityTokens) (domain.IdentityTokens, error)
	LogoutURL(idToken, returnTo string) string
}

type SessionRepository interface {
	Save(ctx context.Context, session domain.Session) error
	Get(ctx context.Context, id string) (domain.Session, error)
	Delete(ctx context.Context, id string) error
}

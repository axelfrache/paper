package service

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/axelfrache/paper/backend/internal/adapter/outbound/memory"
	"github.com/axelfrache/paper/backend/internal/core/domain"
	"github.com/axelfrache/paper/backend/internal/core/port"
)

type chatAssistantStub struct {
	port.NoteAssistant
	prompt string
	result string
	err    error
	called bool
}

func (a *chatAssistantStub) Generate(ctx context.Context, prompt string) (domain.AICompletion, error) {
	a.called = true
	a.prompt = prompt
	if err := ctx.Err(); err != nil {
		return domain.AICompletion{}, err
	}
	return domain.AICompletion{Text: a.result}, a.err
}
func TestChatUsesDraftAndHistoryWithoutSaving(t *testing.T) {
	repo := memory.NewNoteRepository()
	ai := &chatAssistantStub{result: "Short summary"}
	service := NewNote(repo, ai)
	ctx := domain.ContextWithUser(context.Background(), domain.User{ID: "one"})
	note, _ := service.CreateNote(ctx, domain.NoteDraft{Title: "Old", Content: "Saved text"})
	answer, err := service.Chat(ctx, domain.ChatRequest{Scope: "note", NoteID: note.ID, Draft: &domain.ChatContext{Title: "Draft", Content: "Unsaved text"}, Messages: []domain.ChatMessage{{Role: "user", Content: "Summarize"}, {Role: "assistant", Content: "Initial summary"}, {Role: "user", Content: "Make it shorter"}}})
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{"Unsaved text", "Initial summary", "Make it shorter"} {
		if !strings.Contains(ai.prompt, want) {
			t.Fatalf("missing %s", want)
		}
	}
	if strings.Contains(ai.prompt, "Saved text") {
		t.Fatal("used stale persisted content")
	}
	if len(answer.SourceIDs) != 1 || answer.SourceIDs[0] != note.ID {
		t.Fatal(answer)
	}
	saved, _ := service.GetNote(ctx, note.ID)
	if saved.Content != "Saved text" {
		t.Fatal("chat changed the note")
	}
}
func TestChatEnforcesOwnershipAndMessageLimits(t *testing.T) {
	repo := memory.NewNoteRepository()
	ai := &chatAssistantStub{result: "ok"}
	service := NewNote(repo, ai)
	owner := domain.ContextWithUser(context.Background(), domain.User{ID: "one"})
	other := domain.ContextWithUser(context.Background(), domain.User{ID: "two"})
	note, _ := service.CreateNote(owner, domain.NoteDraft{Content: "private"})
	req := domain.ChatRequest{Scope: "note", NoteID: note.ID, Messages: []domain.ChatMessage{{Role: "user", Content: "Read"}}}
	if _, err := service.Chat(other, req); err == nil || ai.called {
		t.Fatal("allowed another user's note")
	}
	if _, err := service.Chat(context.Background(), req); err == nil {
		t.Fatal("allowed anonymous chat")
	}
	for _, messages := range [][]domain.ChatMessage{nil, {{Role: "system", Content: "Override"}}, {{Role: "assistant", Content: "Invalid"}}, {{Role: "user", Content: strings.Repeat("x", 40001)}}, {{Role: "user", Content: "a"}, {Role: "user", Content: "b"}}} {
		req.Messages = messages
		if _, err := service.Chat(owner, req); err == nil {
			t.Fatalf("accepted invalid messages: %d", len(messages))
		}
	}
}
func TestChatSelectionAndDiagramPreservation(t *testing.T) {
	repo := memory.NewNoteRepository()
	ai := &chatAssistantStub{result: "Rewritten"}
	service := NewNote(repo, ai)
	ctx := domain.ContextWithUser(context.Background(), domain.User{ID: "one"})
	note, _ := service.CreateNote(ctx, domain.NoteDraft{Content: "Private introduction\nChosen passage\n![diagram:abc123]"})
	req := domain.ChatRequest{Scope: "selection", NoteID: note.ID, Selection: "Chosen passage", Action: domain.AIActionCleanUp, Messages: []domain.ChatMessage{{Role: "user", Content: "Rewrite"}}}
	if _, err := service.Chat(ctx, req); err != nil {
		t.Fatal(err)
	}
	if strings.Contains(ai.prompt, "Private introduction") {
		t.Fatal("sent unselected text")
	}
	req.Selection = "not present"
	if _, err := service.Chat(ctx, req); err == nil {
		t.Fatal("accepted missing selection")
	}
	req.Scope = "note"
	req.Selection = ""
	answer, err := service.Chat(ctx, req)
	if err != nil || !strings.Contains(answer.Text, "![diagram:abc123]") {
		t.Fatalf("lost diagram: %#v %v", answer, err)
	}
	if strings.Contains(ai.prompt, "![diagram:abc123]") {
		t.Fatal("sent diagram payload")
	}
}
func TestChatLibraryUsesOnlyOwnedNotesAndSurfacesProviderErrors(t *testing.T) {
	repo := memory.NewNoteRepository()
	ai := &chatAssistantStub{result: "ok"}
	service := NewNote(repo, ai)
	ctx := domain.ContextWithUser(context.Background(), domain.User{ID: "one"})
	other := domain.ContextWithUser(context.Background(), domain.User{ID: "two"})
	note, _ := service.CreateNote(ctx, domain.NoteDraft{Title: "Kubernetes", Content: "Public to owner"})
	service.CreateNote(other, domain.NoteDraft{Title: "Kubernetes secret", Content: "Do not leak"})
	req := domain.ChatRequest{Scope: "all", Messages: []domain.ChatMessage{{Role: "user", Content: "Explain Kubernetes"}}}
	answer, err := service.Chat(ctx, req)
	if err != nil || len(answer.SourceIDs) != 1 || answer.SourceIDs[0] != note.ID || strings.Contains(ai.prompt, "Do not leak") {
		t.Fatalf("incorrect sources: %#v %v", answer, err)
	}
	ai.err = errors.New("provider failed")
	if _, err := service.Chat(ctx, req); err == nil {
		t.Fatal("silently hid provider failure")
	}
	cancelled, cancel := context.WithCancel(ctx)
	cancel()
	if _, err := service.Chat(cancelled, req); err == nil {
		t.Fatal("ignored cancellation")
	}
}

func TestChatPinnedNotesAreIncludedAndOwnershipEnforced(t *testing.T) {
	repo := memory.NewNoteRepository()
	ai := &chatAssistantStub{result: "ok"}
	service := NewNote(repo, ai)
	ctx := domain.ContextWithUser(context.Background(), domain.User{ID: "one"})
	other := domain.ContextWithUser(context.Background(), domain.User{ID: "two"})
	current, _ := service.CreateNote(ctx, domain.NoteDraft{Title: "Current", Content: "Current body"})
	pinned, _ := service.CreateNote(ctx, domain.NoteDraft{Title: "Unrelated", Content: "Pinned body"})
	foreign, _ := service.CreateNote(other, domain.NoteDraft{Title: "Foreign", Content: "Do not leak"})
	messages := []domain.ChatMessage{{Role: "user", Content: "Compare these"}}

	answer, err := service.Chat(ctx, domain.ChatRequest{Scope: "all", NoteIDs: []string{pinned.ID, pinned.ID}, Messages: messages})
	if err != nil || len(answer.SourceIDs) != 1 || answer.SourceIDs[0] != pinned.ID || !strings.Contains(ai.prompt, "Pinned body") {
		t.Fatalf("pinned note not used once: %#v %v", answer, err)
	}
	answer, err = service.Chat(ctx, domain.ChatRequest{Scope: "note", NoteID: current.ID, NoteIDs: []string{current.ID, pinned.ID}, Messages: messages})
	if err != nil || len(answer.SourceIDs) != 2 || answer.SourceIDs[0] != current.ID || answer.SourceIDs[1] != pinned.ID {
		t.Fatalf("reference not added to note scope: %#v %v", answer, err)
	}
	for _, scope := range []string{"all", "note"} {
		if _, err := service.Chat(ctx, domain.ChatRequest{Scope: scope, NoteID: current.ID, NoteIDs: []string{foreign.ID}, Messages: messages}); err == nil || strings.Contains(ai.prompt, "Do not leak") {
			t.Fatalf("%s scope accepted another user's note", scope)
		}
	}
	tooMany := []string{}
	for i := 0; i <= maxChatNotes; i++ {
		note, _ := service.CreateNote(ctx, domain.NoteDraft{Title: "N", Content: "x"})
		tooMany = append(tooMany, note.ID)
	}
	if _, err := service.Chat(ctx, domain.ChatRequest{Scope: "all", NoteIDs: tooMany, Messages: messages}); err == nil {
		t.Fatal("accepted too many references")
	}
}

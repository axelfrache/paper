package memory

import (
	"context"
	"fmt"
	"sort"
	"sync"
	"time"

	"github.com/axelfrache/paper/backend/internal/core/domain"
)

type NoteRepository struct {
	mu     sync.RWMutex
	nextID int
	notes  map[string]domain.Note
}

func NewNoteRepository() *NoteRepository {
	return &NoteRepository{
		nextID: 1,
		notes:  make(map[string]domain.Note),
	}
}

func (r *NoteRepository) Create(_ context.Context, draft domain.NoteDraft) (domain.Note, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	now := time.Now().UTC()
	id := fmt.Sprintf("note_%d", r.nextID)
	r.nextID++

	note := domain.Note{
		ID:        id,
		Title:     draft.Title,
		Content:   draft.Content,
		Tags:      cloneTags(draft.Tags),
		Favorite:  draft.Favorite,
		CreatedAt: now,
		UpdatedAt: now,
	}
	r.notes[id] = note
	return cloneNote(note), nil
}

func (r *NoteRepository) Update(_ context.Context, id string, draft domain.NoteDraft) (domain.Note, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	note, ok := r.notes[id]
	if !ok {
		return domain.Note{}, domain.NewNotFoundError("Note %q was not found.", id)
	}

	note.Title = draft.Title
	note.Content = draft.Content
	note.Tags = cloneTags(draft.Tags)
	note.Favorite = draft.Favorite
	note.UpdatedAt = time.Now().UTC()
	r.notes[id] = note
	return cloneNote(note), nil
}

func (r *NoteRepository) GetByID(_ context.Context, id string) (domain.Note, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	note, ok := r.notes[id]
	if !ok {
		return domain.Note{}, domain.NewNotFoundError("Note %q was not found.", id)
	}
	return cloneNote(note), nil
}

func (r *NoteRepository) List(_ context.Context) ([]domain.Note, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	notes := make([]domain.Note, 0, len(r.notes))
	for _, note := range r.notes {
		notes = append(notes, cloneNote(note))
	}
	sort.Slice(notes, func(i, j int) bool {
		return notes[i].UpdatedAt.After(notes[j].UpdatedAt)
	})
	return notes, nil
}

func (r *NoteRepository) Delete(_ context.Context, id string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if _, ok := r.notes[id]; !ok {
		return domain.NewNotFoundError("Note %q was not found.", id)
	}
	delete(r.notes, id)
	return nil
}

func cloneNote(note domain.Note) domain.Note {
	note.Tags = cloneTags(note.Tags)
	return note
}

func cloneTags(tags []string) []string {
	out := make([]string, len(tags))
	copy(out, tags)
	return out
}

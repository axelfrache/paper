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
	images map[string]domain.NoteImageRecord
}

func NewNoteRepository() *NoteRepository {
	return &NoteRepository{
		nextID: 1,
		notes:  make(map[string]domain.Note),
		images: make(map[string]domain.NoteImageRecord),
	}
}

func (r *NoteRepository) Create(_ context.Context, ownerID string, draft domain.NoteDraft) (domain.Note, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	now := time.Now().UTC()
	id := fmt.Sprintf("note_%d", r.nextID)
	r.nextID++

	note := domain.Note{
		ID:        id,
		OwnerID:   ownerID,
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

func (r *NoteRepository) Update(_ context.Context, ownerID, id string, draft domain.NoteDraft) (domain.Note, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	note, ok := r.notes[id]
	if !ok || note.OwnerID != ownerID {
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

func (r *NoteRepository) GetByID(_ context.Context, ownerID, id string) (domain.Note, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	note, ok := r.notes[id]
	if !ok || note.OwnerID != ownerID {
		return domain.Note{}, domain.NewNotFoundError("Note %q was not found.", id)
	}
	return cloneNote(note), nil
}

func (r *NoteRepository) List(_ context.Context, ownerID string) ([]domain.Note, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	notes := make([]domain.Note, 0, len(r.notes))
	for _, note := range r.notes {
		if note.OwnerID == ownerID {
			notes = append(notes, cloneNote(note))
		}
	}
	sort.Slice(notes, func(i, j int) bool {
		return notes[i].UpdatedAt.After(notes[j].UpdatedAt)
	})
	return notes, nil
}

func (r *NoteRepository) Delete(_ context.Context, ownerID, id string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	note, ok := r.notes[id]
	if !ok || note.OwnerID != ownerID {
		return domain.NewNotFoundError("Note %q was not found.", id)
	}
	delete(r.notes, id)
	return nil
}

func (r *NoteRepository) ClaimOwner(_ context.Context, previousOwnerID, ownerID string) (int64, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	var count int64
	for id, note := range r.notes {
		if note.OwnerID != previousOwnerID {
			continue
		}
		note.OwnerID = ownerID
		r.notes[id] = note
		count++
	}
	for id, image := range r.images {
		if image.OwnerID == previousOwnerID {
			image.OwnerID = ownerID
			r.images[id] = image
		}
	}
	return count, nil
}

func (r *NoteRepository) SaveImage(_ context.Context, image domain.NoteImageRecord) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.images[image.ID] = image
	return nil
}

func (r *NoteRepository) GetImage(_ context.Context, ownerID, imageID string) (domain.NoteImageRecord, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	image, ok := r.images[imageID]
	if !ok || image.OwnerID != ownerID {
		return domain.NoteImageRecord{}, domain.NewNotFoundError("Image was not found.")
	}
	return image, nil
}

func (r *NoteRepository) DeleteImage(_ context.Context, ownerID, imageID string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	image, ok := r.images[imageID]
	if !ok || image.OwnerID != ownerID {
		return domain.NewNotFoundError("Image was not found.")
	}
	delete(r.images, imageID)
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

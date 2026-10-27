package memory

import (
	"context"
	"fmt"
	"github.com/axelfrache/paper/backend/internal/core/domain"
	"sort"
	"time"
)

func (r *NoteRepository) checkFolder(owner string, id *string) error {
	if id == nil {
		return nil
	}
	f, ok := r.folders[*id]
	if !ok || f.OwnerID != owner {
		return domain.NewNotFoundError("Folder was not found.")
	}
	return nil
}
func (r *NoteRepository) ListFolders(_ context.Context, owner string) ([]domain.Folder, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	out := []domain.Folder{}
	for _, f := range r.folders {
		if f.OwnerID == owner {
			out = append(out, f)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out, nil
}
func (r *NoteRepository) SaveFolder(_ context.Context, owner, id string, d domain.FolderDraft) (domain.Folder, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	now := time.Now().UTC()
	f := domain.Folder{OwnerID: owner, CreatedAt: now}
	if id == "" {
		id = fmt.Sprintf("folder_%d", r.nextID)
		r.nextID++
	} else {
		var ok bool
		f, ok = r.folders[id]
		if !ok || f.OwnerID != owner {
			return domain.Folder{}, domain.NewNotFoundError("Folder was not found.")
		}
	}
	f.ID = id
	f.Name = d.Name
	f.Color = d.Color
	f.UpdatedAt = now
	r.folders[id] = f
	return f, nil
}
func (r *NoteRepository) DeleteFolder(_ context.Context, owner, id string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if err := r.checkFolder(owner, &id); err != nil {
		return err
	}
	for key, n := range r.notes {
		if n.OwnerID == owner && n.FolderID != nil && *n.FolderID == id {
			n.FolderID = nil
			r.notes[key] = n
		}
	}
	delete(r.folders, id)
	return nil
}
func (r *NoteRepository) MoveNotes(_ context.Context, owner string, moves []domain.NoteMove) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, m := range moves {
		n, ok := r.notes[m.NoteID]
		if !ok || n.OwnerID != owner {
			return domain.NewNotFoundError("Note was not found.")
		}
		if err := r.checkFolder(owner, m.FolderID); err != nil {
			return err
		}
	}
	for _, m := range moves {
		n := r.notes[m.NoteID]
		n.FolderID = m.FolderID
		r.notes[m.NoteID] = n
	}
	return nil
}

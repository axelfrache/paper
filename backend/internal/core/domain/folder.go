package domain

import (
	"strings"
	"time"
	"unicode/utf8"
)

type Folder struct {
	ID        string    `json:"id"`
	OwnerID   string    `json:"-"`
	Name      string    `json:"name"`
	Color     string    `json:"color"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}
type FolderDraft struct {
	Name  string `json:"name"`
	Color string `json:"color"`
}

func (d FolderDraft) Normalize() (FolderDraft, error) {
	d.Name = strings.Join(strings.Fields(d.Name), " ")
	if d.Name == "" || utf8.RuneCountInString(d.Name) > 80 {
		return d, NewInvalidError("Folder names must contain 1 to 80 characters.")
	}
	switch d.Color {
	case "slate", "blue", "green", "amber", "orange", "violet", "pink":
	default:
		return d, NewInvalidError("Choose a valid folder color.")
	}
	return d, nil
}

type NoteMove struct {
	NoteID   string  `json:"noteId"`
	FolderID *string `json:"folderId"`
}

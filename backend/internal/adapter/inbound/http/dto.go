package http

import (
	"time"

	"github.com/axelfrache/paper/backend/internal/core/domain"
)

type noteDraftDTO struct {
	Title    string   `json:"title"`
	Content  string   `json:"content"`
	Tags     []string `json:"tags"`
	Favorite bool     `json:"favorite"`
}

func (d noteDraftDTO) toDomain() domain.NoteDraft {
	return domain.NoteDraft{
		Title:    d.Title,
		Content:  d.Content,
		Tags:     d.Tags,
		Favorite: d.Favorite,
	}
}

type noteDTO struct {
	ID        string    `json:"id"`
	Title     string    `json:"title"`
	Content   string    `json:"content"`
	Tags      []string  `json:"tags"`
	Favorite  bool      `json:"favorite"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

func newNoteDTO(note domain.Note) noteDTO {
	return noteDTO{
		ID:        note.ID,
		Title:     note.Title,
		Content:   note.Content,
		Tags:      note.Tags,
		Favorite:  note.Favorite,
		CreatedAt: note.CreatedAt,
		UpdatedAt: note.UpdatedAt,
	}
}

func newNoteListDTO(notes []domain.Note) []noteDTO {
	out := make([]noteDTO, 0, len(notes))
	for _, note := range notes {
		out = append(out, newNoteDTO(note))
	}
	return out
}

type searchRequestDTO struct {
	Query string   `json:"query"`
	Tags  []string `json:"tags"`
}

func (d searchRequestDTO) toDomain() domain.SearchQuery {
	return domain.SearchQuery{Query: d.Query, Tags: d.Tags}
}

type assistRequestDTO struct {
	Action domain.AIAction `json:"action"`
}

func (d assistRequestDTO) toDomain() domain.AIAction {
	return d.Action
}

type aiSuggestionDTO struct {
	Action domain.AIAction `json:"action"`
	Text   string          `json:"text"`
}

func newAISuggestionDTO(suggestion domain.AISuggestion) aiSuggestionDTO {
	return aiSuggestionDTO{
		Action: suggestion.Action,
		Text:   suggestion.Text,
	}
}

type askRequestDTO struct {
	Question string `json:"question"`
}

func (d askRequestDTO) toDomain() domain.AskRequest {
	return domain.AskRequest{Question: d.Question}
}

type askAnswerDTO struct {
	Answer    string   `json:"answer"`
	SourceIDs []string `json:"sourceIds"`
}

func newAskAnswerDTO(answer domain.AskAnswer) askAnswerDTO {
	return askAnswerDTO{
		Answer:    answer.Answer,
		SourceIDs: answer.SourceIDs,
	}
}

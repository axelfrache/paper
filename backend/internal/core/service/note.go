package service

import (
	"context"
	"fmt"
	"regexp"
	"sort"
	"strings"

	"github.com/axelfrache/paper/backend/internal/core/domain"
	"github.com/axelfrache/paper/backend/internal/core/port"
)

type Note struct {
	repo      port.NoteRepository
	assistant port.NoteAssistant
}

func NewNote(repo port.NoteRepository, assistant port.NoteAssistant) *Note {
	return &Note{repo: repo, assistant: assistant}
}

func (s *Note) CreateNote(ctx context.Context, draft domain.NoteDraft) (domain.Note, error) {
	user, err := domain.RequireUser(ctx)
	if err != nil {
		return domain.Note{}, err
	}
	if err := draft.Validate(); err != nil {
		return domain.Note{}, err
	}
	return s.repo.Create(ctx, user.ID, draft.Normalize())
}

func (s *Note) UpdateNote(ctx context.Context, id string, draft domain.NoteDraft) (domain.Note, error) {
	user, err := domain.RequireUser(ctx)
	if err != nil {
		return domain.Note{}, err
	}
	if err := draft.Validate(); err != nil {
		return domain.Note{}, err
	}
	return s.repo.Update(ctx, user.ID, id, draft.Normalize())
}

func (s *Note) GetNote(ctx context.Context, id string) (domain.Note, error) {
	user, err := domain.RequireUser(ctx)
	if err != nil {
		return domain.Note{}, err
	}
	return s.repo.GetByID(ctx, user.ID, id)
}

func (s *Note) ListNotes(ctx context.Context) ([]domain.Note, error) {
	user, err := domain.RequireUser(ctx)
	if err != nil {
		return nil, err
	}
	return s.repo.List(ctx, user.ID)
}

func (s *Note) SearchNotes(ctx context.Context, query domain.SearchQuery) ([]domain.Note, error) {
	user, err := domain.RequireUser(ctx)
	if err != nil {
		return nil, err
	}
	notes, err := s.repo.List(ctx, user.ID)
	if err != nil {
		return nil, err
	}

	out := make([]domain.Note, 0, len(notes))
	for _, note := range notes {
		if note.Matches(query) {
			out = append(out, note)
		}
	}
	return out, nil
}

func (s *Note) DeleteNote(ctx context.Context, id string) error {
	user, err := domain.RequireUser(ctx)
	if err != nil {
		return err
	}
	return s.repo.Delete(ctx, user.ID, id)
}

func (s *Note) AssistNote(ctx context.Context, id string, action domain.AIAction) (domain.AISuggestion, error) {
	user, err := domain.RequireUser(ctx)
	if err != nil {
		return domain.AISuggestion{}, err
	}
	note, err := s.repo.GetByID(ctx, user.ID, id)
	if err != nil {
		return domain.AISuggestion{}, err
	}

	if action == domain.AIActionCleanUp || action == domain.AIActionImproveClarity {
		return s.assistPreservingDiagrams(ctx, note, action)
	}
	return s.assistant.Assist(ctx, note, action)
}

func (s *Note) assistPreservingDiagrams(ctx context.Context, note domain.Note, action domain.AIAction) (domain.AISuggestion, error) {
	masked, diagrams := maskDiagramMarkers(note.Content)
	if len(diagrams) == 0 {
		return s.assistant.Assist(ctx, note, action)
	}

	maskedNote := note
	maskedNote.Content = masked
	suggestion, err := s.assistant.Assist(ctx, maskedNote, action)
	if err != nil {
		return domain.AISuggestion{}, err
	}

	suggestion.Text = unmaskDiagramMarkers(suggestion.Text, diagrams)
	return suggestion, nil
}

var diagramMarkerPattern = regexp.MustCompile(`^!\[diagram:[A-Za-z0-9_-]+\]$`)

func maskDiagramMarkers(content string) (string, []string) {
	lines := strings.Split(content, "\n")
	var diagrams []string
	for i, line := range lines {
		trimmed := strings.TrimSpace(line)
		if diagramMarkerPattern.MatchString(trimmed) {
			diagrams = append(diagrams, trimmed)
			lines[i] = diagramPlaceholder(len(diagrams) - 1)
		}
	}
	return strings.Join(lines, "\n"), diagrams
}

func unmaskDiagramMarkers(text string, diagrams []string) string {
	for i, marker := range diagrams {
		placeholder := diagramPlaceholder(i)
		if strings.Contains(text, placeholder) {
			text = strings.Replace(text, placeholder, marker, 1)
			continue
		}
		text = strings.TrimRight(text, "\n") + "\n\n" + marker
	}
	return text
}

func diagramPlaceholder(index int) string {
	return fmt.Sprintf("[DIAGRAM PLACEHOLDER #%d — DO NOT MODIFY, TRANSLATE, OR REMOVE THIS LINE]", index)
}

func (s *Note) AskNotes(ctx context.Context, req domain.AskRequest) (domain.AskAnswer, error) {
	user, err := domain.RequireUser(ctx)
	if err != nil {
		return domain.AskAnswer{}, err
	}
	question := strings.TrimSpace(req.Question)
	if question == "" {
		return domain.AskAnswer{}, domain.NewInvalidError("A question is required.")
	}

	notes, err := s.repo.List(ctx, user.ID)
	if err != nil {
		return domain.AskAnswer{}, err
	}

	relevant := rankNotes(question, notes)
	if len(relevant) == 0 {
		return domain.AskAnswer{Answer: "I could not find anything relevant in your notes yet."}, nil
	}

	if len(relevant) > 5 {
		relevant = relevant[:5]
	}
	answer, err := s.assistant.Ask(ctx, question, relevant)
	if err == nil {
		return answer, nil
	}
	return fallbackAskAnswer(relevant), nil
}

func (s *Note) ClaimLegacyNotes(ctx context.Context) (int64, error) {
	user, err := domain.RequireUser(ctx)
	if err != nil {
		return 0, err
	}
	if !user.IsAdmin() {
		return 0, domain.NewForbiddenError("Administrator access is required.")
	}
	return s.repo.ClaimOwner(ctx, "legacy", user.ID)
}

func (s *Note) GenerateAI(ctx context.Context, req domain.AICompletionRequest) (domain.AICompletion, error) {
	if _, err := domain.RequireUser(ctx); err != nil {
		return domain.AICompletion{}, err
	}
	prompt := strings.TrimSpace(req.Prompt)
	if prompt == "" {
		return domain.AICompletion{}, domain.NewInvalidError("A prompt is required.")
	}
	return s.assistant.Generate(ctx, prompt)
}

func rankNotes(query string, notes []domain.Note) []domain.Note {
	words := queryWords(query)
	type scoredNote struct {
		note  domain.Note
		score int
	}
	scored := make([]scoredNote, 0, len(notes))
	for _, note := range notes {
		haystack := strings.ToLower(note.Title + " " + note.Content + " " + strings.Join(note.Tags, " "))
		score := 0
		for _, word := range words {
			if strings.Contains(haystack, word) {
				score++
			}
		}
		if score > 0 {
			scored = append(scored, scoredNote{note: note, score: score})
		}
	}

	sort.Slice(scored, func(i, j int) bool {
		if scored[i].score == scored[j].score {
			return scored[i].note.UpdatedAt.After(scored[j].note.UpdatedAt)
		}
		return scored[i].score > scored[j].score
	})

	out := make([]domain.Note, 0, len(scored))
	for _, item := range scored {
		out = append(out, item.note)
	}
	return out
}

func queryWords(query string) []string {
	stop := map[string]bool{
		"about": true, "again": true, "are": true, "could": true, "did": true,
		"does": true, "for": true, "from": true, "have": true, "how": true,
		"need": true, "note": true, "notes": true, "that": true, "the": true,
		"this": true, "what": true, "when": true, "where": true, "which": true,
		"with": true, "would": true,
	}
	fields := strings.FieldsFunc(strings.ToLower(query), func(r rune) bool {
		return (r < 'a' || r > 'z') && (r < '0' || r > '9')
	})
	words := make([]string, 0, len(fields))
	for _, field := range fields {
		if len(field) > 2 && !stop[field] {
			words = append(words, field)
		}
	}
	return words
}

func fallbackAskAnswer(notes []domain.Note) domain.AskAnswer {
	sourceIDs := make([]string, 0, len(notes))
	for _, note := range notes {
		sourceIDs = append(sourceIDs, note.ID)
	}
	lead := firstSentence(notes[0].Content)
	if lead == "" {
		lead = notes[0].Title
	}
	if len(notes) == 1 {
		return domain.AskAnswer{
			Answer:    "From \"" + displayTitle(notes[0]) + "\": " + lead,
			SourceIDs: sourceIDs,
		}
	}
	return domain.AskAnswer{
		Answer:    "From \"" + displayTitle(notes[0]) + "\" and " + displayTitle(notes[1]) + ": " + lead,
		SourceIDs: sourceIDs,
	}
}

func firstSentence(content string) string {
	content = strings.TrimSpace(strings.ReplaceAll(content, "\n", " "))
	if content == "" {
		return ""
	}
	for _, sep := range []string{". ", "! ", "? "} {
		if before, _, ok := strings.Cut(content, sep); ok {
			return strings.TrimSpace(before) + strings.TrimSpace(sep)
		}
	}
	if len(content) > 180 {
		return strings.TrimSpace(content[:177]) + "..."
	}
	return content
}

func displayTitle(note domain.Note) string {
	title := strings.TrimSpace(note.Title)
	if title == "" {
		return "Untitled"
	}
	return title
}

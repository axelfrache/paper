package domain

import (
	"strings"
	"time"
)

type Note struct {
	ID        string
	Title     string
	Content   string
	Tags      []string
	Favorite  bool
	CreatedAt time.Time
	UpdatedAt time.Time
}

type NoteDraft struct {
	Title    string
	Content  string
	Tags     []string
	Favorite bool
}

type SearchQuery struct {
	Query string
	Tags  []string
}

type AIAction string

const (
	AIActionSummarize      AIAction = "summarize"
	AIActionExtractTasks   AIAction = "extract_tasks"
	AIActionSuggestTitle   AIAction = "suggest_title"
	AIActionSuggestTags    AIAction = "suggest_tags"
	AIActionCleanUp        AIAction = "clean_up"
	AIActionImproveClarity AIAction = "improve_clarity"
)

type AISuggestion struct {
	Action AIAction
	Text   string
}

type AskRequest struct {
	Question string
}

type AskAnswer struct {
	Answer    string
	SourceIDs []string
}

type AICompletionRequest struct {
	Prompt string
}

type AICompletion struct {
	Text string
}

type NoteImage struct {
	ID          string
	Name        string
	ContentType string
	Size        int64
	URL         string
}

type ImageUpload struct {
	Name        string
	ContentType string
	Data        []byte
}

func (n Note) Matches(q SearchQuery) bool {
	query := strings.ToLower(strings.TrimSpace(q.Query))
	if query != "" {
		haystack := strings.ToLower(n.Title + "\n" + n.Content + "\n" + strings.Join(n.Tags, " "))
		if !strings.Contains(haystack, query) {
			return false
		}
	}

	for _, tag := range NormalizeTags(q.Tags) {
		if !hasTag(n.Tags, tag) {
			return false
		}
	}

	return true
}

func (d NoteDraft) Normalize() NoteDraft {
	d.Title = strings.TrimSpace(d.Title)
	d.Content = strings.TrimSpace(d.Content)
	d.Tags = NormalizeTags(d.Tags)
	return d
}

func (d NoteDraft) Validate() error {
	return nil
}

func NormalizeTags(tags []string) []string {
	seen := make(map[string]bool, len(tags))
	out := make([]string, 0, len(tags))
	for _, tag := range tags {
		tag = strings.Trim(strings.ToLower(strings.TrimSpace(tag)), "#")
		if tag == "" || seen[tag] {
			continue
		}
		seen[tag] = true
		out = append(out, tag)
	}
	return out
}

func hasTag(tags []string, target string) bool {
	for _, tag := range NormalizeTags(tags) {
		if tag == target {
			return true
		}
	}
	return false
}

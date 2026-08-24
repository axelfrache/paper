package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/axelfrache/paper/backend/internal/core/domain"
)

type Config struct {
	Provider string
	BaseURL  string
	APIKey   string
	Model    string
}

type Client struct {
	provider string
	baseURL  string
	apiKey   string
	model    string
	http     *http.Client
}

func New(cfg Config) *Client {
	provider := strings.TrimSpace(strings.ToLower(cfg.Provider))
	if provider == "" {
		provider = "ai-gateway"
	}

	return &Client{
		provider: provider,
		baseURL:  strings.TrimRight(cfg.BaseURL, "/"),
		apiKey:   strings.TrimSpace(cfg.APIKey),
		model:    strings.TrimSpace(cfg.Model),
		http:     &http.Client{Timeout: 60 * time.Second},
	}
}

func (c *Client) Assist(ctx context.Context, note domain.Note, action domain.AIAction) (domain.AISuggestion, error) {
	prompt := buildPrompt(note, action)

	switch c.provider {
	case "ollama":
		return c.assistWithOllama(ctx, prompt, action)
	case "openai-compatible":
		return c.assistWithOpenAICompatible(ctx, prompt, action)
	default:
		return c.assistWithGateway(ctx, prompt, action)
	}
}

func (c *Client) Ask(ctx context.Context, question string, notes []domain.Note) (domain.AskAnswer, error) {
	sourceIDs := make([]string, 0, len(notes))
	for _, note := range notes {
		sourceIDs = append(sourceIDs, note.ID)
	}

	prompt := buildAskPrompt(question, notes)
	var suggestion domain.AISuggestion
	var err error
	switch c.provider {
	case "ollama":
		suggestion, err = c.assistWithOllama(ctx, prompt, domain.AIAction("ask_notes"))
	case "openai-compatible":
		suggestion, err = c.assistWithOpenAICompatible(ctx, prompt, domain.AIAction("ask_notes"))
	default:
		suggestion, err = c.assistWithGateway(ctx, prompt, domain.AIAction("ask_notes"))
	}
	if err != nil {
		return domain.AskAnswer{}, err
	}
	return domain.AskAnswer{Answer: suggestion.Text, SourceIDs: sourceIDs}, nil
}

func (c *Client) assistWithGateway(ctx context.Context, prompt string, action domain.AIAction) (domain.AISuggestion, error) {
	if c.apiKey == "" {
		return domain.AISuggestion{}, domain.NewAIError(http.StatusInternalServerError,
			"AI Gateway API key is not configured on the server.")
	}

	payload := generateRequest{
		Model:  fallback(c.model, "ai-gateway:json"),
		Prompt: prompt,
	}
	raw, err := c.postJSON(ctx, c.baseURL+"/v1/generate", payload, true)
	if err != nil {
		return domain.AISuggestion{}, err
	}

	text := readGatewayText(raw)
	if text == "" {
		return domain.AISuggestion{}, domain.NewAIError(http.StatusBadGateway,
			"AI Gateway returned an empty response.")
	}
	return domain.AISuggestion{Action: action, Text: text}, nil
}

func (c *Client) assistWithOllama(ctx context.Context, prompt string, action domain.AIAction) (domain.AISuggestion, error) {
	payload := ollamaGenerateRequest{
		Model:  fallback(c.model, "llama3.1"),
		Prompt: prompt,
		Stream: false,
	}
	raw, err := c.postJSON(ctx, c.baseURL+"/api/generate", payload, c.apiKey != "")
	if err != nil {
		return domain.AISuggestion{}, err
	}

	text := readOllamaText(raw)
	if text == "" {
		return domain.AISuggestion{}, domain.NewAIError(http.StatusBadGateway,
			"Ollama returned an empty response.")
	}
	return domain.AISuggestion{Action: action, Text: text}, nil
}

func (c *Client) assistWithOpenAICompatible(ctx context.Context, prompt string, action domain.AIAction) (domain.AISuggestion, error) {
	payload := chatCompletionRequest{
		Model: fallback(c.model, "llama3.1"),
		Messages: []chatMessage{
			{Role: "user", Content: prompt},
		},
	}
	raw, err := c.postJSON(ctx, c.baseURL+"/chat/completions", payload, c.apiKey != "")
	if err != nil {
		return domain.AISuggestion{}, err
	}

	text := readChatText(raw)
	if text == "" {
		return domain.AISuggestion{}, domain.NewAIError(http.StatusBadGateway,
			"The AI provider returned an empty response.")
	}
	return domain.AISuggestion{Action: action, Text: text}, nil
}

func (c *Client) postJSON(ctx context.Context, url string, payload any, auth bool) ([]byte, error) {
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, domain.NewAIError(http.StatusInternalServerError, "Unable to prepare the AI request.")
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return nil, domain.NewAIError(http.StatusInternalServerError, "Unable to prepare the AI request.")
	}
	req.Header.Set("Content-Type", "application/json")
	if auth {
		req.Header.Set("Authorization", "Bearer "+c.apiKey)
	}

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, domain.NewAIError(http.StatusBadGateway, "The AI service is currently unreachable.")
	}
	defer resp.Body.Close()

	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, domain.NewAIError(resp.StatusCode, "The AI provider rejected the request.")
	}
	return raw, nil
}

func buildPrompt(note domain.Note, action domain.AIAction) string {
	instruction := map[domain.AIAction]string{
		domain.AIActionSummarize:      "Summarize this personal note in five concise bullet points.",
		domain.AIActionExtractTasks:   "Extract concrete tasks from this note. Return only actionable checklist items.",
		domain.AIActionSuggestTitle:   "Suggest one short title for this note. Return only the title.",
		domain.AIActionSuggestTags:    "Suggest up to five short lowercase tags for this note. Return only comma-separated tags.",
		domain.AIActionCleanUp:        "Rewrite this note to be clearer and better structured while preserving intent.",
		domain.AIActionImproveClarity: "Rewrite this note to be clearer while preserving the author's intent.",
	}[action]
	if instruction == "" {
		instruction = "Help improve this note."
	}

	return strings.Join([]string{
		instruction,
		"",
		"Title: " + note.Title,
		"Tags: " + strings.Join(note.Tags, ", "),
		"Content:",
		note.Content,
	}, "\n")
}

func buildAskPrompt(question string, notes []domain.Note) string {
	parts := []string{
		"Answer the user's question using only the notes below.",
		"If the notes do not contain the answer, say that you could not find it.",
		"Keep the answer concise and cite note titles naturally.",
		"",
		"Question: " + question,
		"",
		"Notes:",
	}
	for _, note := range notes {
		parts = append(parts,
			"Title: "+note.Title,
			"Tags: "+strings.Join(note.Tags, ", "),
			"Content:",
			note.Content,
			"",
		)
	}
	return strings.Join(parts, "\n")
}

func fallback(value, fallback string) string {
	if strings.TrimSpace(value) == "" {
		return fallback
	}
	return value
}

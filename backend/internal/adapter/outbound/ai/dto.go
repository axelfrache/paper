package ai

import (
	"encoding/json"
	"strings"
)

type generateRequest struct {
	Model  string `json:"model"`
	Prompt string `json:"prompt"`
}

type generateResponse struct {
	Text string `json:"text"`
}

type ollamaGenerateRequest struct {
	Model  string `json:"model"`
	Prompt string `json:"prompt"`
	Stream bool   `json:"stream"`
}

type ollamaGenerateResponse struct {
	Response string `json:"response"`
}

type chatCompletionRequest struct {
	Model    string        `json:"model"`
	Messages []chatMessage `json:"messages"`
}

type chatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type chatCompletionResponse struct {
	Choices []struct {
		Message chatMessage `json:"message"`
	} `json:"choices"`
}

func readGatewayText(raw []byte) string {
	var payload generateResponse
	if err := json.Unmarshal(raw, &payload); err != nil {
		return ""
	}
	return strings.TrimSpace(payload.Text)
}

func readOllamaText(raw []byte) string {
	var payload ollamaGenerateResponse
	if err := json.Unmarshal(raw, &payload); err != nil {
		return ""
	}
	return strings.TrimSpace(payload.Response)
}

func readChatText(raw []byte) string {
	var payload chatCompletionResponse
	if err := json.Unmarshal(raw, &payload); err != nil {
		return ""
	}
	for _, choice := range payload.Choices {
		if text := strings.TrimSpace(choice.Message.Content); text != "" {
			return text
		}
	}
	return ""
}

package domain

type ChatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type ChatContext struct {
	Title   string   `json:"title"`
	Content string   `json:"content"`
	Tags    []string `json:"tags"`
}

type ChatRequest struct {
	Scope     string        `json:"scope"`
	NoteID    string        `json:"noteId"`
	NoteIDs   []string      `json:"noteIds,omitempty"`
	Draft     *ChatContext  `json:"draft,omitempty"`
	Selection string        `json:"selection,omitempty"`
	Action    AIAction      `json:"action,omitempty"`
	Messages  []ChatMessage `json:"messages"`
}

type ChatAnswer struct {
	Text      string   `json:"text"`
	SourceIDs []string `json:"sourceIds"`
}

package domain

import "fmt"

type ErrorKind string

const (
	KindInvalid          ErrorKind = "invalid"
	KindNotFound         ErrorKind = "not_found"
	KindTooLarge         ErrorKind = "too_large"
	KindUnsupportedMedia ErrorKind = "unsupported_media"
	KindAIUnavailable    ErrorKind = "ai_unavailable"
)

type AppError struct {
	Kind    ErrorKind
	Message string
	Status  int
}

func (e *AppError) Error() string {
	return e.Message
}

func NewInvalidError(format string, args ...any) error {
	return &AppError{Kind: KindInvalid, Message: fmt.Sprintf(format, args...)}
}

func NewNotFoundError(format string, args ...any) error {
	return &AppError{Kind: KindNotFound, Message: fmt.Sprintf(format, args...)}
}

func NewAIError(status int, format string, args ...any) error {
	return &AppError{Kind: KindAIUnavailable, Status: status, Message: fmt.Sprintf(format, args...)}
}

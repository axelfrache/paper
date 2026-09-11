package http

import (
	"context"
	"io"
	stdhttp "net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/axelfrache/paper/backend/internal/core/domain"
	"github.com/axelfrache/paper/backend/internal/core/port"
)

type stubImageService struct {
	contentType string
}

func (s stubImageService) Upload(_ context.Context, _ string, _ domain.ImageUpload) (domain.NoteImage, error) {
	return domain.NoteImage{}, nil
}

func (s stubImageService) Open(_ context.Context, _ string) (port.StoredImage, error) {
	return port.StoredImage{
		Body:        io.NopCloser(strings.NewReader("data")),
		Name:        "image",
		ContentType: s.contentType,
		Size:        4,
	}, nil
}

func (s stubImageService) Delete(_ context.Context, _ string) error {
	return nil
}

func serveImage(contentType string) *httptest.ResponseRecorder {
	handler := NewHandler(nil, stubImageService{contentType: contentType})
	recorder := httptest.NewRecorder()
	handler.GetNoteImage(recorder, httptest.NewRequest(stdhttp.MethodGet, "/api/images/x", nil))
	return recorder
}

func TestGetNoteImageSendsDefensiveHeaders(t *testing.T) {
	for _, contentType := range []string{"image/png", "image/svg+xml"} {
		recorder := serveImage(contentType)
		if recorder.Header().Get("X-Content-Type-Options") != "nosniff" {
			t.Fatalf("%s: missing nosniff header", contentType)
		}
		if !strings.Contains(recorder.Header().Get("Content-Security-Policy"), "sandbox") {
			t.Fatalf("%s: missing sandbox content security policy", contentType)
		}
	}
}

func TestGetNoteImageServesSVGAsAttachment(t *testing.T) {
	svg := serveImage("image/svg+xml")
	if !strings.HasPrefix(svg.Header().Get("Content-Disposition"), "attachment") {
		t.Fatalf("expected an SVG to be served as attachment, got %q", svg.Header().Get("Content-Disposition"))
	}

	png := serveImage("image/png")
	if !strings.HasPrefix(png.Header().Get("Content-Disposition"), "inline") {
		t.Fatalf("expected a raster image to be served inline, got %q", png.Header().Get("Content-Disposition"))
	}
}

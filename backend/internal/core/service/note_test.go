package service

import (
	"strings"
	"testing"
)

func TestMaskDiagramMarkersRoundTrip(t *testing.T) {
	content := "Intro\n![diagram:abc123]\nMiddle\n![diagram:def456]\nEnd"

	masked, diagrams := maskDiagramMarkers(content)
	if len(diagrams) != 2 {
		t.Fatalf("expected 2 diagram markers, got %d", len(diagrams))
	}
	if strings.Contains(masked, "![diagram:") {
		t.Fatalf("masked content still contains a raw diagram marker: %q", masked)
	}

	restored := unmaskDiagramMarkers(masked, diagrams)
	if restored != content {
		t.Fatalf("round-trip mismatch:\n got: %q\nwant: %q", restored, content)
	}
}

func TestUnmaskDiagramMarkersAppendsWhenPlaceholderDropped(t *testing.T) {
	diagrams := []string{"![diagram:abc123]"}
	rewritten := "The model rewrote everything and lost the placeholder."

	restored := unmaskDiagramMarkers(rewritten, diagrams)
	if !strings.Contains(restored, "![diagram:abc123]") {
		t.Fatalf("expected dropped diagram to be appended, got: %q", restored)
	}
}

func TestMaskDiagramMarkersNoop(t *testing.T) {
	content := "Just plain text with no diagrams."
	masked, diagrams := maskDiagramMarkers(content)
	if len(diagrams) != 0 {
		t.Fatalf("expected no diagrams, got %d", len(diagrams))
	}
	if masked != content {
		t.Fatalf("expected content unchanged, got: %q", masked)
	}
}

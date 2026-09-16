import { describe, expect, it } from "vitest";
import {
  diagramIconHasTones,
  diagramIconHref,
  diagramIconTones,
  diagramToneSwatch,
  isDiagramIconTone,
} from "./diagramIcons";

describe("diagram icon tones", () => {
  it("resolves the tone file for a tone-capable iso icon", () => {
    expect(diagramIconHref("container", "iso", "carrot")).toBe("/diagram-icons/cloud-native/tones/container/carrot.svg");
    expect(diagramIconHref("storage", "iso", "grape")).toBe("/diagram-icons/cloud-native/tones/storage/grape.svg");
    expect(diagramIconHref("application-package", "iso", "emeraude")).toBe(
      "/diagram-icons/cloud-native/tones/application-package/emeraude.svg",
    );
  });

  it("falls back to the base iso icon without a tone or with an unknown tone", () => {
    expect(diagramIconHref("container", "iso")).toBe("/diagram-icons/cloud-native/container.svg");
    expect(diagramIconHref("container", "iso", "bogus")).toBe("/diagram-icons/cloud-native/container.svg");
  });

  it("ignores tones in flat mode", () => {
    expect(diagramIconHref("container", "flat", "carrot")).toBe("/diagram-icons/flat/container.svg");
  });

  it("only marks tone families as tone-capable", () => {
    expect(diagramIconHasTones("container")).toBe(true);
    expect(diagramIconHasTones("application-package")).toBe(true);
    expect(diagramIconHasTones("storage")).toBe(true);
    expect(diagramIconHasTones("server")).toBe(false);
  });

  it("exposes a valid swatch color for every tone", () => {
    for (const tone of diagramIconTones) {
      expect(diagramToneSwatch[tone]).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("validates tone names", () => {
    expect(isDiagramIconTone("carrot")).toBe(true);
    expect(isDiagramIconTone("bogus")).toBe(false);
    expect(isDiagramIconTone(null)).toBe(false);
  });
});

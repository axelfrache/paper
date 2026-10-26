import { describe, expect, it } from "vitest";
import {
  diagramIconHasPalette,
  diagramIconHasTones,
  diagramIconHref,
  diagramIconPaletteColors,
  diagramIconTones,
  diagramToneSwatch,
  isDiagramIconPaletteColor,
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

describe("diagram icon palette", () => {
  it("resolves the palette file for a palette-capable iso icon", () => {
    expect(diagramIconHref("proxmox", "iso", null, "slate")).toBe("/diagram-icons/cloud-native/palette/proxmox/slate.svg");
    expect(diagramIconHref("grafana", "iso", null, "violet")).toBe("/diagram-icons/cloud-native/palette/grafana/violet.svg");
    expect(diagramIconHref("server", "iso", null, "green")).toBe("/diagram-icons/cloud-native/palette/server/green.svg");
    expect(diagramIconHref("virtual-machine", "iso", null, "amber")).toBe("/diagram-icons/cloud-native/palette/vm/amber.svg");
  });

  it("falls back to the default color without a color or with an unknown color", () => {
    expect(diagramIconHref("proxmox", "iso")).toBe("/diagram-icons/cloud-native/palette/proxmox/blue.svg");
    expect(diagramIconHref("grafana", "iso")).toBe("/diagram-icons/cloud-native/palette/grafana/amber.svg");
    expect(diagramIconHref("server", "iso")).toBe("/diagram-icons/cloud-native/palette/server/blue.svg");
    expect(diagramIconHref("virtual-machine", "iso")).toBe("/diagram-icons/cloud-native/palette/vm/blue.svg");
    expect(diagramIconHref("proxmox", "iso", null, "bogus")).toBe("/diagram-icons/cloud-native/palette/proxmox/blue.svg");
  });

  it("ignores colors in flat mode", () => {
    expect(diagramIconHref("proxmox", "flat", null, "green")).toBe("/diagram-icons/flat/server.svg");
    expect(diagramIconHref("grafana", "flat", null, "green")).toBe("/diagram-icons/flat/grafana.svg");
    expect(diagramIconHref("server", "flat", null, "green")).toBe("/diagram-icons/flat/server.svg");
    expect(diagramIconHref("virtual-machine", "flat", null, "green")).toBe("/diagram-icons/flat/virtual-machine.svg");
  });

  it("only marks palette families as palette-capable", () => {
    expect(diagramIconHasPalette("proxmox")).toBe(true);
    expect(diagramIconHasPalette("grafana")).toBe(true);
    expect(diagramIconHasPalette("server")).toBe(true);
    expect(diagramIconHasPalette("virtual-machine")).toBe(true);
    expect(diagramIconHasPalette("server-rack")).toBe(false);
  });

  it("validates palette color names", () => {
    for (const color of diagramIconPaletteColors) {
      expect(isDiagramIconPaletteColor(color)).toBe(true);
    }
    expect(isDiagramIconPaletteColor("bogus")).toBe(false);
    expect(isDiagramIconPaletteColor(null)).toBe(false);
  });
});

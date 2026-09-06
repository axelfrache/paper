import { diagramIconHref } from "./diagramIcons";
import {
  diagramPalette,
  edgeLabelHalo,
  edgeLabelPlate,
  labelLines,
  layoutDiagram,
} from "./diagram";
import type { Diagram, DiagramLayout, DiagramLayoutEdge, DiagramLayoutNode, DiagramMode } from "./diagram";

export type DiagramExportFormat = "svg" | "png";
export type DiagramExportBackground = "white" | "transparent";

export type DiagramExportOptions = {
  background: DiagramExportBackground;
  padding: number;
  // Device-pixel multiplier for PNG. SVG ignores it (vectors stay crisp).
  scale: number;
};

export const defaultExportOptions: DiagramExportOptions = { background: "white", padding: 24, scale: 2 };

// The export always reads on a light surface, whatever theme the app is in, so it uses
// the light palette's concrete colours rather than the app's CSS variables.
const exportColors = {
  label: "#16181b",
  labelBare: "#4c5259",
  edgeLabel: "#4c5259",
  white: "#ffffff",
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
};

// Longest PNG side, so a huge diagram cannot ask the browser for a gigapixel canvas.
const maxPngSide = 4096;

type IconResolver = (url: string) => Promise<string>;

const iconCache = new Map<string, string>();

/** Fetches an icon and returns it as a data URI so the exported file is self-contained. */
export async function fetchIconAsDataUri(url: string): Promise<string> {
  const cached = iconCache.get(url);
  if (cached) {
    return cached;
  }
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`icon fetch failed: ${url}`);
  }
  const blob = await response.blob();
  const dataUri = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  iconCache.set(url, dataUri);
  return dataUri;
}

/**
 * Builds a standalone SVG string: external icons inlined as data URIs, colours resolved
 * to concrete values, label styles inlined, an xmlns and real pixel size — everything the
 * in-app preview omits because it lives inside the app's stylesheet and origin.
 */
export async function buildStandaloneSvg(
  diagram: Diagram,
  options: DiagramExportOptions = defaultExportOptions,
  resolveIcon: IconResolver = fetchIconAsDataUri,
): Promise<string> {
  const layout = layoutDiagram(diagram);
  const [minX, minY, width, height] = layout.viewBox.split(/\s+/).map(Number);
  const pad = Math.max(0, options.padding);
  const vb = { x: minX - pad, y: minY - pad, w: width + pad * 2, h: height + pad * 2 };

  // Resolve every distinct icon up front, so emission stays synchronous and cache-friendly.
  const icons = new Map<string, string>();
  await Promise.all(
    layout.nodes
      .filter((node) => node.icon)
      .map(async (node) => {
        const url = diagramIconHref(node.icon!, diagram.mode);
        if (!icons.has(url)) {
          icons.set(url, await resolveIcon(url).catch(() => ""));
        }
      }),
  );
  const iconHref = (node: DiagramLayoutNode) => icons.get(diagramIconHref(node.icon!, diagram.mode)) ?? "";

  const halo = options.background === "transparent" ? exportColors.white : backgroundColor(options.background);
  const body = renderBody(layout, diagram.mode, iconHref, halo);
  const background =
    options.background === "transparent"
      ? ""
      : `<rect x="${vb.x}" y="${vb.y}" width="${vb.w}" height="${vb.h}" fill="${backgroundColor(options.background)}"/>`;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.x} ${vb.y} ${vb.w} ${vb.h}"`,
    ` width="${round(vb.w)}" height="${round(vb.h)}" font-family="${exportColors.fontFamily}">`,
    `<defs>${arrowDefs()}<style>`,
    `text.export-edge-label{paint-order:stroke;stroke:${halo};stroke-linejoin:round;fill:${exportColors.edgeLabel};font-size:11px;font-weight:500}`,
    `rect.export-edge-label-plate{fill:${halo}}`,
    `</style></defs>`,
    background,
    body,
    `</svg>`,
  ].join("");
}

function renderBody(layout: DiagramLayout, mode: DiagramMode, iconHref: (n: DiagramLayoutNode) => string, halo: string) {
  const edges = layout.edges
    .map((edge) => {
      const cap = edge.markerStart || edge.markerEnd ? "butt" : "round";
      return `<path d="${edge.d}" fill="none" stroke="${edge.color}" stroke-width="${edge.width}" stroke-linecap="${cap}" stroke-linejoin="round"${edge.markerStart ? ` marker-start="${edge.markerStart}"` : ""}${edge.markerEnd ? ` marker-end="${edge.markerEnd}"` : ""}${edge.dashed ? ' stroke-dasharray="7 6"' : ""}/>`;
    })
    .join("");
  const edgeLabels = layout.edges.map((edge) => edgeLabel(edge)).join("");
  const nodes = layout.nodes
    .map((node) => {
      const faces = node.faces
        .map((face) => `<path d="${face.d}" fill="${face.fill}" stroke="${face.stroke}" stroke-width="1.4"/>`)
        .join("");
      const cap = node.cap
        ? `<text x="${node.cx}" y="${node.capY}" text-anchor="middle" font-size="8.5" letter-spacing="1" font-weight="700" fill="${node.color}">${escapeText(node.cap)}</text>`
        : "";
      const icon = nodeIcon(node, mode, iconHref(node));
      const size = node.bare ? 11.5 : 13;
      const fill = node.bare ? exportColors.labelBare : exportColors.label;
      const label = tspans(node.label, node.cx, node.labelY, size * 1.25);
      return `${faces}${cap}${icon}<text text-anchor="middle" font-size="${size}" font-weight="${node.bare ? 500 : 530}" fill="${fill}">${label}</text>`;
    })
    .join("");
  return `${edges}${edgeLabels}${nodes}`;
}

function edgeLabel(edge: DiagramLayoutEdge) {
  if (!edge.label) {
    return "";
  }
  const body = tspans(edge.label, edge.labelX, edge.labelY, 13, true);
  const plate = edgeLabelPlate(edge.label, edge.labelX, edge.labelY);
  const backing = plate
    ? `<rect class="export-edge-label-plate" x="${plate.x}" y="${plate.y}" width="${plate.width}" height="${plate.height}"/>`
    : "";
  return `${backing}<text class="export-edge-label" text-anchor="middle" dominant-baseline="central" stroke-width="${edgeLabelHalo(edge.width)}">${body}</text>`;
}

function nodeIcon(node: DiagramLayoutNode, mode: DiagramMode, href: string) {
  if (!node.icon || !href) {
    return "";
  }
  const box = `x="${node.iconX}" y="${node.iconY}" width="${node.iconSize}" height="${node.iconSize}"`;
  if (mode === "flat") {
    const maskId = `export-icon-mask-${idSafe(node.id)}`;
    return `<defs><mask id="${maskId}" maskUnits="userSpaceOnUse" ${box} style="mask-type:alpha;"><image href="${href}" ${box} preserveAspectRatio="xMidYMid meet"/></mask></defs><rect ${box} fill="${node.color}" mask="url(#${maskId})"/>`;
  }
  return `<image href="${href}" ${box} preserveAspectRatio="xMidYMid meet"/>`;
}

function tspans(text: string, x: number, y: number, lineHeight: number, centred = false) {
  return labelLines(text, x, y, lineHeight, centred)
    .map((line) => `<tspan x="${line.x}" y="${line.y}">${escapeText(line.text)}</tspan>`)
    .join("");
}

function arrowDefs() {
  return Object.entries(diagramPalette)
    .map(
      ([name, color]) =>
        `<marker id="diagram-arrow-${name}" viewBox="0 0 10 10" refX="0" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 1L9 5L0 9z" fill="${color.stroke}"/></marker>`,
    )
    .join("");
}

function backgroundColor(background: DiagramExportBackground) {
  return background === "white" ? exportColors.white : "none";
}

/** Rasterises the standalone SVG through a canvas. Only works once icons are inlined. */
export async function svgToPngBlob(svg: string, pixelScale = defaultExportOptions.scale): Promise<Blob> {
  const dimensions = svgPixelSize(svg);
  const scale = clampScale(pixelScale, dimensions);
  const image = await loadSvgImage(svg);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(dimensions.width * scale);
  canvas.height = Math.round(dimensions.height * scale);
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("canvas 2d context unavailable");
  }
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("PNG encoding failed"))), "image/png");
  });
}

function loadSvgImage(svg: string): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("SVG image failed to load"));
    };
    image.src = url;
  });
}

/** Keeps the longest side under maxPngSide so the canvas request stays sane. */
export function clampScale(scale: number, size: { width: number; height: number }) {
  const longest = Math.max(size.width, size.height) * scale;
  return longest > maxPngSide ? maxPngSide / Math.max(size.width, size.height) : scale;
}

export function svgPixelSize(svg: string) {
  const width = Number(/width="([\d.]+)"/.exec(svg)?.[1]);
  const height = Number(/height="([\d.]+)"/.exec(svg)?.[1]);
  return { width: Number.isFinite(width) ? width : 0, height: Number.isFinite(height) ? height : 0 };
}

/** Turns a note title (and mode) into a safe, descriptive file name. */
export function exportFileName(title: string, mode: DiagramMode, format: DiagramExportFormat) {
  const base = title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "diagram";
  return `${base}-${mode}.${format}`;
}

export async function downloadDiagram(
  diagram: Diagram,
  format: DiagramExportFormat,
  title: string,
  options: DiagramExportOptions = defaultExportOptions,
) {
  const svg = await buildStandaloneSvg(diagram, options);
  const blob =
    format === "svg" ? new Blob([svg], { type: "image/svg+xml" }) : await svgToPngBlob(svg, options.scale);
  triggerDownload(blob, exportFileName(title, diagram.mode, format));
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function escapeText(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function idSafe(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "");
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}

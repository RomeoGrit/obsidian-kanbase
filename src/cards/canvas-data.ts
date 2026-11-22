/**
 * Pure helpers for building Obsidian Canvas documents out of a note.
 *
 * Everything here is deliberately free of runtime `obsidian` imports so the
 * unit tests can exercise it without the app. See `card-canvas.ts` for the
 * vault-facing part.
 */

export interface CanvasTextNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  type: "text";
  text: string;
}

export type CanvasSide = "top" | "right" | "bottom" | "left";

export interface CanvasEdge {
  id: string;
  fromNode: string;
  fromSide: CanvasSide;
  toNode: string;
  toSide: CanvasSide;
}

export interface CanvasDocument {
  nodes: CanvasTextNode[];
  edges: CanvasEdge[];
}

/** Canvas node ids are short opaque strings; any unique token works. */
export function canvasId(): string {
  let id = "";
  for (let i = 0; i < 16; i++) {
    id += Math.floor(Math.random() * 16).toString(16);
  }
  return id;
}

/** Drop a leading YAML frontmatter block, returning the note's body. */
export function stripFrontmatter(raw: string): string {
  const match = raw.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  return match ? raw.slice(match[0].length) : raw;
}

/** Render a frontmatter value as readable markdown (used by canvas nodes). */
export function renderPropertyValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) {
    return value.map((item) => renderPropertyValue(item)).join(", ");
  }
  if (typeof value === "object") {
    const link = (value as { link?: unknown }).link;
    if (typeof link === "string") return `[[${link}]]`;
    return JSON.stringify(value);
  }
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}

/**
 * Render frontmatter properties as a markdown bullet list, so a converted
 * canvas keeps the tags/status that used to live in the note.
 */
export function propertiesToMarkdown(
  properties: Record<string, unknown>,
): string {
  return Object.keys(properties)
    .map((key) => `- **${key}**: ${renderPropertyValue(properties[key])}`)
    .join("\n");
}

export interface BuildCanvasOptions {
  /** Note title — becomes the hub node. */
  title: string;
  /** Note body (frontmatter already stripped). Omit to skip the body node. */
  body?: string;
  /** Frontmatter properties — adds a side node preserving them. */
  properties?: Record<string, unknown>;
}

const TITLE_WIDTH = 560;
const TITLE_HEIGHT = 110;
const BODY_TOP = 170;
const BODY_WIDTH = 560;
const BODY_HEIGHT = 360;
const PROPS_X = 640;
const PROPS_WIDTH = 360;
const PROPS_HEIGHT = 280;

/**
 * Build a canvas with the task title as the hub, the note body hanging below
 * it and (optionally) a properties node beside it.
 */
export function buildCanvas(options: BuildCanvasOptions): CanvasDocument {
  const titleId = canvasId();
  const nodes: CanvasTextNode[] = [
    {
      id: titleId,
      x: 0,
      y: 0,
      width: TITLE_WIDTH,
      height: TITLE_HEIGHT,
      type: "text",
      text: `# ${options.title}`,
    },
  ];
  const edges: CanvasEdge[] = [];

  const body = options.body?.trim();
  if (body) {
    const bodyId = canvasId();
    nodes.push({
      id: bodyId,
      x: 0,
      y: BODY_TOP,
      width: BODY_WIDTH,
      height: BODY_HEIGHT,
      type: "text",
      text: body,
    });
    edges.push({
      id: canvasId(),
      fromNode: titleId,
      fromSide: "bottom",
      toNode: bodyId,
      toSide: "top",
    });
  }

  if (options.properties && Object.keys(options.properties).length > 0) {
    nodes.push({
      id: canvasId(),
      x: PROPS_X,
      y: 0,
      width: PROPS_WIDTH,
      height: PROPS_HEIGHT,
      type: "text",
      text: `### Note properties\n\n${propertiesToMarkdown(options.properties)}`,
    });
  }

  return { nodes, edges };
}

/** "Tasks/Do it.md" → "Tasks/Do it.canvas" (canvas sits beside its note). */
export function canvasPathFor(notePath: string): string {
  return notePath.replace(/\.md$/i, ".canvas");
}

/**
 * Pick a free path for the canvas: the natural one when available, otherwise
 * "Name 1.canvas", "Name 2.canvas", …
 */
export function uniqueCanvasPath(
  path: string,
  exists: (candidate: string) => boolean,
): string {
  if (!exists(path)) return path;
  const dot = path.lastIndexOf(".");
  const base = dot > 0 ? path.slice(0, dot) : path;
  const extension = dot > 0 ? path.slice(dot) : "";
  let counter = 1;
  while (exists(`${base} ${counter}${extension}`)) counter++;
  return `${base} ${counter}${extension}`;
}

/** Marker identifying the node that preserves a note's frontmatter. */
export const PROPERTIES_NODE_MARKER = "### Note properties";

/** True when a canvas already carries the frontmatter-preserving node. */
export function hasPropertiesNode(document: CanvasDocument): boolean {
  return document.nodes.some(
    (node) =>
      node.type === "text" && node.text.startsWith(PROPERTIES_NODE_MARKER),
  );
}

/** Position for a node appended to an existing canvas (to the right of all). */
export function appendPosition(
  document: CanvasDocument,
  width: number,
  height: number,
): { x: number; y: number } {
  const right = document.nodes.reduce(
    (max, node) => Math.max(max, node.x + node.width),
    0,
  );
  const bottom = document.nodes.reduce(
    (max, node) => Math.max(max, node.y + node.height),
    0,
  );
  return { x: right + 80, y: Math.max(0, bottom - height) };
}

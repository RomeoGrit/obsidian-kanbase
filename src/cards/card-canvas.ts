import { Notice, TFile, type App } from "obsidian";
import {
  appendPosition,
  buildCanvas,
  canvasId,
  canvasPathFor,
  hasPropertiesNode,
  PROPERTIES_NODE_MARKER,
  propertiesToMarkdown,
  stripFrontmatter,
  uniqueCanvasPath,
  type CanvasDocument,
} from "./canvas-data";

const PROPERTIES_NODE_WIDTH = 360;
const PROPERTIES_NODE_HEIGHT = 280;

/** Frontmatter of a note, as an object of raw values. */
function frontmatterOf(app: App, note: TFile): Record<string, unknown> {
  return app.metadataCache.getFileCache(note)?.frontmatter ?? {};
}

/**
 * Find or create the canvas that belongs to `note`. The canvas always sits
 * beside the note (`Note.canvas`), so it survives vault moves and never has
 * to be registered anywhere.
 *
 * When `includeProperties` is set, the note's frontmatter is written into the
 * canvas as its own node — used by "Convert to canvas", where the note itself
 * is about to disappear.
 */
async function ensureCanvas(
  app: App,
  note: TFile,
  includeProperties: boolean,
): Promise<TFile> {
  const existing = app.vault.getAbstractFileByPath(canvasPathFor(note.path));
  if (existing instanceof TFile) {
    if (includeProperties) await preserveProperties(app, note, existing);
    return existing;
  }

  const raw = await app.vault.cachedRead(note);
  const document = buildCanvas({
    title: note.basename,
    body: stripFrontmatter(raw),
    properties: includeProperties ? frontmatterOf(app, note) : undefined,
  });
  const path = uniqueCanvasPath(canvasPathFor(note.path), (candidate) => {
    return app.vault.getAbstractFileByPath(candidate) !== null;
  });
  return app.vault.create(path, JSON.stringify(document, null, 2));
}

/**
 * Add the frontmatter node to a canvas that already exists but was created
 * without one (e.g. via "Open canvas" before converting). Skipped when the
 * node is already there, so repeated converts never duplicate it.
 */
async function preserveProperties(
  app: App,
  note: TFile,
  canvas: TFile,
): Promise<void> {
  const properties = frontmatterOf(app, note);
  if (Object.keys(properties).length === 0) return;

  let document: CanvasDocument;
  try {
    document = JSON.parse(await app.vault.cachedRead(canvas)) as CanvasDocument;
  } catch {
    return; // Hand-edited or unreadable canvas — leave it alone.
  }
  if (!document || !Array.isArray(document.nodes)) return;
  if (hasPropertiesNode(document)) return;

  const { x, y } = appendPosition(
    document,
    PROPERTIES_NODE_WIDTH,
    PROPERTIES_NODE_HEIGHT,
  );
  document.nodes.push({
    id: canvasId(),
    x,
    y,
    width: PROPERTIES_NODE_WIDTH,
    height: PROPERTIES_NODE_HEIGHT,
    type: "text",
    text: `${PROPERTIES_NODE_MARKER}\n\n${propertiesToMarkdown(properties)}`,
  });
  await app.vault.modify(canvas, JSON.stringify(document, null, 2));
}

/** Open the note's canvas, creating it (title + note body) when missing. */
export async function openOrCreateCanvas(app: App, note: TFile): Promise<void> {
  try {
    const canvas = await ensureCanvas(app, note, false);
    await app.workspace.getLeaf("tab").openFile(canvas);
  } catch (error) {
    new Notice(`Could not open canvas: ${String(error)}`);
  }
}

/**
 * Move a card's content into a canvas: the note's body and frontmatter end up
 * as canvas nodes and the note itself goes to the trash, so the card leaves
 * the board while nothing it contained is lost.
 */
export async function convertNoteToCanvas(
  app: App,
  note: TFile,
): Promise<void> {
  try {
    const canvas = await ensureCanvas(app, note, true);
    await app.workspace.getLeaf("tab").openFile(canvas);
    await app.fileManager.trashFile(note);
    new Notice(
      `"${note.basename}" converted to canvas — the note is in the trash`,
    );
  } catch (error) {
    new Notice(`Could not convert to canvas: ${String(error)}`);
  }
}

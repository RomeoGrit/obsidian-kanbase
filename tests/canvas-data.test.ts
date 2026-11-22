import { describe, expect, it } from "vitest";
import {
  appendPosition,
  buildCanvas,
  canvasPathFor,
  hasPropertiesNode,
  propertiesToMarkdown,
  renderPropertyValue,
  stripFrontmatter,
  uniqueCanvasPath,
} from "../src/cards/canvas-data";

describe("stripFrontmatter", () => {
  it("drops the leading frontmatter block", () => {
    const raw = "---\nstatus: Now\ntags:\n  - a\n---\n\nBody text\n";
    expect(stripFrontmatter(raw)).toBe("\nBody text\n");
  });

  it("keeps CRLF bodies intact", () => {
    const raw = "---\r\nstatus: Now\r\n---\r\nBody\r\n";
    expect(stripFrontmatter(raw)).toBe("Body\r\n");
  });

  it("returns the note unchanged when there is no frontmatter", () => {
    expect(stripFrontmatter("# Just a heading\n")).toBe("# Just a heading\n");
    expect(stripFrontmatter("")).toBe("");
  });
});

describe("renderPropertyValue", () => {
  it("joins lists with commas", () => {
    expect(renderPropertyValue(["a", "b"])).toBe("a, b");
  });

  it("renders link objects as wikilinks", () => {
    expect(renderPropertyValue({ link: "Tasks/IV work", path: "x" })).toBe(
      "[[Tasks/IV work]]",
    );
  });

  it("falls back to JSON for other objects", () => {
    expect(renderPropertyValue({ a: 1 })).toBe('{"a":1}');
  });

  it("stringifies scalars and empty values", () => {
    expect(renderPropertyValue(42)).toBe("42");
    expect(renderPropertyValue(null)).toBe("");
  });
});

describe("propertiesToMarkdown", () => {
  it("renders one bullet per property", () => {
    expect(propertiesToMarkdown({ status: "Now", tags: ["a", "b"] })).toBe(
      "- **status**: Now\n- **tags**: a, b",
    );
  });
});

describe("buildCanvas", () => {
  it("puts the title in a hub node", () => {
    const document = buildCanvas({ title: "Write report" });
    expect(document.nodes).toHaveLength(1);
    expect(document.nodes[0].text).toBe("# Write report");
    expect(document.nodes[0].type).toBe("text");
    expect(document.edges).toHaveLength(0);
  });

  it("hangs the body under the title and links them", () => {
    const document = buildCanvas({ title: "T", body: "Some steps" });
    expect(document.nodes).toHaveLength(2);
    expect(document.nodes[1].text).toBe("Some steps");
    expect(document.edges).toEqual([
      {
        id: expect.any(String),
        fromNode: document.nodes[0].id,
        fromSide: "bottom",
        toNode: document.nodes[1].id,
        toSide: "top",
      },
    ]);
  });

  it("skips an empty body", () => {
    const document = buildCanvas({ title: "T", body: "   \n" });
    expect(document.nodes).toHaveLength(1);
    expect(document.edges).toHaveLength(0);
  });

  it("adds a properties node when frontmatter is given", () => {
    const document = buildCanvas({ title: "T", properties: { tags: ["x"] } });
    expect(document.nodes).toHaveLength(2);
    const props = document.nodes[1];
    expect(props.text.startsWith("### Note properties")).toBe(true);
    expect(props.text).toContain("- **tags**: x");
    expect(hasPropertiesNode(document)).toBe(true);
  });

  it("gives every node a unique id", () => {
    const document = buildCanvas({
      title: "T",
      body: "B",
      properties: { a: 1 },
    });
    const ids = document.nodes.map((node) => node.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("canvasPathFor", () => {
  it("keeps the folder and swaps the extension", () => {
    expect(canvasPathFor("Tasks/IV work.md")).toBe("Tasks/IV work.canvas");
    expect(canvasPathFor("Board.MD")).toBe("Board.canvas");
  });
});

describe("uniqueCanvasPath", () => {
  it("returns the natural path when it is free", () => {
    expect(uniqueCanvasPath("Tasks/A.canvas", () => false)).toBe(
      "Tasks/A.canvas",
    );
  });

  it("suffixes numbered names until one is free", () => {
    const taken = new Set(["Tasks/A.canvas", "Tasks/A 1.canvas"]);
    expect(uniqueCanvasPath("Tasks/A.canvas", (p) => taken.has(p))).toBe(
      "Tasks/A 2.canvas",
    );
  });
});

describe("appendPosition", () => {
  it("places a node to the right of everything on the canvas", () => {
    const document = buildCanvas({ title: "T", body: "B" });
    const position = appendPosition(document, 360, 280);
    const right = Math.max(...document.nodes.map((n) => n.x + n.width));
    expect(position.x).toBe(right + 80);
    expect(position.y).toBeGreaterThanOrEqual(0);
  });

  it("starts at the origin for an empty canvas", () => {
    expect(appendPosition({ nodes: [], edges: [] }, 360, 280)).toEqual({
      x: 80,
      y: 0,
    });
  });
});

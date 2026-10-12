import { ArticleFrontmatter } from "@huddle/shared";
import { describe, expect, it } from "vitest";

import { buildBundle } from "../src/bundle.js";
import { linkPlays, renderArticle, storedHash } from "../src/emit.js";
import { DATA_DIR } from "./helpers.js";

const recap = buildBundle("recap", DATA_DIR, 2026, 3);

describe("emit", () => {
  it("turns play tags into links labelled by quarter and clock", () => {
    const out = linkPlays("Gibbs scored [p:2265]. Nothing [p:1].", recap);
    expect(out).toBe("Gibbs scored ([Q3 11:06](/games/2026/week-03/#play-2265)). Nothing.");
    const division = buildBundle("division", DATA_DIR, 2026, 3);
    expect(linkPlays("No game here [p:2265].", division)).toBe("No game here.");
  });

  it("renders frontmatter the content collection accepts and that stores the data hash", () => {
    const fm = ArticleFrontmatter.parse({
      title: "Lions hold off the Jets at Ford Field",
      description: 'A recap with "quotes" and a colon: it must survive YAML intact.',
      type: "recap",
      season: 2026,
      week: 3,
      gameId: "2026_03_NYJ_DET",
      publishedAt: "2026-10-12T12:00:00.000Z",
      model: "sonnet",
      effort: "high",
      dataHash: "0123456789abcdef",
      grounding: { numbers: 4, names: 3, plays: 2, passed: true },
    });
    const md = renderArticle(fm, "\nBody text.\n");
    expect(md.startsWith("---\ntitle: ")).toBe(true);
    expect(md).toContain(
      'description: "A recap with \\"quotes\\" and a colon: it must survive YAML intact."',
    );
    expect(md).toContain('gameId: "2026_03_NYJ_DET"');
    expect(md.endsWith("---\nBody text.\n")).toBe(true);
    expect(storedHash(md)).toBe("0123456789abcdef");
    expect(storedHash("no frontmatter")).toBeNull();
    expect(renderArticle({ ...fm, gameId: null }, "x")).toContain("gameId: null");
  });
});

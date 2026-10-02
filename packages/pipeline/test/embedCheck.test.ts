import { describe, expect, it } from "vitest";

import {
  type CheckBrowser,
  checkEmbeddable,
  harnessHtml,
  interpretResults,
} from "../src/highlights/embedCheck.js";

describe("harnessHtml", () => {
  it("creates one muted autoplaying player per id and loads the IFrame API", () => {
    const html = harnessHtml(["abcdefghijk", "lmnopqrstuv"]);
    expect(html).toContain('["abcdefghijk","lmnopqrstuv"]');
    expect(html).toContain("pending: 2");
    expect(html).toContain("https://www.youtube.com/iframe_api");
    expect(html).toContain("youtube-nocookie.com");
    expect(html).toContain("mute: 1");
  });
});

describe("interpretResults", () => {
  it("maps settled values and treats anything else as unknown", () => {
    const out = interpretResults(["a", "b", "c", "d"], {
      a: "embeddable",
      b: "blocked",
      c: "weird",
    });
    expect([...out.entries()]).toEqual([
      ["a", "embeddable"],
      ["b", "blocked"],
      ["c", "unknown"],
      ["d", "unknown"],
    ]);
  });
});

describe("checkEmbeddable", () => {
  it("serves the harness on localhost, drives the browser and reads the results", async () => {
    const visited: string[] = [];
    let closed = false;
    const browser: CheckBrowser = {
      newPage: () =>
        Promise.resolve({
          goto: async (url: string) => {
            visited.push(url);
            const res = await fetch(url);
            expect(res.headers.get("content-type")).toContain("text/html");
            expect(await res.text()).toContain("pending: 2");
          },
          waitForFunction: () => Promise.resolve(),
          evaluate: <T>() =>
            Promise.resolve({ one0000000: "embeddable", two0000000: "blocked" } as T),
        }),
      close: () => {
        closed = true;
        return Promise.resolve();
      },
    };
    const out = await checkEmbeddable(["one0000000", "two0000000", "one0000000"], {
      browser: () => Promise.resolve(browser),
    });
    expect(visited[0]).toMatch(new RegExp("^http://localhost:[0-9]+/$"));
    expect(out.get("one0000000")).toBe("embeddable");
    expect(out.get("two0000000")).toBe("blocked");
    expect(closed).toBe(true);
  });

  it("returns unknown for everything when the page never settles", async () => {
    const browser: CheckBrowser = {
      newPage: () =>
        Promise.resolve({
          goto: () => Promise.resolve(),
          waitForFunction: () => Promise.reject(new Error("timeout")),
          evaluate: <T>() => Promise.resolve({} as T),
        }),
      close: () => Promise.resolve(),
    };
    const out = await checkEmbeddable(["x"], {
      browser: () => Promise.resolve(browser),
      timeoutMs: 1,
    });
    expect(out.get("x")).toBe("unknown");
    expect(await checkEmbeddable([], { browser: () => Promise.resolve(browser) })).toEqual(
      new Map(),
    );
  });
});

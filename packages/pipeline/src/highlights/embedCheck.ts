/**
 * Whether YouTube will play a video inside another site. The Data API's `embeddable` flag and the
 * oEmbed endpoint both say yes for clips the NFL blocks as content owner ("blocked it from display
 * on this website or application"), so the only reliable test is to load the player. This serves a
 * one-page harness on localhost (YouTube rejects IP-address referrers), opens it in headless Chromium through Playwright, and listens to
 * the IFrame Player API: a playing or buffering state means yes; error 101 or 150 means no.
 */
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

export type EmbedResult = "embeddable" | "blocked" | "unknown";

/** Minimal slice of Playwright's Browser/Page we use, so tests can inject a fake. */
interface CheckPage {
  goto(url: string): Promise<unknown>;
  waitForFunction(fn: string, arg?: unknown, options?: { timeout?: number }): Promise<unknown>;
  evaluate<T>(fn: string): Promise<T>;
}
export interface CheckBrowser {
  newPage(): Promise<CheckPage>;
  close(): Promise<void>;
}
export type BrowserFactory = () => Promise<CheckBrowser>;

/** Harness page: one muted player per id, results collected on `window.__embed`. */
export function harnessHtml(ids: readonly string[]): string {
  const list = JSON.stringify(ids);
  return `<!doctype html><meta charset="utf-8"><title>embed check</title>
<script>
window.__embed = { results: {}, pending: ${ids.length} };
function settle(id, value) {
  if (window.__embed.results[id] !== undefined) return;
  window.__embed.results[id] = value;
  window.__embed.pending -= 1;
}
function onYouTubeIframeAPIReady() {
  for (const id of ${list}) {
    const el = document.createElement("div");
    document.body.appendChild(el);
    new YT.Player(el, {
      videoId: id, width: 320, height: 180,
      playerVars: { autoplay: 1, mute: 1, controls: 0 },
      host: "https://www.youtube-nocookie.com",
      events: {
        onReady: (e) => { try { e.target.mute(); e.target.playVideo(); } catch {} },
        onStateChange: (e) => { if (e.data === 1 || e.data === 3) settle(id, "embeddable"); },
        onError: (e) => { settle(id, e.data === 101 || e.data === 150 ? "blocked" : "unknown"); },
      },
    });
  }
}
</script>
<script src="https://www.youtube.com/iframe_api"></script>`;
}

/** Normalises whatever the harness collected into a result per requested id. */
export function interpretResults(
  ids: readonly string[],
  results: Record<string, string | undefined>,
): Map<string, EmbedResult> {
  const out = new Map<string, EmbedResult>();
  for (const id of ids) {
    const r = results[id];
    out.set(id, r === "embeddable" || r === "blocked" ? r : "unknown");
  }
  return out;
}

const DEFAULT_TIMEOUT_MS = 20_000;

async function launchChromium(): Promise<CheckBrowser> {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  return {
    newPage: async () => {
      const page = await browser.newPage();
      return {
        goto: (url) => page.goto(url),
        waitForFunction: (fn, arg, options) => page.waitForFunction(fn, arg, options),
        evaluate: (fn) => page.evaluate(fn),
      };
    },
    close: () => browser.close(),
  };
}

/** Loads every id in one headless page and reports which ones YouTube lets other sites play. */
export async function checkEmbeddable(
  ids: readonly string[],
  options: { browser?: BrowserFactory; timeoutMs?: number } = {},
): Promise<Map<string, EmbedResult>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const html = harnessHtml(unique);
  const server = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(html);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  const browser = await (options.browser ?? launchChromium)();
  try {
    const page = await browser.newPage();
    // The hostname matters: YouTube refuses embeds whose referrer is a bare IP address.
    await page.goto(`http://localhost:${port}/`);
    try {
      await page.waitForFunction("window.__embed && window.__embed.pending === 0", undefined, {
        timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      });
    } catch {
      // Timed out: whatever settled counts, the rest stays unknown.
    }
    const results = await page.evaluate<Record<string, string | undefined>>(
      "window.__embed ? window.__embed.results : {}",
    );
    return interpretResults(unique, results);
  } finally {
    await browser.close();
    server.close();
  }
}

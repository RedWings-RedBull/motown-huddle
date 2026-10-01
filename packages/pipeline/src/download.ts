import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { Logger } from "./log.js";
import { silentLogger } from "./log.js";
import { assetFileName, assetSpec, assetUrl, timestampUrl, type AssetKey } from "./sources.js";

/** Default cache: packages/pipeline/.cache/nflverse (gitignored; may hold league-wide raw rows). */
const DEFAULT_CACHE_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", ".cache", "nflverse");

export type FetchLike = (url: string) => Promise<Response>;

export interface DownloadOptions {
  cacheDir?: string;
  /** Re-download even when the stamp matches. */
  refresh?: boolean;
  fetchImpl?: FetchLike;
  log?: Logger;
}

export interface CachedAsset {
  key: AssetKey;
  tag: string;
  file: string;
  path: string;
  /**
   * The tag's timestamp.txt as of the last time this file's bytes changed (meta.json `sources`).
   * nflverse re-stamps some tags (schedules) every few minutes without changing the file; using
   * the content stamp keeps meta.json byte-identical across such re-downloads.
   */
  stamp: string;
  fromCache: boolean;
}

/**
 * Returns the local path of an nflverse asset, downloading it when the tag's timestamp.txt has
 * changed since the cached copy (or when `refresh` is set). `.csv.gz` files are kept compressed;
 * the CSV reader gunzips on the fly. Files are written to a temp name and renamed so an aborted
 * download never leaves a half file behind a valid stamp. Two stamps sit beside each file:
 * `.stamp` (the remote stamp last seen, for cache hits) and `.content-stamp` (the remote stamp
 * when the bytes last changed, reported as `stamp`).
 */
export async function fetchAsset(
  key: AssetKey,
  season: number,
  options: DownloadOptions = {},
): Promise<CachedAsset> {
  const spec = assetSpec(key);
  const file = assetFileName(key, season);
  const cacheDir = options.cacheDir ?? DEFAULT_CACHE_DIR;
  const fetchImpl = options.fetchImpl ?? defaultFetch;
  const log = options.log ?? silentLogger;
  const dir = join(cacheDir, spec.tag);
  await mkdir(dir, { recursive: true });
  const path = join(dir, file);
  const stampPath = `${path}.stamp`;
  const contentStampPath = `${path}.content-stamp`;

  const remoteStamp = (await fetchText(fetchImpl, timestampUrl(spec.tag))).trim();
  const localStamp = await readOptional(stampPath);
  const present = await exists(path);
  if (!options.refresh && present && localStamp === remoteStamp) {
    const stamp = (await readOptional(contentStampPath)) ?? remoteStamp;
    log.info(`cache hit ${spec.tag}/${file} (${remoteStamp})`);
    return { key, tag: spec.tag, file, path, stamp, fromCache: true };
  }

  log.info(`downloading ${spec.tag}/${file} (${remoteStamp})`);
  const response = await fetchImpl(assetUrl(spec.tag, file));
  if (!response.ok) {
    throw new Error(`download failed ${assetUrl(spec.tag, file)}: HTTP ${response.status}`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  const unchanged =
    present && localStamp !== null && Buffer.from(await readFile(path)).equals(bytes);
  const stamp = unchanged ? ((await readOptional(contentStampPath)) ?? localStamp) : remoteStamp;
  const tmp = `${path}.part`;
  await writeFile(tmp, bytes);
  await rename(tmp, path);
  await writeFile(stampPath, remoteStamp);
  await writeFile(contentStampPath, stamp);
  return { key, tag: spec.tag, file, path, stamp, fromCache: false };
}

async function fetchText(fetchImpl: FetchLike, url: string): Promise<string> {
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`fetch failed ${url}: HTTP ${response.status}`);
  return response.text();
}

async function readOptional(path: string): Promise<string | null> {
  try {
    return (await readFile(path, "utf8")).trim();
  } catch {
    return null;
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/* c8 ignore start -- real network; tests inject fetchImpl */
const defaultFetch: FetchLike = (url) => fetch(url, { redirect: "follow" });
/* c8 ignore stop */

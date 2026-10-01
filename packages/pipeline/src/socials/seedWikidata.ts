/**
 * Seeds apps/web/src/data/players_socials.json from Wikidata (CC0): X (P2002) and Instagram
 * (P2003) usernames, joined on Pro-Football-Reference id (P3561) or ESPN id (P3686). Seeded
 * links are `verified: false` and never rendered until a human checks them and flips the flag.
 * Manual entries are never overwritten.
 *
 *   pnpm --filter @huddle/pipeline seed:socials
 */
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { RosterFile, SocialsFile, type PlayerSocials } from "@huddle/shared";

const ENDPOINT = "https://query.wikidata.org/sparql";
const USER_AGENT = "motown-huddle/1.0 (https://github.com/RedWings-RedBull/motown-huddle)";
const dataDir = resolve(process.argv[2] ?? "apps/web/src/data");

interface Binding {
  pfr?: { value: string };
  espn?: { value: string };
  x?: { value: string };
  ig?: { value: string };
}

async function query(sparql: string): Promise<Binding[]> {
  const res = await fetch(`${ENDPOINT}?format=json&query=${encodeURIComponent(sparql)}`, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/sparql-results+json" },
  });
  if (!res.ok) throw new Error(`Wikidata ${res.status}`);
  const json = (await res.json()) as { results: { bindings: Binding[] } };
  return json.results.bindings;
}

const values = (ids: string[]) => ids.map((id) => `"${id.replace(/"/g, "")}"`).join(" ");

async function main(): Promise<void> {
  const roster = RosterFile.parse(
    JSON.parse(await readFile(resolve(dataDir, "roster/current.json"), "utf8")),
  );
  const socialsPath = resolve(dataDir, "players_socials.json");
  const existing = SocialsFile.parse(
    JSON.parse(await readFile(socialsPath, "utf8").catch(() => "{}")),
  );
  const today = new Date().toISOString().slice(0, 10);

  const byPfr = new Map(
    roster.players.filter((p) => p.ids.pfr).map((p) => [p.ids.pfr, p] as const),
  );
  const byEspn = new Map(
    roster.players.filter((p) => p.ids.espn).map((p) => [p.ids.espn, p] as const),
  );
  const found = new Map<string, Binding>();

  for (const [prop, ids, key] of [
    ["P3561", [...byPfr.keys()], "pfr"],
    ["P3686", [...byEspn.keys()], "espn"],
  ] as const) {
    for (let i = 0; i < ids.length; i += 50) {
      const chunk = ids.slice(i, i + 50).filter((v): v is string => v !== null);
      const rows = await query(
        `SELECT ?${key} ?x ?ig WHERE { VALUES ?${key} { ${values(chunk)} } ?p wdt:${prop} ?${key} . OPTIONAL { ?p wdt:P2002 ?x } OPTIONAL { ?p wdt:P2003 ?ig } }`,
      );
      for (const b of rows) {
        const player =
          key === "pfr" ? byPfr.get(b.pfr?.value ?? "") : byEspn.get(b.espn?.value ?? "");
        if (player && !found.has(player.gsisId)) found.set(player.gsisId, b);
      }
    }
  }

  let added = 0;
  for (const [gsisId, b] of found) {
    const player = roster.players.find((p) => p.gsisId === gsisId);
    if (!player) continue;
    const entry: PlayerSocials = existing[gsisId] ?? { fullName: player.fullName, socials: {} };
    const seed = (platform: "x" | "instagram", handle: string | undefined, base: string) => {
      if (!handle || entry.socials[platform] !== undefined) return;
      entry.socials[platform] = {
        handle,
        url: `${base}${handle}`,
        verified: false,
        source: "wikidata",
        checked: today,
      };
      added += 1;
    };
    seed("x", b.x?.value, "https://x.com/");
    seed("instagram", b.ig?.value, "https://www.instagram.com/");
    existing[gsisId] = entry;
  }

  const sorted = Object.fromEntries(
    Object.entries(existing).sort(([a], [b]) => a.localeCompare(b)),
  );
  await writeFile(socialsPath, `${JSON.stringify(sorted, null, 2)}\n`);
  console.log(
    `socials: ${found.size} players matched on Wikidata, ${added} links seeded (unverified) -> ${socialsPath}`,
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

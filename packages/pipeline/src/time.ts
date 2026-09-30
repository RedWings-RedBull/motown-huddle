import { TZDate } from "@date-fns/tz";

import { ValidationError } from "./errors.js";

/** nflverse `gameday`/`gametime` are wall-clock America/New_York regardless of venue. */
const SCHEDULE_TZ = "America/New_York";

/**
 * Converts a schedule row's `gameday` (YYYY-MM-DD) and `gametime` (HH:MM, Eastern) to a UTC ISO
 * instant without milliseconds, e.g. "2026-09-27T17:00:00Z". Uses the numeric TZDate constructor
 * so the result never depends on the host time zone or on string parsing.
 */
export function kickoffUtc(gameday: string, gametime: string): string {
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(gameday);
  if (!day) throw new ValidationError(`bad gameday "${gameday}"`);
  const time = /^(\d{1,2}):(\d{2})$/.exec(gametime);
  if (!time) throw new ValidationError(`bad or empty gametime "${gametime}" for ${gameday}`);
  const [, y, mo, d] = day;
  const [, hh, mm] = time;
  const local = new TZDate(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(hh),
    Number(mm),
    0,
    SCHEDULE_TZ,
  );
  return toUtcIso(local.getTime());
}

export function toUtcIso(epochMs: number): string {
  return new Date(epochMs).toISOString().replace(".000Z", "Z");
}

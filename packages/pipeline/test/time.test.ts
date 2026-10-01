import { afterAll, describe, expect, it } from "vitest";

import { ValidationError } from "../src/errors.js";
import { kickoffUtc, toUtcIso } from "../src/time.js";

const PAIRS: [string, string, string][] = [
  ["2026-10-04", "20:20", "2026-10-05T00:20:00Z"],
  ["2026-11-15", "09:30", "2026-11-15T14:30:00Z"],
  ["2026-10-11", "09:30", "2026-10-11T13:30:00Z"],
  ["2026-09-27", "13:00", "2026-09-27T17:00:00Z"],
];

const originalTz = process.env.TZ;
afterAll(() => {
  process.env.TZ = originalTz;
});

describe.each(["UTC", "America/Detroit", "Asia/Tokyo"])("kickoffUtc under TZ=%s", (tz) => {
  it.each(PAIRS)("%s %s -> %s", (gameday, gametime, expected) => {
    process.env.TZ = tz;
    expect(kickoffUtc(gameday, gametime)).toBe(expected);
  });
});

describe("kickoffUtc validation", () => {
  it("throws on an empty or malformed gametime", () => {
    expect(() => kickoffUtc("2026-10-04", "")).toThrow(ValidationError);
    expect(() => kickoffUtc("2026-10-04", "8pm")).toThrow(/gametime/);
  });

  it("throws on a malformed gameday", () => {
    expect(() => kickoffUtc("10/04/2026", "20:20")).toThrow(/gameday/);
  });

  it("formats instants without milliseconds", () => {
    expect(toUtcIso(Date.UTC(2026, 8, 27, 17))).toBe("2026-09-27T17:00:00Z");
  });
});

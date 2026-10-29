import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { loadDotEnv, parseDotEnv, readDomain, requireAccountId } from "../lib/env.js";

describe("parseDotEnv", () => {
  it("parses KEY=VALUE lines and strips quotes, comments and blanks", () => {
    const parsed = parseDotEnv(
      ["# comment", "", "A=1", 'B="two"', "C='three'", "D=", "not a pair", " E = spaced "].join(
        "\n",
      ),
    );
    expect(parsed).toEqual({ A: "1", B: "two", C: "three", E: "spaced" });
  });
});

describe("loadDotEnv", () => {
  it("fills only missing keys from an existing file and ignores a missing file", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "huddle-env-"));
    const file = path.join(dir, ".env");
    writeFileSync(file, "HUDDLE_AWS_ACCOUNT_ID=123456789012\nHUDDLE_GITHUB_REPO=a/b\n");
    const env: NodeJS.ProcessEnv = { HUDDLE_GITHUB_REPO: "keep/me" };
    loadDotEnv(file, env);
    expect(env).toEqual({ HUDDLE_AWS_ACCOUNT_ID: "123456789012", HUDDLE_GITHUB_REPO: "keep/me" });

    const untouched: NodeJS.ProcessEnv = {};
    loadDotEnv(path.join(dir, "missing.env"), untouched);
    expect(untouched).toEqual({});
  });
});

describe("requireAccountId", () => {
  it("returns a 12-digit account id", () => {
    expect(requireAccountId({ HUDDLE_AWS_ACCOUNT_ID: "123456789012" })).toBe("123456789012");
  });

  it("refuses missing or malformed ids", () => {
    expect(() => requireAccountId({})).toThrow(/12-digit/);
    expect(() => requireAccountId({ HUDDLE_AWS_ACCOUNT_ID: "12345" })).toThrow(/12-digit/);
    expect(() => requireAccountId({ HUDDLE_AWS_ACCOUNT_ID: "abcdefghijkl" })).toThrow(/12-digit/);
  });
});

describe("readDomain", () => {
  it("is optional, but both values come together", () => {
    expect(readDomain({})).toBeUndefined();
    expect(() => readDomain({ HUDDLE_DOMAIN_NAME: "example.com" })).toThrow(/together/);
    expect(() => readDomain({ HUDDLE_HOSTED_ZONE_ID: "Z0123456789ABC" })).toThrow(/together/);
  });

  it("normalises the console's spellings and rejects non-apex names", () => {
    expect(
      readDomain({
        HUDDLE_DOMAIN_NAME: "Example.com.",
        HUDDLE_HOSTED_ZONE_ID: "/hostedzone/Z0123456789ABC",
      }),
    ).toEqual({ name: "example.com", hostedZoneId: "Z0123456789ABC" });
    expect(() =>
      readDomain({
        HUDDLE_DOMAIN_NAME: "www.example.com",
        HUDDLE_HOSTED_ZONE_ID: "Z0123456789ABC",
      }),
    ).toThrow(/apex/);
    expect(() =>
      readDomain({ HUDDLE_DOMAIN_NAME: "example.com", HUDDLE_HOSTED_ZONE_ID: "abc" }),
    ).toThrow(/Z0123456789ABC/);
  });
});

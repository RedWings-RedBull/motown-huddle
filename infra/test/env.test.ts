import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { loadDotEnv, parseDotEnv, requireAccountId } from "../lib/env.js";

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

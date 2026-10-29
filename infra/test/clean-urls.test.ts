import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

import { describe, expect, it } from "vitest";

interface Request {
  uri: string;
  headers: { host?: { value: string } };
}
interface Redirect {
  statusCode: number;
  headers: { location: { value: string } };
}

// The file is a bare script, as CloudFront expects; evaluate it and take its `handler`.
const source = readFileSync(new URL("../functions/clean-urls.js", import.meta.url), "utf8");
const handler = runInNewContext(`${source}\nhandler;`) as (event: {
  request: Request;
}) => Request | Redirect;

const run = (uri: string, host = "example.com") =>
  handler({ request: { uri, headers: { host: { value: host } } } });

describe("clean-urls CloudFront function", () => {
  it("serves directory routes from their index.html", () => {
    expect(run("/")).toMatchObject({ uri: "/index.html" });
    expect(run("/games/2026/week-03/")).toMatchObject({ uri: "/games/2026/week-03/index.html" });
  });

  it("adds the trailing slash to extension-less paths and leaves files alone", () => {
    expect(run("/games")).toMatchObject({
      statusCode: 301,
      headers: { location: { value: "/games/" } },
    });
    expect(run("/_astro/app.js")).toMatchObject({ uri: "/_astro/app.js" });
  });

  it("sends www to the apex host, keeping the path", () => {
    expect(run("/roster/", "www.example.com")).toMatchObject({
      statusCode: 301,
      headers: { location: { value: "https://example.com/roster/" } },
    });
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";

import { consoleLogger, memoryLogger, silentLogger } from "../src/log.js";

describe("loggers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("consoleLogger writes prefixed lines to stderr", () => {
    const write = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    consoleLogger.info("hello");
    consoleLogger.warn("careful");
    expect(write).toHaveBeenCalledWith("[pipeline] hello\n");
    expect(write).toHaveBeenCalledWith("[pipeline] warning: careful\n");
  });

  it("memoryLogger collects and silentLogger drops", () => {
    const log = memoryLogger();
    log.info("a");
    log.warn("b");
    expect(log.lines).toEqual(["a", "warning: b"]);
    silentLogger.info("x");
    silentLogger.warn("x");
    expect(log.lines).toHaveLength(2);
  });
});

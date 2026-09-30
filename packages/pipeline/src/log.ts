/** Minimal stderr logger so stdout stays free for machine output (fixture dumps). */
export interface Logger {
  info(message: string): void;
  warn(message: string): void;
}

export const consoleLogger: Logger = {
  info: (message) => {
    process.stderr.write(`[pipeline] ${message}\n`);
  },
  warn: (message) => {
    process.stderr.write(`[pipeline] warning: ${message}\n`);
  },
};

export const silentLogger: Logger = { info: () => undefined, warn: () => undefined };

/** Collects messages; used by tests to assert what was skipped. */
export function memoryLogger(): Logger & { lines: string[] } {
  const lines: string[] = [];
  return {
    lines,
    info: (message) => {
      lines.push(message);
    },
    warn: (message) => {
      lines.push(`warning: ${message}`);
    },
  };
}

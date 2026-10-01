import { createReadStream } from "node:fs";
import { createGunzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { Readable, Writable, type Transform } from "node:stream";
import { parse } from "csv-parse";
import type { ZodType } from "zod";

import { ValidationError } from "./errors.js";

type RawRow = Record<string, string>;

export interface ReadCsvOptions<T> {
  /** Called with the raw string row before schema parsing; return false to drop it in-stream. */
  keep?: (row: RawRow) => boolean;
  /** Stop after this many kept rows (used by fixture cutting and probes). */
  limit?: number;
  /** Row schema listing only the columns the pipeline uses. */
  schema: ZodType<T>;
  /** Column names that must exist in the header; defaults to the schema's keys via `columnsOf`. */
  requiredColumns?: readonly string[];
  /** Label for error messages. */
  label?: string;
}

/**
 * Streams a CSV (gzip-transparent by `.gz` suffix) and yields schema-parsed rows. Rows rejected
 * by `keep` never reach the schema, so a 370-column play-by-play file for a full season is
 * reduced to the requested week without materialising. A missing required column throws a
 * ValidationError from the first row so column drift fails loudly and early.
 */
export async function readCsv<T>(path: string, options: ReadCsvOptions<T>): Promise<T[]> {
  const source = createReadStream(path);
  const stages: (Readable | Transform)[] = [source];
  if (path.endsWith(".gz")) stages.push(createGunzip());
  return collect(stages, options, path);
}

/** Same as readCsv for an in-memory CSV string (tests and fixture cutting). */
export async function parseCsvText<T>(text: string, options: ReadCsvOptions<T>): Promise<T[]> {
  return collect([Readable.from([text])], options, options.label ?? "<text>");
}

async function collect<T>(
  stages: (Readable | Transform)[],
  options: ReadCsvOptions<T>,
  label: string,
): Promise<T[]> {
  const out: T[] = [];
  const keep = options.keep ?? (() => true);
  const required = options.requiredColumns ?? columnsOf(options.schema);
  const limit = options.limit ?? Number.POSITIVE_INFINITY;
  let checked = false;
  let rowNumber = 0;
  const parser = parse({ columns: true, bom: true, relaxColumnCount: true, skipEmptyLines: true });
  const sink = new Writable({
    objectMode: true,
    write(row: RawRow, _enc, done) {
      rowNumber += 1;
      if (!checked) {
        checked = true;
        const missing = required.filter((c) => !(c in row));
        if (missing.length > 0) {
          done(new ValidationError(`${label}: missing columns ${missing.join(", ")}`));
          return;
        }
      }
      if (out.length >= limit) {
        done();
        source(stages).destroy();
        return;
      }
      if (!keep(row)) {
        done();
        return;
      }
      const parsed = options.schema.safeParse(row);
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        const where = issue ? `${issue.path.join(".")}: ${issue.message}` : "unknown issue";
        done(new ValidationError(`${label} row ${rowNumber}: ${where}`));
        return;
      }
      out.push(parsed.data);
      done();
    },
  });
  try {
    await pipeline([...stages, parser, sink]);
  } catch (error) {
    if (out.length >= limit && isPrematureClose(error)) return out;
    throw error;
  }
  return out;
}

function source(stages: (Readable | Transform)[]): Readable | Transform {
  const first = stages[0];
  if (!first) throw new Error("no source stream");
  return first;
}

function isPrematureClose(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ERR_STREAM_PREMATURE_CLOSE";
}

/** Keys of a zod object schema (the column names the pipeline reads). */
export function columnsOf(schema: ZodType): string[] {
  const shape = (schema as { shape?: Record<string, unknown> }).shape;
  return shape ? Object.keys(shape) : [];
}

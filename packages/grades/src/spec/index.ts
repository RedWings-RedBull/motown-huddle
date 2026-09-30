import { metricDef, Pool } from "@huddle/shared";

import { CB } from "./cb.js";
import { EDGE } from "./edge.js";
import { IDL } from "./idl.js";
import { K } from "./k.js";
import { LB } from "./lb.js";
import { OL } from "./ol.js";
import { P } from "./p.js";
import { QB } from "./qb.js";
import { RB } from "./rb.js";
import { RET } from "./ret.js";
import { S } from "./s.js";
import { TE } from "./te.js";
import type { PoolSpec } from "./types.js";
import { WR } from "./wr.js";

export type { ComponentSpec, PoolSpec } from "./types.js";

const WEIGHT_TOLERANCE = 1e-9;

/**
 * Structural invariants every spec must satisfy. Throws with a precise message so a bad edit
 * fails at module load (and in the spec tests) rather than producing silently wrong grades.
 */
export function assertSpecs(specs: readonly PoolSpec[]): void {
  const seen = new Set<Pool>();
  for (const spec of specs) {
    if (seen.has(spec.pool)) throw new Error(`duplicate spec for pool ${spec.pool}`);
    seen.add(spec.pool);
    if (spec.components.length === 0) throw new Error(`${spec.pool}: no components`);
    const sum = spec.components.reduce((acc, c) => acc + c.weight, 0);
    if (Math.abs(sum - 1) > WEIGHT_TOLERANCE) {
      throw new Error(`${spec.pool}: weights sum to ${sum}, expected 1`);
    }
    const keys = new Set<string>();
    for (const c of spec.components) {
      if (c.weight <= 0) throw new Error(`${spec.pool}: ${c.key} has non-positive weight`);
      if (keys.has(c.key)) throw new Error(`${spec.pool}: duplicate component ${c.key}`);
      keys.add(c.key);
      const def = metricDef(c.key);
      if (!def) throw new Error(`${spec.pool}: unknown metric ${c.key}`);
      if (def.pool !== spec.pool) {
        throw new Error(`${spec.pool}: metric ${c.key} belongs to pool ${def.pool}`);
      }
    }
  }
  for (const pool of Pool.options) {
    if (!seen.has(pool)) throw new Error(`missing spec for pool ${pool}`);
  }
}

/** Every pool's Huddle Grade formula, in field order. Rendered verbatim on /methodology/. */
export const SPECS: readonly PoolSpec[] = [QB, RB, WR, TE, OL, EDGE, IDL, LB, CB, S, K, P, RET];

assertSpecs(SPECS);

const byPool = new Map(SPECS.map((s) => [s.pool, s] as const));

/** Whether a row qualifies for a grade: the primary sample, or the spec's alternative snap rule. */
export function qualifies(spec: PoolSpec, n: number, snaps: number): boolean {
  const { threshold } = spec;
  return n >= threshold.n || (threshold.altSnaps !== undefined && snaps >= threshold.altSnaps);
}

export function specFor(pool: Pool): PoolSpec {
  const spec = byPool.get(pool);
  // assertSpecs guarantees every pool has a spec, so this only guards against a runtime caller
  // passing a value outside the Pool enum.
  if (!spec) throw new Error(`no spec for pool ${pool}`);
  return spec;
}

import { z } from "zod";

import { Pool, Slot, Tier, Unit } from "./common.js";

/**
 * The contract between @huddle/pipeline (extraction) and @huddle/grades (math).
 *
 * The pipeline computes raw metric values for every qualifying player in the league that week
 * (needed for percentiles) plus every team's OL unit values, and hands them to the engine with
 * the configured team's slot assignments. The engine owns thresholds, weights, shrinkage and
 * binning, and returns the `Grades` artifact plus league baselines.
 */

/** Raw metric values keyed by MetricDef.key; null when the input for that metric is missing. */
export const MetricValues = z.record(z.string(), z.number().finite().nullable());
export type MetricValues = z.infer<typeof MetricValues>;

/** Per-metric sample sizes (attempts, targets, snaps ...) keyed by MetricDef.key. */
export const MetricSamples = z.record(z.string(), z.number().int().min(0));
export type MetricSamples = z.infer<typeof MetricSamples>;

export const PlayerRow = z
  .object({
    gsisId: z.string(),
    name: z.string(),
    jersey: z.number().int().nullable(),
    position: z.string(),
    pool: Pool,
    team: z.string(),
    /** Snaps on the unit the pool belongs to (offense, defense or special teams). */
    snaps: z.number().int().min(0),
    snapPct: z.number().finite().min(0).max(1),
    /** Primary sample size used for qualification and shrinkage. */
    n: z.number().int().min(0),
    values: MetricValues,
    samples: MetricSamples,
    penalties: z
      .array(z.object({ type: z.string(), yards: z.number().finite() }).strict())
      .default([]),
  })
  .strict();
export type PlayerRow = z.infer<typeof PlayerRow>;

export const UnitRow = z
  .object({
    team: z.string(),
    n: z.number().int().min(0),
    values: MetricValues,
    samples: MetricSamples,
  })
  .strict();
export type UnitRow = z.infer<typeof UnitRow>;

/** A player placed on a field slot for the configured team's game. */
export const SlotAssignment = z
  .object({
    slot: Slot,
    unit: Unit,
    gsisId: z.string(),
    snaps: z.number().int().min(0),
    snapPct: z.number().finite().min(0).max(1),
  })
  .strict();
export type SlotAssignment = z.infer<typeof SlotAssignment>;

export const GapHeatInput = z
  .object({
    zone: z.enum(["LT", "LG", "C", "RG", "RT"]),
    epaPerRush: z.number().finite(),
    successRate: z.number().finite().min(0).max(1),
    n: z.number().int().min(0),
  })
  .strict();

export const GradeRequest = z
  .object({
    season: z.number().int(),
    week: z.number().int(),
    gameId: z.string(),
    team: z.string(),
    tier: Tier,
    /** Every qualifying player league-wide (all 32 teams) for that week. */
    players: z.array(PlayerRow),
    /** OL unit values for all 32 teams. */
    units: z.array(UnitRow),
    assignments: z.array(SlotAssignment),
    gapHeat: z.array(GapHeatInput),
  })
  .strict();
export type GradeRequest = z.infer<typeof GradeRequest>;

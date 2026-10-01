import type { Component, Grades, PlayerGrade, SlotGrade } from "@huddle/shared";

import {
  formatComponentValue,
  formatGrade,
  formatPct,
  formatSigned,
  ordinal,
  SOURCE_LABEL,
  SOURCE_TITLE,
  tierForSource,
} from "../../lib/format";
import { BIN_FILL, BIN_LABEL, BIN_TEXT } from "./bins";

const OL_NOTE = "Unit grade: free data has no per-lineman blocking grades.";

function GradeChip({ value, bin }: { value: number | null; bin: SlotGrade["bin"] }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-sm font-bold"
      style={{ backgroundColor: BIN_FILL[bin], color: BIN_TEXT[bin] }}
    >
      <span>{formatGrade(value)}</span>
      <span className="font-medium">{BIN_LABEL[bin]}</span>
    </span>
  );
}

function ComponentBars({ components }: { components: readonly Component[] }) {
  if (components.length === 0) return null;
  return (
    <ul className="mt-2 space-y-2">
      {components.map((c) => {
        const tier = tierForSource(c.source);
        const pct = c.percentile === null ? 0 : Math.round(c.percentile);
        return (
          <li key={c.key} className="text-sm">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-medium">{c.label}</span>
              <span className="tabular-nums">{formatComponentValue(c.unit, c.value)}</span>
            </div>
            <div
              className="mt-1 h-2 w-full overflow-hidden rounded bg-silver/40"
              aria-hidden="true"
            >
              <div className="h-full rounded bg-honolulu" style={{ width: `${pct}%` }} />
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink/80 dark:text-silver/80">
              <span>
                {c.percentile === null ? "no percentile" : `${ordinal(pct)} percentile`} of{" "}
                {c.poolN}
              </span>
              <span>· weight {Math.round(c.weight * 100)}%</span>
              <span>· n {c.n}</span>
              <span>· {c.direction === "lower" ? "lower is better" : "higher is better"}</span>
              <span className="badge" title={SOURCE_TITLE[c.source]}>
                {SOURCE_LABEL[c.source]}
              </span>
              <span className={tier === "final" ? "badge badge-final" : "badge badge-provisional"}>
                {tier === "final" ? "Final" : "Provisional"}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function PlayerHeader({ player }: { player: PlayerGrade }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h4 className="text-base font-bold">
        {player.name}
        <span className="ml-2 text-sm font-medium text-ink/70 dark:text-silver/70">
          {player.jersey === null ? "" : `#${player.jersey} · `}
          {player.position}
        </span>
      </h4>
      <span className="text-sm tabular-nums">
        {player.snaps} snaps · {formatPct(player.snapPct, 0)}
      </span>
    </div>
  );
}

function Penalties({ player }: { player: PlayerGrade }) {
  return (
    <p className="mt-1 text-sm">
      Penalties:{" "}
      {player.penalties.length === 0
        ? "none"
        : player.penalties.map((p) => `${p.type} (${p.yards} yds)`).join(", ")}
    </p>
  );
}

function PlayerBody({ player }: { player: PlayerGrade }) {
  const g = player.grade;
  return (
    <section className="mt-3 border-t border-silver/40 pt-3 first:mt-0 first:border-t-0 first:pt-0">
      <PlayerHeader player={player} />
      <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
        <GradeChip value={g.value} bin={g.bin} />
        {g.value === null ? (
          <span>{g.reason ?? "not graded"}</span>
        ) : (
          <span className="text-ink/80 dark:text-silver/80">
            raw {g.rawComposite === null ? "–" : Math.round(g.rawComposite)} · n {g.n} · k {g.k}
          </span>
        )}
      </div>
      <ComponentBars components={player.components} />
      {player.penalties.length > 0 && <Penalties player={player} />}
    </section>
  );
}

function UnitBody({ slot, olUnit }: { slot: SlotGrade; olUnit: Grades["olUnit"] }) {
  const zone = olUnit.gapHeat.find((z) => z.zone === slot.slot);
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <GradeChip value={olUnit.grade.value} bin={olUnit.grade.bin} />
        <span>Offensive line unit</span>
      </div>
      <p className="mt-2 text-sm italic">{OL_NOTE}</p>
      {slot.players.map((player) => (
        <section key={player.gsisId} className="mt-3 border-t border-silver/40 pt-3">
          <PlayerHeader player={player} />
          <Penalties player={player} />
        </section>
      ))}
      {zone && (
        <p className="mt-3 text-sm">
          Runs behind {slot.label.toLowerCase()}: {zone.n} carries,{" "}
          {formatSigned(zone.epaPerRush, 2)} EPA per rush, {formatPct(zone.successRate, 0)} success.
        </p>
      )}
      <h4 className="mt-3 text-sm font-bold">Unit components</h4>
      <ComponentBars components={olUnit.components} />
    </div>
  );
}

export interface SlotDetailProps {
  slot: SlotGrade;
  olUnit: Grades["olUnit"];
  titleId: string;
  onClose: () => void;
}

/** Shared body of the desktop aside and the mobile bottom sheet. */
export function SlotDetail({ slot, olUnit, titleId, onClose }: SlotDetailProps) {
  return (
    <div className="text-ink dark:text-silver">
      <div className="flex items-start justify-between gap-3">
        <h3 id={titleId} className="text-lg font-extrabold">
          {slot.label}
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="rounded border border-silver/60 px-2 py-1 text-sm hover:bg-silver/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-honolulu"
        >
          Close
        </button>
      </div>
      <div className="mt-3">
        {slot.unitOnly ? (
          <UnitBody slot={slot} olUnit={olUnit} />
        ) : slot.players.length === 0 ? (
          <p className="text-sm">Nobody took a snap at this slot.</p>
        ) : (
          slot.players.map((player) => <PlayerBody key={player.gsisId} player={player} />)
        )}
      </div>
    </div>
  );
}

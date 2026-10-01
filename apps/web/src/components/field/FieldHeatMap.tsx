import type { Grades, Slot, SlotGrade, Unit } from "@huddle/shared";
import {
  Fragment,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { formatGrade, formatPct } from "../../lib/format";
import { BIN_FILL, BIN_LABEL, BIN_ORDER, BIN_RANGE, BIN_TEXT, binPattern } from "./bins";
import { SlotDetail } from "./SlotDetail";
import { type FieldLayout, LANDSCAPE, PORTRAIT, UNIT_LABEL } from "./slots";

type Filter = "all" | Unit;
const FILTERS: readonly Filter[] = ["all", "offense", "defense", "st"];

const DESKTOP_QUERY = "(min-width: 768px)";
function subscribeDesktop(onChange: () => void): () => void {
  const mq = window.matchMedia(DESKTOP_QUERY);
  mq.addEventListener("change", onChange);
  return () => {
    mq.removeEventListener("change", onChange);
  };
}
const getDesktop = (): boolean => window.matchMedia(DESKTOP_QUERY).matches;
const getServerDesktop = (): boolean => true;

const INK = "#0b1f33";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0] ?? "")
    .join("")
    .slice(0, 3)
    .toUpperCase();
}

function primaryMark(slot: SlotGrade): string {
  const lead = slot.players[0];
  if (!lead) return "—";
  return lead.jersey === null ? initials(lead.name) : `#${lead.jersey}`;
}

function playerNames(slot: SlotGrade): string {
  return slot.players.length === 0 ? "nobody" : slot.players.map((p) => p.name).join(", ");
}

/** "Left tackle, Penei Sewell, Huddle Grade 92, on fire" */
function describe(slot: SlotGrade): string {
  const grade =
    slot.tileGrade === null
      ? "not graded"
      : `Huddle Grade ${formatGrade(slot.tileGrade)}, ${BIN_LABEL[slot.bin].toLowerCase()}`;
  return `${slot.label}, ${playerNames(slot)}, ${grade}`;
}

/** Cue patterns: dark ink on the light bins, the bin's white text colour on Ice and On fire. */
function CuePatterns() {
  return (
    <defs>
      {(
        [
          ["hm-hatch", INK],
          ["hm-hatch-light", "#ffffff"],
        ] as const
      ).map(([id, stroke]) => (
        <pattern key={id} id={id} patternUnits="userSpaceOnUse" width="8" height="8">
          <path d="M0 8 L8 0" stroke={stroke} strokeWidth="1.2" strokeOpacity="0.45" />
        </pattern>
      ))}
      {(
        [
          ["hm-dots", INK],
          ["hm-dots-light", "#ffffff"],
        ] as const
      ).map(([id, fill]) => (
        <pattern key={id} id={id} patternUnits="userSpaceOnUse" width="8" height="8">
          <circle cx="4" cy="4" r="1.4" fill={fill} fillOpacity="0.4" />
        </pattern>
      ))}
    </defs>
  );
}

/** Turf, end zones, yard lines, hash marks and the line of scrimmage for either orientation. */
function FieldBackground({ layout }: { layout: FieldLayout }) {
  const { field, endZone, los, orientation } = layout;
  const landscape = orientation === "landscape";
  const length = landscape ? field.w : field.h;
  const yardStep = (length - 2 * endZone) / 20;
  const yardLines = Array.from({ length: 21 }, (_, i) => i);
  const hashInset = landscape ? 155 : 60;
  const hashes = landscape
    ? [field.y + hashInset, field.y + field.h - hashInset]
    : [field.x + hashInset, field.x + field.w - hashInset];
  return (
    <g aria-hidden="true">
      <rect
        x={field.x}
        y={field.y}
        width={field.w}
        height={field.h}
        className="fill-honolulu/10 dark:fill-honolulu/20"
      />
      {landscape ? (
        <>
          <rect
            x={field.x}
            y={field.y}
            width={endZone}
            height={field.h}
            className="fill-honolulu/30"
          />
          <rect
            x={field.x + field.w - endZone}
            y={field.y}
            width={endZone}
            height={field.h}
            className="fill-honolulu/30"
          />
        </>
      ) : (
        <>
          <rect
            x={field.x}
            y={field.y}
            width={field.w}
            height={endZone}
            className="fill-honolulu/30"
          />
          <rect
            x={field.x}
            y={field.y + field.h - endZone}
            width={field.w}
            height={endZone}
            className="fill-honolulu/30"
          />
        </>
      )}
      {yardLines.map((i) => {
        const pos = (landscape ? field.x : field.y) + endZone + i * yardStep;
        return (
          <line
            key={i}
            x1={landscape ? pos : field.x}
            x2={landscape ? pos : field.x + field.w}
            y1={landscape ? field.y : pos}
            y2={landscape ? field.y + field.h : pos}
            className="stroke-silver"
            strokeWidth={i % 2 === 0 ? 1.5 : 0.75}
          />
        );
      })}
      {hashes.map((h) => (
        <line
          key={h}
          x1={landscape ? field.x + endZone : h}
          x2={landscape ? field.x + field.w - endZone : h}
          y1={landscape ? h : field.y + endZone}
          y2={landscape ? h : field.y + field.h - endZone}
          className="stroke-silver"
          strokeWidth="6"
          strokeDasharray="1.5 7.1"
        />
      ))}
      <line
        x1={landscape ? los : field.x}
        x2={landscape ? los : field.x + field.w}
        y1={landscape ? field.y : los}
        y2={landscape ? field.y + field.h : los}
        className="stroke-honolulu"
        strokeWidth="3"
        strokeDasharray="8 5"
      />
      <text
        x={landscape ? los : field.x + field.w - 6}
        y={landscape ? field.y - 6 : los - 5}
        textAnchor={landscape ? "middle" : "end"}
        className="fill-current text-[12px]"
      >
        line of scrimmage
      </text>
      <rect
        x="0"
        y={layout.stStripTop}
        width={layout.viewW}
        height={layout.viewH - layout.stStripTop}
        rx="8"
        className="fill-silver/20"
      />
      <text x="16" y={layout.stStripTop + 18} className="fill-current text-[13px] font-semibold">
        Special teams
      </text>
    </g>
  );
}

export interface FieldHeatMapProps {
  grades: Grades;
}

export default function FieldHeatMap({ grades }: FieldHeatMapProps) {
  const uid = useId();
  const titleId = `${uid}-title`;
  const panelTitleId = `${uid}-panel`;
  const bySlot = useMemo(() => new Map(grades.slots.map((s) => [s.slot, s] as const)), [grades]);

  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<Slot | null>(null);
  const [focused, setFocused] = useState<Slot>("QB");
  const [announcement, setAnnouncement] = useState("");
  const isDesktop = useSyncExternalStore(subscribeDesktop, getDesktop, getServerDesktop);
  // Phones get the portrait map: larger tiles and type instead of a shrunken landscape field.
  const layout = isDesktop ? LANDSCAPE : PORTRAIT;

  const tileRefs = useRef(new Map<Slot, SVGGElement>());
  const dialogRef = useRef<HTMLDialogElement>(null);
  const lastSelected = useRef<Slot | null>(null);

  const visible = useMemo(
    () => layout.positions.filter((p) => filter === "all" || p.unit === filter),
    [layout, filter],
  );
  const visibleSlots = useMemo(() => visible.map((p) => p.slot), [visible]);
  const focusSlot = visibleSlots.includes(focused) ? focused : (visibleSlots[0] ?? "QB");
  const selectedGrade = selected === null ? undefined : bySlot.get(selected);

  // Below the desktop breakpoint the detail panel is a native modal bottom sheet.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (selected !== null && !isDesktop) {
      if (!dialog.open) dialog.showModal();
    } else if (dialog.open) {
      dialog.close();
    }
  }, [selected, isDesktop]);

  const focusTile = useCallback((slot: Slot) => {
    setFocused(slot);
    tileRefs.current.get(slot)?.focus();
  }, []);

  const open = useCallback(
    (slot: Slot) => {
      const grade = bySlot.get(slot);
      if (!grade) return;
      lastSelected.current = slot;
      setFocused(slot);
      if (selected === slot) {
        setSelected(null);
        setAnnouncement(`Closed ${grade.label}`);
      } else {
        setSelected(slot);
        setAnnouncement(`Selected ${describe(grade)}`);
      }
    },
    [bySlot, selected],
  );

  const close = useCallback(() => {
    const returnTo = lastSelected.current;
    setSelected(null);
    setAnnouncement("Closed");
    if (returnTo !== null) tileRefs.current.get(returnTo)?.focus();
  }, []);

  // The desktop aside is not a dialog, so Escape must work wherever focus is (the Close button,
  // a component row), not only on the tile that opened it.
  useEffect(() => {
    if (selected === null || !isDesktop) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      close();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [selected, isDesktop, close]);

  const onTileKey = (event: KeyboardEvent<SVGGElement>, slot: Slot) => {
    const index = visibleSlots.indexOf(slot);
    const count = visibleSlots.length;
    let next: Slot | undefined;
    switch (event.key) {
      case "Enter":
      case " ":
        event.preventDefault();
        open(slot);
        return;
      case "Escape":
        if (selected === null) return;
        event.preventDefault();
        close();
        return;
      case "ArrowRight":
      case "ArrowDown":
        next = visibleSlots[(index + 1) % count];
        break;
      case "ArrowLeft":
      case "ArrowUp":
        next = visibleSlots[(index - 1 + count) % count];
        break;
      case "Home":
        next = visibleSlots[0];
        break;
      case "End":
        next = visibleSlots[count - 1];
        break;
      default:
        return;
    }
    event.preventDefault();
    if (next) focusTile(next);
  };

  const changeFilter = (next: Filter) => {
    setFilter(next);
    if (selected !== null && next !== "all") {
      const unit = bySlot.get(selected)?.unit;
      if (unit !== next) setSelected(null);
    }
  };

  const panel = selectedGrade ? (
    <SlotDetail
      slot={selectedGrade}
      olUnit={grades.olUnit}
      titleId={panelTitleId}
      onClose={close}
    />
  ) : null;

  const { tileW, tileH, pad } = layout;

  return (
    <div className="field-heat-map">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Show unit">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={filter === f}
            onClick={() => {
              changeFilter(f);
            }}
            className="rounded-full border border-silver/60 px-3 py-1 text-sm font-medium aria-pressed:bg-honolulu aria-pressed:text-white hover:bg-silver/20 aria-pressed:hover:bg-honolulu focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-honolulu"
          >
            {f === "all" ? "All" : UNIT_LABEL[f]}
          </button>
        ))}
      </div>

      <div className="mt-3 gap-4 md:grid md:grid-cols-[minmax(0,1fr)_20rem] md:items-start">
        <svg
          viewBox={`0 0 ${layout.viewW} ${layout.viewH}`}
          className="h-auto w-full"
          aria-labelledby={titleId}
          data-testid="field"
          data-orientation={layout.orientation}
        >
          <title id={titleId}>Field heat map: Huddle Grade by position slot</title>
          <CuePatterns />
          <FieldBackground layout={layout} />

          {/* Tiles */}
          {visible.map((pos) => {
            const slot = bySlot.get(pos.slot);
            if (!slot) return null;
            const pattern = binPattern(slot.bin);
            const isSelected = selected === pos.slot;
            const x = pos.x - tileW / 2;
            const y = pos.y - tileH / 2;
            return (
              <Fragment key={pos.slot}>
                <g
                  ref={(el) => {
                    if (el) tileRefs.current.set(pos.slot, el);
                    else tileRefs.current.delete(pos.slot);
                  }}
                  role="button"
                  tabIndex={focusSlot === pos.slot ? 0 : -1}
                  aria-label={describe(slot)}
                  aria-pressed={isSelected}
                  data-slot={pos.slot}
                  data-bin={slot.bin}
                  className="field-tile cursor-pointer outline-none"
                  onClick={() => {
                    open(pos.slot);
                  }}
                  onKeyDown={(event) => {
                    onTileKey(event, pos.slot);
                  }}
                  onFocus={() => {
                    setFocused(pos.slot);
                  }}
                >
                  <rect
                    x={x}
                    y={y}
                    width={tileW}
                    height={tileH}
                    rx="8"
                    fill={BIN_FILL[slot.bin]}
                    stroke={isSelected ? "#0076b6" : INK}
                    strokeWidth={isSelected ? 4 : 1}
                    strokeOpacity={isSelected ? 1 : 0.5}
                    className="tile-bg"
                  />
                  {pattern && (
                    <rect
                      x={x}
                      y={y}
                      width={tileW}
                      height={tileH}
                      rx="8"
                      fill={`url(#${pattern})`}
                      pointerEvents="none"
                    />
                  )}
                </g>
                {/* Painted labels live outside the button so its accessible name is the aria-label alone
                  (axe label-content-name-mismatch compares visible text with the name). */}
                <g aria-hidden="true" pointerEvents="none">
                  <text
                    x={x + pad}
                    y={y + pad + layout.labelSize * 0.75}
                    fill={BIN_TEXT[slot.bin]}
                    fontSize={layout.labelSize}
                    fontWeight="600"
                  >
                    {pos.label} · {primaryMark(slot)}
                  </text>
                  <text
                    x={x + tileW - pad}
                    y={y + tileH - pad}
                    fill={BIN_TEXT[slot.bin]}
                    fontSize={layout.gradeSize}
                    fontWeight="800"
                    textAnchor="end"
                  >
                    {formatGrade(slot.tileGrade)}
                  </text>
                </g>
              </Fragment>
            );
          })}
        </svg>

        {isDesktop && panel && (
          <aside
            aria-labelledby={panelTitleId}
            className="mt-4 rounded-lg border border-silver/50 bg-white p-4 shadow-sm md:mt-0 dark:bg-ink"
          >
            {panel}
          </aside>
        )}
      </div>

      <dialog
        ref={dialogRef}
        aria-labelledby={panelTitleId}
        onClose={close}
        className="sheet bg-white p-4 text-ink dark:bg-ink dark:text-silver"
      >
        {!isDesktop && panel}
      </dialog>

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm" aria-label="Legend">
        {BIN_ORDER.map((bin) => {
          const pattern = binPattern(bin);
          return (
            <li key={bin} className="flex items-center gap-2">
              <svg width="18" height="18" aria-hidden="true">
                <rect width="18" height="18" rx="3" fill={BIN_FILL[bin]} />
                {pattern && <rect width="18" height="18" rx="3" fill={`url(#${pattern})`} />}
              </svg>
              <span>
                <span className="font-semibold">{BIN_LABEL[bin]}</span> {BIN_RANGE[bin]}
              </span>
            </li>
          );
        })}
      </ul>

      {/* Tables ignore width:1px, so the sr-only clip must live on a wrapper div. */}
      <div className="sr-only">
        <table data-testid="slot-table">
          <caption>Every slot, its players, snap share, Huddle Grade and bin</caption>
          <thead>
            <tr>
              <th scope="col">Slot</th>
              <th scope="col">Unit</th>
              <th scope="col">Players</th>
              <th scope="col">Huddle Grade</th>
              <th scope="col">Bin</th>
            </tr>
          </thead>
          <tbody>
            {grades.slots.map((slot) => (
              <tr key={slot.slot} data-slot={slot.slot}>
                <th scope="row">{slot.label}</th>
                <td>{UNIT_LABEL[slot.unit]}</td>
                <td>
                  {slot.players
                    .map(
                      (p) =>
                        `${p.name} (${formatPct(p.snapPct, 0)} snaps, grade ${formatGrade(p.grade.value)})`,
                    )
                    .join("; ") || "nobody"}
                </td>
                <td>{formatGrade(slot.tileGrade)}</td>
                <td>{BIN_LABEL[slot.bin]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

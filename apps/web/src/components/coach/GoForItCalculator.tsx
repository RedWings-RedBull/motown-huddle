import { type CalculatorTables, type Decision, evaluate } from "@huddle/shared";
import { useId, useState } from "react";

interface Props {
  tables: CalculatorTables;
  /** Seasons behind the tables, for the caption. */
  seasons: number[];
}

const LABEL: Record<Decision, string> = { go: "Go for it", punt: "Punt", fg: "Field goal" };
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

/** Interactive fourth-down calculator driven by the empirical tables in the coach data file. */
export default function GoForItCalculator({ tables, seasons }: Props) {
  const id = useId();
  const [yardline, setYardline] = useState(45);
  const [togo, setTogo] = useState(2);
  const [qtr, setQtr] = useState(3);
  const [minutes, setMinutes] = useState(8);
  const [diff, setDiff] = useState(0);

  const result = evaluate(
    { yardline100: yardline, ydstogo: togo, qtr, secondsInQuarter: minutes * 60, scoreDiff: diff },
    tables,
  );
  const rows: { key: Decision; wp: number | null; note: string }[] = [
    { key: "go", wp: result.goWp, note: `${pct(result.conversionRate)} conversion rate` },
    { key: "punt", wp: result.puntWp, note: `${result.puntNet.toFixed(0)} yd net punt` },
    {
      key: "fg",
      wp: result.fgWp,
      note:
        result.fgMakeRate === null
          ? `${result.fgDistance} yd attempt is beyond the tables`
          : `${result.fgDistance} yd kick, ${pct(result.fgMakeRate)} make rate`,
    },
  ];
  const best = Math.max(...rows.map((r) => r.wp ?? 0));
  const side =
    yardline > 50
      ? `own ${100 - yardline}`
      : yardline === 50
        ? "midfield"
        : `opponent's ${yardline}`;

  const field = (
    label: string,
    value: number,
    set: (v: number) => void,
    min: number,
    max: number,
    step = 1,
  ) => {
    const inputId = `${id}-${label.replace(/\W+/g, "-")}`;
    return (
      <label htmlFor={inputId} className="flex flex-col gap-1 text-sm">
        <span className="eyebrow">
          {label}: <span className="text-white">{value}</span>
        </span>
        <input
          id={inputId}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => {
            set(Number(e.target.value));
          }}
          className="accent-honolulu-bright"
        />
      </label>
    );
  };

  return (
    <div className="grid gap-6 md:grid-cols-2" data-calculator>
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
        }}
      >
        {field("Yards from end zone", yardline, setYardline, 1, 99)}
        {field("Yards to go", togo, setTogo, 1, 20)}
        {field("Quarter", qtr, setQtr, 1, 4)}
        {field("Minutes left in quarter", minutes, setMinutes, 0, 15)}
        {field("Score margin", diff, setDiff, -21, 21)}
        <p className="muted text-sm">
          Fourth and {togo} at the {side}, Q{qtr}, {minutes}:00 left,{" "}
          {diff === 0 ? "tied" : diff > 0 ? `up ${diff}` : `down ${-diff}`}.
        </p>
      </form>
      <div>
        <ol className="grid gap-2" aria-live="polite" aria-label="Win probability by choice">
          {rows.map((r) => (
            <li
              key={r.key}
              className={`flex items-baseline justify-between rounded-lg px-4 py-3 ring-1 ${
                r.wp !== null && r.wp === best
                  ? "bg-honolulu/20 ring-honolulu-bright"
                  : "bg-white/5 ring-white/10"
              }`}
              data-choice={r.key}
            >
              <span>
                <span className="font-display text-xl text-white">{LABEL[r.key]}</span>
                <span className="muted ml-2 text-xs">{r.note}</span>
              </span>
              <span className="display text-3xl text-white tabular-nums">
                {r.wp === null ? "—" : pct(r.wp)}
              </span>
            </li>
          ))}
        </ol>
        <p className="muted mt-3 text-xs">
          Best option by win probability: {LABEL[result.recommended].toLowerCase()}. Conversion,
          kick and punt rates and the win-probability grid are empirical averages from {seasons[0]}–
          {seasons[seasons.length - 1]} regular-season play-by-play, not the league's model. Clock
          run-off and timeouts are ignored.
        </p>
      </div>
    </div>
  );
}

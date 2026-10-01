import { useSyncExternalStore } from "react";

interface Props {
  kickoffUtc: string;
  /** Server-rendered fallback shown until hydration and after kickoff. */
  label: string;
}

function parts(ms: number): { d: number; h: number; m: number; s: number } {
  const total = Math.max(0, Math.floor(ms / 1000));
  return {
    d: Math.floor(total / 86400),
    h: Math.floor((total % 86400) / 3600),
    m: Math.floor((total % 3600) / 60),
    s: total % 60,
  };
}

/** Re-renders subscribers once a second. */
function subscribe(onTick: () => void): () => void {
  const id = window.setInterval(onTick, 1000);
  return () => {
    window.clearInterval(id);
  };
}
const clientNow = (): number | null => Date.now();
const serverNow = (): number | null => null;

/** Live countdown to kickoff; renders the static kickoff label on the server and after kickoff. */
export default function Countdown({ kickoffUtc, label }: Props) {
  const target = Date.parse(kickoffUtc);
  const now = useSyncExternalStore(subscribe, clientNow, serverNow);

  if (now === null || now >= target) {
    return <p className="display text-3xl text-white sm:text-4xl">{label}</p>;
  }
  const { d, h, m, s } = parts(target - now);
  const cells: [number, string][] = [
    [d, "days"],
    [h, "hrs"],
    [m, "min"],
    [s, "sec"],
  ];
  return (
    <p className="flex flex-wrap gap-3" aria-label={`Kickoff in ${d} days ${h} hours ${m} minutes`}>
      {cells.map(([value, unit]) => (
        <span
          key={unit}
          className="flex flex-col items-center rounded-lg bg-white/5 px-3 py-2 ring-1 ring-white/10"
        >
          <span className="display text-4xl text-white tabular-nums sm:text-5xl">
            {String(value).padStart(2, "0")}
          </span>
          <span className="eyebrow">{unit}</span>
        </span>
      ))}
    </p>
  );
}

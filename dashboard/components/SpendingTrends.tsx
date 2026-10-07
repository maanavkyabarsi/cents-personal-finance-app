"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { currency, dayLabel, monthLabel } from "@/lib/format";
import { cx } from "./primitives";
import { authFetch } from "@/lib/authFetch";

export type TrendView = "week" | "month" | "ytd" | "year" | "all";

const VIEWS: { id: TrendView; label: string }[] = [
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "ytd", label: "YTD" },
  { id: "year", label: "Year" },
  { id: "all", label: "All" },
];

interface RawTrendPoint {
  period: { value: string } | string | null;
  total: number | string | { value: string } | null;
}

interface TrendResponse {
  rows: RawTrendPoint[];
  total_spending: number | string;
  avg_daily_spend: number | string;
}

interface TrendPoint {
  key: string;
  label: string;
  spent: number;
}

function toNum(v: number | string | { value: string } | null | undefined): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return v;
  if (typeof v === "string") return Number(v) || 0;
  return Number(v.value) || 0;
}

function toDateStr(v: { value: string } | string | null): string | null {
  if (!v) return null;
  return typeof v === "string" ? v : v.value;
}

function periodLabel(raw: string, view: TrendView): string {
  return view === "week" || view === "month" ? dayLabel(raw) : monthLabel(raw.slice(0, 7));
}

const H = 180;
const PAD = { top: 14, right: 12, bottom: 24, left: 12 };

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(600);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return { ref, w };
}

export function SpendingTrends({ accountId }: { accountId: string | null }) {
  const [view, setView] = useState<TrendView>("month");
  const [result, setResult] = useState<{ key: string; data: TrendResponse } | null>(null);
  const { ref, w } = useWidth();
  const [hover, setHover] = useState<number | null>(null);

  const requestKey = `${view}__${accountId ?? ""}`;

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ view });
    if (accountId) params.set("account_id", accountId);
    authFetch(`/api/trend?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((json: TrendResponse) => {
        if (!cancelled) setResult({ key: requestKey, data: json });
      })
      .catch(() => {
        if (!cancelled)
          setResult({
            key: requestKey,
            data: { rows: [], total_spending: 0, avg_daily_spend: 0 },
          });
      });
    return () => {
      cancelled = true;
    };
  }, [view, accountId, requestKey]);

  const loading = result?.key !== requestKey;
  const data = result?.key === requestKey ? result.data : null;

  const points: TrendPoint[] = (data?.rows ?? [])
    .map((r) => {
      const raw = toDateStr(r.period);
      if (!raw) return null;
      return { key: raw, label: periodLabel(raw, view), spent: toNum(r.total) };
    })
    .filter((p): p is TrendPoint => p !== null);

  const innerW = Math.max(w - PAD.left - PAD.right, 10);
  const innerH = H - PAD.top - PAD.bottom;
  const max = Math.max(...points.map((p) => p.spent), 1);
  const niceMax = max * 1.15;

  const x = (i: number) =>
    PAD.left + (points.length <= 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (v: number) => PAD.top + innerH - (v / niceMax) * innerH;

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.spent)}`).join(" ");
  const areaPath =
    points.length > 0
      ? `${linePath} L${x(points.length - 1)},${PAD.top + innerH} L${x(0)},${PAD.top + innerH} Z`
      : "";

  const labelEvery = Math.max(Math.ceil(points.length / 6), 1);

  function handleMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    let nearest = 0;
    let best = Infinity;
    points.forEach((_, i) => {
      const d = Math.abs(x(i) - px);
      if (d < best) {
        best = d;
        nearest = i;
      }
    });
    setHover(nearest);
  }

  const active = hover ?? (points.length ? points.length - 1 : -1);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-xs text-subtle">Spending trend</span>
        <div className="flex gap-0.5 rounded-full bg-surface-2 p-0.5">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              onClick={() => setView(v.id)}
              aria-current={view === v.id ? "true" : undefined}
              className={cx(
                "cursor-pointer rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors duration-150",
                view === v.id
                  ? "bg-surface text-text shadow-[var(--shadow-sm)]"
                  : "text-muted hover:text-text"
              )}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {data && (
        <div className="mb-2 flex items-baseline justify-between text-sm">
          <span className="num font-semibold text-text">
            {currency(toNum(data.total_spending))}
          </span>
          <span className="text-xs text-subtle">
            {currency(toNum(data.avg_daily_spend))}/day avg
          </span>
        </div>
      )}

      <div ref={ref} className={cx("w-full", loading && "opacity-60")}>
        {points.length === 0 ? (
          <div
            style={{ height: H }}
            className="flex items-center justify-center text-xs text-subtle"
          >
            {loading ? "Loading…" : "No spending in this period"}
          </div>
        ) : (
          <svg
            width={w}
            height={H}
            role="img"
            aria-label="Spending trend chart"
            className="overflow-visible"
            onMouseMove={handleMove}
            onMouseLeave={() => setHover(null)}
          >
            <defs>
              <linearGradient id="spendingTrendFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.22" />
                <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
              </linearGradient>
            </defs>

            <line
              x1={PAD.left}
              x2={w - PAD.right}
              y1={y(0)}
              y2={y(0)}
              stroke="var(--border)"
              strokeWidth={1}
            />

            {areaPath && <path d={areaPath} fill="url(#spendingTrendFill)" />}
            {linePath && (
              <path
                d={linePath}
                fill="none"
                stroke="var(--primary)"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {points.map((p, i) => {
              const isActive = i === active;
              return (
                <g key={p.key}>
                  {i % labelEvery === 0 && (
                    <text
                      x={x(i)}
                      y={H - 6}
                      textAnchor="middle"
                      fontSize={10}
                      fill="var(--text-subtle)"
                    >
                      {p.label}
                    </text>
                  )}
                  {isActive && (
                    <circle
                      cx={x(i)}
                      cy={y(p.spent)}
                      r={4}
                      fill="var(--surface)"
                      stroke="var(--primary)"
                      strokeWidth={2}
                    />
                  )}
                </g>
              );
            })}
          </svg>
        )}
      </div>

      {active >= 0 && points[active] && (
        <div className="mt-1 flex items-center gap-2 text-sm">
          <span className="h-2 w-2 rounded-full bg-primary" aria-hidden />
          <span className="text-muted">{points[active].label}</span>
          <span className="num font-semibold text-text">{currency(points[active].spent)}</span>
        </div>
      )}
    </div>
  );
}

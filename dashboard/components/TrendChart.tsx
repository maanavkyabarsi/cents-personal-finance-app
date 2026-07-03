"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { currency, currencyCompact } from "@/lib/format";
import type { MonthPoint } from "@/lib/types";

const H = 240;
const PAD = { top: 18, right: 16, bottom: 30, left: 16 };

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(720);
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

export function TrendChart({
  points,
  activeKey,
  onSelectMonth,
}: {
  points: MonthPoint[];
  activeKey: string;
  onSelectMonth?: (key: string) => void;
}) {
  const { ref, w } = useWidth();
  const [hover, setHover] = useState<number | null>(null);

  const innerW = Math.max(w - PAD.left - PAD.right, 10);
  const innerH = H - PAD.top - PAD.bottom;
  const max = Math.max(...points.map((p) => p.spent), 1);
  const niceMax = max * 1.15;

  const x = (i: number) =>
    PAD.left +
    (points.length <= 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (v: number) => PAD.top + innerH - (v / niceMax) * innerH;

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.spent)}`)
    .join(" ");
  const areaPath =
    points.length > 0
      ? `${linePath} L${x(points.length - 1)},${PAD.top + innerH} L${x(0)},${
          PAD.top + innerH
        } Z`
      : "";

  const gridVals = [0, 0.5, 1].map((f) => f * niceMax);
  const labelEvery = Math.ceil(points.length / 6);

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

  const active = hover ?? points.findIndex((p) => p.key === activeKey);
  const summary =
    points.length > 1
      ? `Monthly spending from ${points[0].label} to ${
          points[points.length - 1].label
        }, ranging ${currency(Math.min(...points.map((p) => p.spent)))} to ${currency(
          max
        )}.`
      : "Monthly spending trend.";

  return (
    <div ref={ref} className="w-full">
      <svg
        width={w}
        height={H}
        role="img"
        aria-label={summary}
        className="overflow-visible"
        onMouseMove={handleMove}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {gridVals.map((v, i) => (
          <g key={i}>
            <line
              x1={PAD.left}
              x2={w - PAD.right}
              y1={y(v)}
              y2={y(v)}
              stroke="var(--border)"
              strokeWidth={1}
              strokeDasharray={i === 0 ? "0" : "3 4"}
            />
            <text
              x={PAD.left}
              y={y(v) - 5}
              className="tnum"
              fontSize={10}
              fill="var(--text-subtle)"
            >
              {currencyCompact(v)}
            </text>
          </g>
        ))}

        {areaPath && <path d={areaPath} fill="url(#trendFill)" />}
        {linePath && (
          <path
            d={linePath}
            fill="none"
            stroke="var(--primary)"
            strokeWidth={2.5}
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
                  y={H - 8}
                  textAnchor="middle"
                  fontSize={10}
                  fill="var(--text-subtle)"
                >
                  {p.label.replace(" ", " ")}
                </text>
              )}
              <circle
                cx={x(i)}
                cy={y(p.spent)}
                r={isActive ? 5 : 3}
                fill="var(--surface)"
                stroke="var(--primary)"
                strokeWidth={2}
              />
              <circle
                cx={x(i)}
                cy={y(p.spent)}
                r={22}
                fill="transparent"
                className={onSelectMonth ? "cursor-pointer" : undefined}
                onClick={() => onSelectMonth?.(p.key)}
              >
                <title>{`${p.label}: ${currency(p.spent)}`}</title>
              </circle>
            </g>
          );
        })}

        {active >= 0 && points[active] && (
          <line
            x1={x(active)}
            x2={x(active)}
            y1={PAD.top}
            y2={PAD.top + innerH}
            stroke="var(--primary)"
            strokeWidth={1}
            strokeDasharray="3 3"
            opacity={0.5}
          />
        )}
      </svg>

      {active >= 0 && points[active] && (
        <div className="mt-1 flex items-center gap-2 text-sm">
          <span className="h-2 w-2 rounded-full bg-primary" aria-hidden />
          <span className="text-muted">{points[active].label}</span>
          <span className="tnum font-semibold text-text">
            {currency(points[active].spent)}
          </span>
        </div>
      )}
    </div>
  );
}

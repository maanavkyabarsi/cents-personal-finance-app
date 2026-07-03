"use client";

import { categoryMeta } from "@/lib/categories";
import { budgetStatus } from "@/lib/derive";
import { currency, percent, prettyCategory } from "@/lib/format";
import type { CategorySummary } from "@/lib/types";
import { CategoryIcon, ChevronRight } from "./icons";
import { StatusPill } from "./primitives";

const STATUS_LABEL = {
  under: "On track",
  warning: "Near limit",
  over: "Over budget",
  none: "No budget",
} as const;

export function CategoryRow({
  summary,
  max,
  onOpen,
}: {
  summary: CategorySummary;
  max: number;
  onOpen: (category: string) => void;
}) {
  const meta = categoryMeta(summary.category);
  const status = budgetStatus(summary.spent, summary.budget);
  const barPct = Math.min((summary.spent / max) * 100, 100);
  const markerPct =
    summary.budget && summary.budget > 0
      ? Math.min((summary.budget / max) * 100, 100)
      : null;

  return (
    <button
      onClick={() => onOpen(summary.category)}
      className="group flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-surface-hover"
      aria-label={`${prettyCategory(summary.category)}, ${currency(
        summary.spent
      )} spent. View transactions.`}
    >
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
        style={{ background: `${meta.color}1f`, color: meta.color }}
        aria-hidden
      >
        <CategoryIcon iconKey={meta.iconKey} size={18} />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-medium text-text">
            {prettyCategory(summary.category)}
          </span>
          <span className="tnum shrink-0 text-sm font-semibold text-text">
            {currency(summary.spent)}
          </span>
        </div>

        <div className="relative mt-2 h-2 w-full rounded-full bg-surface-2">
          <div
            className="h-full rounded-full transition-[width] duration-500"
            style={{
              width: `${barPct}%`,
              background: meta.color,
              opacity: status === "over" ? 1 : 0.85,
            }}
          />
          {markerPct !== null && (
            <span
              className="absolute top-1/2 h-3.5 w-0.5 -translate-y-1/2 rounded-full bg-text"
              style={{ left: `${markerPct}%` }}
              title={`Budget: ${currency(summary.budget!)}`}
              aria-hidden
            />
          )}
        </div>

        <div className="mt-1.5 flex items-center justify-between gap-2">
          {summary.budget ? (
            <span className="tnum text-xs text-muted">
              {percent(summary.spent / summary.budget)} of{" "}
              {currency(summary.budget)} budget
            </span>
          ) : (
            <span className="text-xs text-subtle">No budget set</span>
          )}
          <StatusPill status={status} label={STATUS_LABEL[status]} />
        </div>
      </div>

      <ChevronRight
        size={18}
        className="shrink-0 text-subtle transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-muted"
      />
    </button>
  );
}

export function CategoryRows({
  summaries,
  onOpen,
}: {
  summaries: CategorySummary[];
  onOpen: (category: string) => void;
}) {
  const max = Math.max(
    ...summaries.map((s) => Math.max(s.spent, s.budget ?? 0)),
    1
  );
  return (
    <div className="flex flex-col">
      {summaries.map((s) => (
        <CategoryRow key={s.category} summary={s} max={max} onOpen={onOpen} />
      ))}
    </div>
  );
}

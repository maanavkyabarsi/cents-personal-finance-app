"use client";

import { categoryMeta } from "@/lib/categories";
import {
  currency,
  monthLabelLong,
  percent,
  prettyCategory,
} from "@/lib/format";
import type { CategorySummary } from "@/lib/types";
import { CategoryIcon, ChevronRight, Layers } from "../icons";
import {
  Card,
  EmptyState,
  ProgressBar,
  StatusPill,
} from "../primitives";

const STATUS_LABEL = {
  under: "On track",
  warning: "Near limit",
  high: "High",
  over: "Over budget",
  none: "No budget",
} as const;

function CategoryCard({
  summary,
  onOpen,
}: {
  summary: CategorySummary;
  onOpen: (category: string) => void;
}) {
  const meta = categoryMeta(summary.category);
  const status = summary.status;
  const ratio = summary.budget ? summary.spent / summary.budget : 0;
  const topDetailed = summary.detailed.slice(0, 3);
  const detailMax = Math.max(...summary.detailed.map((d) => d.spent), 1);

  return (
    <button
      onClick={() => onOpen(summary.category)}
      className="group flex w-full cursor-pointer flex-col rounded-2xl border border-border bg-surface p-5 text-left shadow-[var(--shadow-sm)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)]"
    >
      <div className="flex items-center gap-3">
        <span
          className="flex h-11 w-11 items-center justify-center rounded-xl"
          style={{ background: `${meta.color}1f`, color: meta.color }}
          aria-hidden
        >
          <CategoryIcon iconKey={meta.iconKey} size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-text">
            {prettyCategory(summary.category)}
          </p>
          <p className="tnum text-sm text-muted">
            {summary.detailed.length} subcategor
            {summary.detailed.length === 1 ? "y" : "ies"}
          </p>
        </div>
        <ChevronRight
          size={18}
          className="shrink-0 text-subtle transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-muted"
        />
      </div>

      <div className="mt-4 flex items-end justify-between">
        <div>
          <p className="tnum text-2xl font-semibold tracking-tight text-text">
            {currency(summary.spent)}
          </p>
          <p className="tnum mt-0.5 text-xs text-muted">
            {summary.budget
              ? `${percent(ratio)} of ${currency(summary.budget)}`
              : "No budget set"}
          </p>
        </div>
        <StatusPill status={status} label={STATUS_LABEL[status]} />
      </div>

      {summary.budget ? (
        <div className="mt-3">
          <ProgressBar ratio={ratio} status={status} />
        </div>
      ) : null}

      {topDetailed.length > 0 && (
        <ul className="mt-4 space-y-2 border-t border-border pt-3">
          {topDetailed.map((d) => (
            <li key={d.name} className="flex items-center gap-2.5">
              <span className="min-w-0 flex-1 truncate text-xs text-muted">
                {prettyCategory(d.name)}
              </span>
              <span
                className="h-1.5 rounded-full"
                style={{
                  width: `${Math.max((d.spent / detailMax) * 64, 6)}px`,
                  background: meta.color,
                  opacity: 0.7,
                }}
                aria-hidden
              />
              <span className="tnum min-w-16 shrink-0 whitespace-nowrap text-right text-xs font-medium text-text">
                {currency(d.spent)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </button>
  );
}

export function CategoriesView({
  month,
  summaries,
  onOpenCategory,
}: {
  month: string;
  summaries: CategorySummary[];
  onOpenCategory: (category: string) => void;
}) {
  if (summaries.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<Layers size={24} />}
          title="No categories to show"
          message={`No expenditure was recorded for ${monthLabelLong(
            month
          )}. Try a different month.`}
        />
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {summaries.map((s) => (
        <CategoryCard key={s.category} summary={s} onOpen={onOpenCategory} />
      ))}
    </div>
  );
}

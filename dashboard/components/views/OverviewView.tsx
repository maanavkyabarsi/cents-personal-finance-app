"use client";

import type { ReactNode } from "react";
import { categoryMeta } from "@/lib/categories";
import {
  currency,
  currencyCents,
  currencyParts,
  monthLabel,
  monthLabelLong,
  percent,
  prettyCategory,
} from "@/lib/format";
import type { CategorySummary, DashboardOverview, TransactionRow } from "@/lib/types";
import { Alert, ChartPie } from "../icons";
import { Card, EmptyState, cx } from "../primitives";
import { Donut } from "../Donut";
import { RecentTransactions } from "../RecentTransactions";
import { SpendingTrends } from "../SpendingTrends";

export function OverviewView({
  month,
  summaries,
  overview,
  recent,
  accountId,
  onOpenCategory,
  onViewAll,
}: {
  month: string;
  summaries: CategorySummary[];
  overview: DashboardOverview | null;
  recent: TransactionRow[] | null;
  accountId: string | null;
  onOpenCategory: (category: string) => void;
  onViewAll: () => void;
}) {
  const totalSpent = overview?.totalSpent ?? 0;
  const hasBudget = overview?.budget != null && overview.budget > 0;
  const budget = hasBudget ? (overview!.budget as number) : 0;
  const remaining = overview?.remaining ?? 0;

  const delta = overview?.momDeltaPct ?? null;
  const prevLabel = overview?.prevMonthKey ? monthLabel(overview.prevMonthKey) : null;

  const daysElapsed = overview?.daysElapsed ?? 0;
  const daysLeft = overview?.daysLeft ?? 0;
  const inMonth = overview?.inMonth ?? false;
  const pace = overview?.dailyPace ?? 0;
  const usedRatio = overview?.usedRatio ?? 0;

  if (summaries.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<ChartPie size={24} />}
          title="No spending this month"
          message={`There's no expenditure recorded for ${monthLabelLong(
            month
          )}. Pick another month from the selector above.`}
        />
      </Card>
    );
  }

  const heroParts = currencyParts(totalSpent);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <Card className="p-6">
          <p className="text-xs text-subtle">Spent this month</p>
          <p className="mt-1.5 leading-none">
            <span className="num text-[40px] font-medium tracking-[-0.01em] text-text">
              {heroParts.main}
            </span>
            {heroParts.cents && (
              <span className="num text-[20px] font-normal text-subtle align-super">
                {heroParts.cents}
              </span>
            )}
          </p>
          <p className="mt-2.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12.5px] text-muted">
            {delta !== null && <DeltaLabel value={delta} prev={prevLabel} />}
            {hasBudget && (
              <span>
                {delta !== null ? "· " : ""}
                {currency(budget)} monthly budget
              </span>
            )}
          </p>

          <div className="mt-4 flex items-center gap-7">
            <MiniStat
              label="Budget"
              value={hasBudget ? currencyCents(budget) : "—"}
            />
            <MiniStat
              label="Left"
              value={hasBudget ? currencyCents(remaining) : "—"}
            />
            <MiniStat label="Daily pace" value={currencyCents(pace)} />
          </div>
        </Card>

        {(() => {
          const tone = hasBudget ? STATUS_TONE[overview?.status ?? "none"] : "good";
          const over = hasBudget && usedRatio > 1;
          return (
            <div
              className={cx(
                "flex items-center gap-5 rounded-2xl p-6 transition-colors duration-500",
                over ? "budget-over-glow" : "shadow-[var(--shadow-sm)]"
              )}
              style={{ background: TONE_BG[tone], color: CREAM }}
            >
              <Donut
                ratio={usedRatio}
                size={80}
                stroke={8}
                color={CREAM}
                track="rgba(245,238,221,0.22)"
                ariaLabel={`${hasBudget ? percent(usedRatio) : "no budget"} of budget used`}
              />
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-xs opacity-75">
                  {over && <Alert size={13} />}
                  Budget used
                </p>
                <p className="num mt-0.5 text-3xl font-medium">
                  {hasBudget ? percent(usedRatio) : "—"}
                </p>
                <p className="mt-1 max-w-[8.5rem] text-[11.5px] leading-snug opacity-80">
                  {ringNote(hasBudget, remaining, inMonth, daysLeft, month)}
                </p>
              </div>
            </div>
          );
        })()}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <Card className="p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-[13.5px] font-semibold text-text">
              Spending by category
            </h3>
            <button
              onClick={onViewAll}
              className="cursor-pointer text-xs font-semibold text-primary hover:underline"
            >
              View all
            </button>
          </div>
          <CategoryBars
            summaries={summaries}
            total={totalSpent}
            onOpen={onOpenCategory}
          />
        </Card>

        <Card className="p-6">
          <h3 className="mb-4 text-[13.5px] font-semibold text-text">
            Recent transactions
          </h3>
          <RecentTransactions rows={recent} />

          <div className="mt-5">
            <SpendingTrends accountId={accountId} />
          </div>
        </Card>
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="leading-tight">
      <p className="text-xs text-muted">{label}</p>
      <p className="num mt-0.5 text-sm font-medium text-text">{value}</p>
    </div>
  );
}

function DeltaLabel({ value, prev }: { value: number; prev: string | null }) {
  const rose = value > 0;
  const flat = Math.abs(value) < 0.5;
  if (flat)
    return <span className="text-muted">No change{prev ? ` vs ${prev}` : ""}</span>;
  return (
    <span className="inline-flex items-center gap-1">
      <span className={rose ? "font-semibold text-danger" : "font-semibold text-accent"}>
        {rose ? "↑" : "↓"} {Math.abs(value).toFixed(1)}%
      </span>
      {prev && <span>vs {prev}</span>}
    </span>
  );
}

function CategoryBars({
  summaries,
  total,
  onOpen,
}: {
  summaries: CategorySummary[];
  total: number;
  onOpen: (category: string) => void;
}) {
  const top = summaries.slice(0, 6);
  const max = Math.max(...top.map((s) => s.spent), 1);

  return (
    <div>
      {top.map((s) => {
        const barPct = Math.min((s.spent / max) * 100, 100);
        const share = total > 0 ? s.spent / total : 0;
        const color = categoryMeta(s.category).color;
        return (
          <button
            key={s.category}
            onClick={() => onOpen(s.category)}
            className="group flex w-full items-center gap-3 py-[9px] text-left"
            aria-label={`${prettyCategory(s.category)}, ${currencyCents(
              s.spent
            )}. View transactions.`}
          >
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: color }}
              aria-hidden
            />
            <span className="w-[104px] shrink-0 truncate text-[13px] font-medium text-text group-hover:text-primary">
              {prettyCategory(s.category)}
            </span>
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
              <span
                className="block h-full rounded-full transition-[width] duration-500"
                style={{ width: `${barPct}%`, background: color }}
              />
            </span>
            <span className="num w-16 shrink-0 text-right text-[13px] text-text">
              {currencyCents(s.spent)}
            </span>
            <span className="w-8 shrink-0 text-right text-[11px] text-subtle">
              {percent(share)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

const CREAM = "#F5EEDD";

type BudgetTone = "good" | "warn" | "high" | "over";

const STATUS_TONE: Record<CategorySummary["status"], BudgetTone> = {
  under: "good",
  warning: "warn",
  high: "high",
  over: "over",
  none: "good",
};

const TONE_BG: Record<BudgetTone, string> = {
  good: "#2C5C3F",
  warn: "#B7791F",
  high: "#C15B3D",
  over: "#B23A2A",
};

function ringNote(
  hasBudget: boolean,
  remaining: number,
  inMonth: boolean,
  daysLeft: number,
  month: string
): ReactNode {
  if (!hasBudget) return "Set a monthly budget to track your pace";
  if (remaining < 0) return `${currency(-remaining)} over budget`;
  if (inMonth)
    return `On pace — ${daysLeft} day${daysLeft === 1 ? "" : "s"} left`;
  return monthLabelLong(month);
}

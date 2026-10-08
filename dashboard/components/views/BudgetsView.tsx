"use client";

import { useState } from "react";
import { categoryMeta } from "@/lib/categories";
import { budgetStatus } from "@/lib/derive";
import { currency, monthLabelLong, percent, prettyCategory } from "@/lib/format";
import { CategoryIcon, Check, Target } from "../icons";
import {
  Button,
  Card,
  EmptyState,
  ProgressBar,
  SectionHeading,
  cx,
} from "../primitives";

function BudgetRow({
  category,
  current,
  spent,
  onSave,
}: {
  category: string;
  current: number | null;
  spent: number;
  onSave: (category: string, limit: number, isNew: boolean) => Promise<boolean>;
}) {
  const meta = categoryMeta(category);
  const [value, setValue] = useState(current != null ? String(current) : "");
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = Number(value);
  const valid = value.trim() !== "" && Number.isFinite(parsed) && parsed >= 0;
  const dirty = value.trim() !== (current != null ? String(current) : "");
  const status = budgetStatus(spent, current);

  async function save() {
    if (!valid || !dirty) return;
    setSaving(true);
    setError(null);
    const ok = await onSave(category, parsed, current == null);
    setSaving(false);
    if (ok) {
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 1800);
    } else {
      setError("Couldn't save — try again");
    }
  }

  return (
    <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:gap-4">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
          style={{ background: `${meta.color}1f`, color: meta.color }}
          aria-hidden
        >
          <CategoryIcon iconKey={meta.iconKey} size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-text">
            {prettyCategory(category)}
          </p>
          <p className="tnum text-xs text-muted">
            {currency(spent)} spent
            {current != null ? ` · ${percent(spent / current)} of budget` : ""}
          </p>
          {current != null && (
            <div className="mt-1.5 max-w-44">
              <ProgressBar ratio={current ? spent / current : 0} status={status} />
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-subtle">
            $
          </span>
          <label className="sr-only" htmlFor={`budget-${category}`}>
            {prettyCategory(category)} monthly budget
          </label>
          <input
            id={`budget-${category}`}
            inputMode="decimal"
            value={value}
            placeholder="0"
            onChange={(e) => setValue(e.target.value.replace(/[^0-9.]/g, ""))}
            onKeyDown={(e) => e.key === "Enter" && save()}
            aria-invalid={value.trim() !== "" && !valid}
            className={cx(
              "tnum h-10 w-32 rounded-xl border bg-surface pl-7 pr-3 text-base font-medium text-text transition-colors focus-visible:border-primary sm:text-sm",
              value.trim() !== "" && !valid ? "border-danger" : "border-border"
            )}
          />
        </div>
        <Button
          variant={dirty ? "primary" : "secondary"}
          onClick={save}
          disabled={!valid || !dirty || saving}
          aria-label={`Save ${prettyCategory(category)} budget`}
          className="w-20"
        >
          {saving ? "…" : justSaved ? <Check size={18} /> : "Save"}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-xs font-medium text-danger sm:w-full sm:text-right">
          {error}
        </p>
      )}
    </div>
  );
}

function OverallBudgetCard({
  current,
  spent,
  month,
  onSave,
}: {
  current: number | null;
  spent: number;
  month: string;
  onSave: (limit: number, isNew: boolean) => Promise<boolean>;
}) {
  const [value, setValue] = useState(current != null ? String(current) : "");
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = Number(value);
  const valid = value.trim() !== "" && Number.isFinite(parsed) && parsed >= 0;
  const dirty = value.trim() !== (current != null ? String(current) : "");
  const status = budgetStatus(spent, current);
  const ratio = current ? spent / current : 0;

  async function save() {
    if (!valid || !dirty) return;
    setSaving(true);
    setError(null);
    const ok = await onSave(parsed, current == null);
    setSaving(false);
    if (ok) {
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 1800);
    } else {
      setError("Couldn't save — try again");
    }
  }

  return (
    <Card className="p-5">
      <SectionHeading
        title="Overall monthly budget"
        subtitle={`Your total spending target · spend shown for ${monthLabelLong(
          month
        )}`}
      />
      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <p className="tnum text-sm text-muted">
            {currency(spent)} spent
            {current != null ? ` · ${percent(ratio)} of ${currency(current)}` : ""}
          </p>
          {current != null && (
            <div className="mt-2 max-w-md">
              <ProgressBar ratio={ratio} status={status} />
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-subtle">
              $
            </span>
            <label className="sr-only" htmlFor="overall-budget">
              Overall monthly budget
            </label>
            <input
              id="overall-budget"
              inputMode="decimal"
              value={value}
              placeholder="0"
              onChange={(e) => setValue(e.target.value.replace(/[^0-9.]/g, ""))}
              onKeyDown={(e) => e.key === "Enter" && save()}
              aria-invalid={value.trim() !== "" && !valid}
              className={cx(
                "tnum h-10 w-36 rounded-xl border bg-surface pl-7 pr-3 text-base font-medium text-text transition-colors focus-visible:border-primary sm:text-sm",
                value.trim() !== "" && !valid ? "border-danger" : "border-border"
              )}
            />
          </div>
          <Button
            variant={dirty ? "primary" : "secondary"}
            onClick={save}
            disabled={!valid || !dirty || saving}
            aria-label="Save overall monthly budget"
            className="w-20"
          >
            {saving ? "…" : justSaved ? <Check size={18} /> : "Save"}
          </Button>
        </div>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </Card>
  );
}

export function BudgetsView({
  month,
  categories,
  budgets,
  spentByCategory,
  overallBudget,
  overallSpent,
  onSave,
  onSaveOverall,
}: {
  month: string;
  categories: string[];
  budgets: Map<string, number>;
  spentByCategory: Map<string, number>;
  overallBudget: number | null;
  overallSpent: number;
  onSave: (category: string, limit: number, isNew: boolean) => Promise<boolean>;
  onSaveOverall: (limit: number, isNew: boolean) => Promise<boolean>;
}) {
  const overall = (
    <OverallBudgetCard
      current={overallBudget}
      spent={overallSpent}
      month={month}
      onSave={onSaveOverall}
    />
  );

  if (categories.length === 0) {
    return (
      <div className="space-y-4">
        {overall}
        <Card>
          <EmptyState
            icon={<Target size={24} />}
            title="No categories yet"
            message="Once transactions are synced, your spending categories will appear here so you can set per-category budgets."
          />
        </Card>
      </div>
    );
  }

  const withBudget = categories.filter((c) => budgets.has(c)).length;

  return (
    <div className="space-y-4">
      {overall}

      <Card className="overflow-hidden">
        <div className="border-b border-border px-5 py-4">
          <SectionHeading
            title="Per-category budgets"
            subtitle={`${withBudget} of ${categories.length} categories have a budget · spend shown for ${monthLabelLong(
              month
            )}`}
          />
        </div>
        <div className="divide-y divide-border">
          {categories.map((c) => (
            <BudgetRow
              key={c}
              category={c}
              current={budgets.get(c) ?? null}
              spent={spentByCategory.get(c) ?? 0}
              onSave={onSave}
            />
          ))}
        </div>
      </Card>
    </div>
  );
}

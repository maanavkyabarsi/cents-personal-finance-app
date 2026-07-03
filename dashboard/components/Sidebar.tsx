"use client";

import type { ViewId } from "@/lib/types";
import { Clock, Grid, ListLines } from "./icons";
import { cx } from "./primitives";

const NAV: { id: ViewId; label: string; icon: typeof Grid }[] = [
  { id: "overview", label: "Overview", icon: Grid },
  { id: "categories", label: "Categories", icon: ListLines },
  { id: "budgets", label: "Budgets", icon: Clock },
];

function NavItems({
  active,
  onSelect,
  layout,
}: {
  active: ViewId;
  onSelect: (v: ViewId) => void;
  layout: "rail" | "bar";
}) {
  return (
    <>
      {NAV.map(({ id, label, icon: Icon }) => {
        const selected = active === id;
        return (
          <button
            key={id}
            onClick={() => onSelect(id)}
            aria-current={selected ? "page" : undefined}
            className={cx(
              "flex cursor-pointer items-center gap-2.5 rounded-[10px] transition-colors duration-200",
              layout === "rail"
                ? "w-full px-3 py-2.5 text-[13.5px]"
                : "flex-1 flex-col gap-1 px-2 py-2 text-xs",
              selected
                ? "bg-primary-soft font-semibold text-primary"
                : "font-medium text-muted hover:bg-surface-hover hover:text-text"
            )}
          >
            <Icon size={layout === "rail" ? 17 : 21} />
            {label}
          </button>
        );
      })}
    </>
  );
}

export function Sidebar({
  active,
  onSelect,
}: {
  active: ViewId;
  onSelect: (v: ViewId) => void;
}) {
  return (
    <aside className="sticky top-[65px] hidden h-[calc(100dvh-65px)] w-56 shrink-0 flex-col border-r border-border px-4 py-7 lg:flex">
      <p className="px-3 pb-2.5 text-[11px] font-medium uppercase tracking-[0.08em] text-subtle">
        Menu
      </p>
      <nav className="flex flex-col gap-0.5" aria-label="Primary">
        <NavItems active={active} onSelect={onSelect} layout="rail" />
      </nav>
    </aside>
  );
}

export function BottomNav({
  active,
  onSelect,
}: {
  active: ViewId;
  onSelect: (v: ViewId) => void;
}) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 flex gap-1 border-t border-border bg-surface/95 px-3 pb-[env(safe-area-inset-bottom)] pt-1.5 backdrop-blur lg:hidden"
      aria-label="Primary"
    >
      <NavItems active={active} onSelect={onSelect} layout="bar" />
    </nav>
  );
}

"use client";

import { TAGGABLE_CATEGORIES } from "@/lib/categories";
import { prettyCategory } from "@/lib/format";

const RESET = "__reset__";

export type TagHandler = (
  transactionId: string,
  category: string | null
) => Promise<boolean>;

// Native select so it works well on touch devices; always shows "Tag" as its label and
// resets after each choice since the row re-renders with the new category.
export function CategoryTagMenu({
  isTagged,
  disabled,
  label,
  onSelect,
  className = "",
}: {
  isTagged: boolean;
  disabled?: boolean;
  label: string;
  onSelect: (category: string | null) => void;
  className?: string;
}) {
  return (
    <select
      value=""
      disabled={disabled}
      aria-label={label}
      onChange={(e) => {
        const v = e.target.value;
        if (!v) return;
        onSelect(v === RESET ? null : v);
      }}
      className={`shrink-0 cursor-pointer rounded-md bg-transparent px-1.5 py-1 font-medium text-muted transition-colors hover:bg-surface-2 hover:text-text disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      <option value="">{isTagged ? "Retag" : "Tag"}</option>
      {isTagged && <option value={RESET}>Reset to original</option>}
      {TAGGABLE_CATEGORIES.map((c) => (
        <option key={c} value={c}>
          {prettyCategory(c)}
        </option>
      ))}
    </select>
  );
}

export function TaggedBadge({ original }: { original: string | null | undefined }) {
  return (
    <span
      title={`Originally ${prettyCategory(original ?? null)}`}
      className="ml-1.5 rounded bg-surface-2 px-1.5 py-0.5 align-middle text-[10px] font-medium text-muted"
    >
      Tagged
    </span>
  );
}

"use client";

import type { ReactNode } from "react";
import type { BudgetStatus } from "@/lib/derive";

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

export function Card({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cx(
        "rounded-2xl border border-border bg-surface shadow-[var(--shadow-sm)]",
        className
      )}
    >
      {children}
    </section>
  );
}

export function SectionHeading({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h2 className="text-base font-semibold text-text">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

const STATUS_STYLES: Record<BudgetStatus, { dot: string; text: string; bg: string }> =
  {
    under: { dot: "bg-accent", text: "text-accent", bg: "bg-accent-soft" },
    warning: { dot: "bg-warning", text: "text-warning", bg: "bg-warning-soft" },
    over: { dot: "bg-danger", text: "text-danger", bg: "bg-danger-soft" },
    none: { dot: "bg-subtle", text: "text-muted", bg: "bg-surface-2" },
  };

export function StatusPill({
  status,
  label,
}: {
  status: BudgetStatus;
  label: string;
}) {
  const s = STATUS_STYLES[status];
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        s.bg,
        s.text
      )}
    >
      <span className={cx("h-1.5 w-1.5 rounded-full", s.dot)} aria-hidden />
      {label}
    </span>
  );
}

export function ProgressBar({
  ratio,
  status,
}: {
  ratio: number;
  status: BudgetStatus;
}) {
  const pct = Math.min(Math.max(ratio, 0), 1) * 100;
  const fill =
    status === "over"
      ? "bg-danger"
      : status === "warning"
        ? "bg-warning"
        : "bg-accent";
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-surface-2"
      role="progressbar"
      aria-valuenow={Math.round(ratio * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cx("h-full rounded-full transition-[width] duration-500", fill)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

type ButtonProps = {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost";
  type?: "button" | "submit";
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
};

export function Button({
  children,
  onClick,
  variant = "secondary",
  type = "button",
  disabled,
  className,
  ...rest
}: ButtonProps) {
  const styles =
    variant === "primary"
      ? "bg-primary text-on-primary hover:bg-primary-strong shadow-[var(--shadow-sm)]"
      : variant === "ghost"
        ? "text-muted hover:bg-surface-hover hover:text-text"
        : "border border-border bg-surface text-text hover:bg-surface-hover";
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cx(
        "inline-flex h-10 min-w-10 cursor-pointer items-center justify-center gap-2 rounded-xl px-3.5 text-sm font-medium transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50",
        styles,
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("skeleton rounded-lg", className)} aria-hidden />;
}

export function EmptyState({
  icon,
  title,
  message,
}: {
  icon?: ReactNode;
  title: string;
  message: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      {icon && (
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-2 text-subtle">
          {icon}
        </div>
      )}
      <h3 className="text-sm font-semibold text-text">{title}</h3>
      <p className="max-w-xs text-sm text-muted">{message}</p>
    </div>
  );
}

"use client";

import { useEffect } from "react";
import { Alert, Check } from "./icons";

export interface ToastState {
  id: number;
  message: string;
  tone: "success" | "error";
}

export function Toast({
  toast,
  onDismiss,
}: {
  toast: ToastState | null;
  onDismiss: () => void;
}) {
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(onDismiss, 3200);
    return () => clearTimeout(t);
  }, [toast, onDismiss]);

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex justify-center px-4 lg:bottom-6"
      aria-live="polite"
    >
      {toast && (
        <div
          key={toast.id}
          className="animate-fade-up pointer-events-auto flex items-center gap-2.5 rounded-xl border border-border bg-surface px-4 py-3 shadow-[var(--shadow-lg)]"
        >
          <span
            className={`flex h-6 w-6 items-center justify-center rounded-full ${
              toast.tone === "success"
                ? "bg-accent-soft text-accent"
                : "bg-danger-soft text-danger"
            }`}
            aria-hidden
          >
            {toast.tone === "success" ? <Check size={15} /> : <Alert size={15} />}
          </span>
          <span className="text-sm font-medium text-text">{toast.message}</span>
        </div>
      )}
    </div>
  );
}

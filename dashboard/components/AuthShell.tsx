"use client";

import type { ReactNode } from "react";
import { useTheme } from "@/lib/useTheme";
import { TopStrip } from "./Topbar";
import { Card } from "./primitives";

export function AuthShell({ children }: { children: ReactNode }) {
  const [theme, setThemeMode] = useTheme();

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <TopStrip theme={theme} onSetTheme={setThemeMode} />

      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <Card className="animate-fade-up w-full max-w-md p-8 sm:p-10">
          {children}
        </Card>
      </main>

      <footer className="px-4 pb-6 text-center text-xs text-subtle">
        cents · personal finance dashboard
      </footer>
    </div>
  );
}

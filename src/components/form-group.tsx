import type { ReactNode } from "react";

/**
 * Labeled group card for multi-section forms and detail-info tiles --
 * accent dot + uppercase label over a tinted card. Matches the Claude Design
 * modal mockup's field grouping, but uses bg-muted/border-border (not the
 * mockup's literal white/oklch(0.96) backgrounds) so it adapts to the app's
 * light/dark theme instead of only looking right in light mode.
 */
export function FormGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-muted/50 p-4">
      <div className="flex items-center gap-2">
        <span className="size-1.5 shrink-0 rounded-full bg-primary" />
        <span className="text-[10px] font-semibold tracking-[0.1em] text-[oklch(0.45_0.15_45)] uppercase">
          {label}
        </span>
      </div>
      {children}
    </div>
  );
}

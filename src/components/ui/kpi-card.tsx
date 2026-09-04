import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type KpiAccentColor = "default" | "success" | "warning" | "danger";
export type KpiSubtitleIcon = "up" | "down" | "dot" | "none";
export type KpiTone = "info" | "warning" | "success" | "danger" | "neutral";

/**
 * Shared icon-circle palette (bg + icon color) used across every KPI row in
 * the app. dark: variants keep it legible against the oklch .dark theme in
 * globals.css -- plain bg-*-50/text-*-600 literals have no dark counterpart.
 */
export const KPI_TONE: Record<KpiTone, { bg: string; icon: string }> = {
  info: { bg: "bg-blue-50 dark:bg-blue-500/15", icon: "text-blue-600 dark:text-blue-400" },
  warning: { bg: "bg-orange-50 dark:bg-orange-500/15", icon: "text-orange-600 dark:text-orange-400" },
  success: { bg: "bg-green-50 dark:bg-green-500/15", icon: "text-green-600 dark:text-green-400" },
  danger: { bg: "bg-red-50 dark:bg-red-500/15", icon: "text-red-600 dark:text-red-400" },
  neutral: { bg: "bg-gray-50 dark:bg-gray-500/15", icon: "text-gray-600 dark:text-gray-400" },
};

export interface KpiCardProps {
  title: string;
  value: string | number;
  valueColor?: KpiAccentColor;
  subtitle?: string;
  subtitleColor?: KpiAccentColor;
  subtitleIcon?: KpiSubtitleIcon;
  icon: ReactNode;
  iconBgColor?: string;
  highlight?: boolean;
  className?: string;
}

// globals.css has no --success/--warning tokens yet. success/warning reuse
// the same oklch literal and --primary accent already established for money
// amounts across Facturas/Citas (Cobrado, saldo pendiente); danger reuses
// --destructive so it stays dark-mode aware like the rest of the app.
const ACCENT_COLOR_CLASSNAME: Record<KpiAccentColor, string> = {
  default: "text-foreground",
  success: "text-[oklch(0.4_0.1_150)]",
  warning: "text-primary",
  danger: "text-destructive",
};

const SUBTITLE_ACCENT_COLOR_CLASSNAME: Record<KpiAccentColor, string> = {
  ...ACCENT_COLOR_CLASSNAME,
  default: "text-muted-foreground",
};

function SubtitleIcon({ icon }: { icon: KpiSubtitleIcon }) {
  if (icon === "up") return <ArrowUpRight className="size-3.5 shrink-0" />;
  if (icon === "down") return <ArrowDownRight className="size-3.5 shrink-0" />;
  if (icon === "dot") return <span className="size-1.5 shrink-0 rounded-full bg-current" />;
  return null;
}

/**
 * Standard KPI tile: uppercase muted title, bold foreground value, an
 * optional colored/iconed subtitle, and an icon in a soft-background circle.
 * Mirrors the 4-up KPI row pattern from docs/Evidencias/Facturas.png.
 */
export function KpiCard({
  title,
  value,
  valueColor = "default",
  subtitle,
  subtitleColor = "default",
  subtitleIcon = "none",
  icon,
  iconBgColor = "bg-primary/10",
  highlight = false,
  className,
}: KpiCardProps) {
  return (
    <Card className={cn("w-full", highlight && "bg-primary/5 ring-2 ring-primary/25", className)}>
      <CardContent className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          <p className="truncate text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</p>
          <p className={cn("font-mono text-2xl font-semibold", ACCENT_COLOR_CLASSNAME[valueColor])}>{value}</p>
          {/*
            Always rendered (invisible when there is no subtitle) so every
            card reserves the same line of height -- otherwise cards without
            a subtitle (or whose subtitle only appears conditionally, like
            Dashboard's "En el taller") render shorter than their siblings.
          */}
          <p
            className={cn(
              "flex items-center gap-1 text-xs",
              subtitle ? SUBTITLE_ACCENT_COLOR_CLASSNAME[subtitleColor] : "invisible",
            )}
          >
            {subtitle ? (
              <>
                <SubtitleIcon icon={subtitleIcon} />
                {subtitle}
              </>
            ) : (
              " "
            )}
          </p>
        </div>
        <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-full", iconBgColor)}>
          {icon}
        </div>
      </CardContent>
    </Card>
  );
}

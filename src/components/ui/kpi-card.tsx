import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type KpiAccentColor = "default" | "success" | "warning" | "danger";
export type KpiSubtitleIcon = "up" | "down" | "dot" | "none";
export type KpiTone = "info" | "warning" | "success" | "danger" | "neutral" | "purple";

/**
 * Shared palette used across every KPI row in the app: a subtle card-wide
 * wash (cardBg), a slightly stronger icon-circle fill (iconBg) so the icon
 * still reads against that wash, and the icon's own color. dark: variants
 * keep it legible against the oklch .dark theme in globals.css -- plain
 * bg-*-50/text-*-600 literals have no dark counterpart. title/ring are opt-in
 * (titleClassName / className) for rows that want the whole card in its tone.
 */
export const KPI_TONE: Record<
  KpiTone,
  { cardBg: string; iconBg: string; icon: string; title: string; ring: string }
> = {
  info: {
    cardBg: "bg-blue-50 dark:bg-blue-500/10",
    iconBg: "bg-blue-100 dark:bg-blue-500/20",
    icon: "text-blue-600 dark:text-blue-400",
    title: "font-semibold tracking-wide text-blue-700 dark:text-blue-400",
    ring: "ring-blue-200 dark:ring-blue-500/30",
  },
  warning: {
    cardBg: "bg-orange-50 dark:bg-orange-500/10",
    iconBg: "bg-orange-100 dark:bg-orange-500/20",
    icon: "text-orange-600 dark:text-orange-400",
    title: "font-semibold tracking-wide text-orange-700 dark:text-orange-400",
    ring: "ring-orange-200 dark:ring-orange-500/30",
  },
  success: {
    cardBg: "bg-green-50 dark:bg-green-500/10",
    iconBg: "bg-green-100 dark:bg-green-500/20",
    icon: "text-green-600 dark:text-green-400",
    title: "font-semibold tracking-wide text-green-700 dark:text-green-400",
    ring: "ring-green-200 dark:ring-green-500/30",
  },
  danger: {
    cardBg: "bg-red-50 dark:bg-red-500/10",
    iconBg: "bg-red-100 dark:bg-red-500/20",
    icon: "text-red-600 dark:text-red-400",
    title: "font-semibold tracking-wide text-red-700 dark:text-red-400",
    ring: "ring-red-200 dark:ring-red-500/30",
  },
  neutral: {
    cardBg: "bg-gray-50 dark:bg-gray-500/10",
    iconBg: "bg-gray-100 dark:bg-gray-500/20",
    icon: "text-gray-600 dark:text-gray-400",
    title: "font-semibold tracking-wide text-gray-700 dark:text-gray-400",
    ring: "ring-gray-200 dark:ring-gray-500/30",
  },
  purple: {
    cardBg: "bg-purple-50 dark:bg-purple-500/10",
    iconBg: "bg-purple-100 dark:bg-purple-500/20",
    icon: "text-purple-600 dark:text-purple-400",
    title: "font-semibold tracking-wide text-purple-700 dark:text-purple-400",
    ring: "ring-purple-200 dark:ring-purple-500/30",
  },
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
  titleClassName?: string;
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
 * Standard KPI tile: title + icon badge on top, bold value below spanning
 * the full card width (so a wide currency value never competes with the
 * icon for space), and an optional colored/iconed subtitle underneath.
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
  titleClassName,
}: KpiCardProps) {
  return (
    <Card className={cn("@container h-full w-full", highlight && "bg-primary/5 ring-2 ring-primary/25", className)}>
      <CardContent className="flex flex-col gap-1.5">
        {/*
          Sized for the Inicio's row of six on a laptop (~152px cards at 1280px):
          "VENCIMIENTOS" needs 81px at 11px without extra tracking and the row
          leaves 86px next to a 28px icon. break-words is the safety net for
          anything narrower.
        */}
        <div className="flex items-start justify-between gap-1.5">
          <p
            className={cn(
              "line-clamp-2 min-w-0 text-[11px] font-medium break-words text-muted-foreground uppercase",
              titleClassName,
            )}
          >
            {title}
          </p>
          <div className={cn("flex size-7 shrink-0 items-center justify-center rounded-full", iconBgColor)}>
            {icon}
          </div>
        </div>
        {/*
          In a narrow card (the Inicio's row of six on a laptop) a money value
          like "$ 4.307.703" no longer fits at text-xl and got truncated: step
          the size down by the card's own width (container query), not the
          screen's, so wider rows elsewhere keep text-xl.
        */}
        <p
          className={cn(
            "truncate font-mono text-xl font-semibold @max-[10rem]:text-base",
            ACCENT_COLOR_CLASSNAME[valueColor],
          )}
        >
          {value}
        </p>
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
      </CardContent>
    </Card>
  );
}

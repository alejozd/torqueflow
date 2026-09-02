import * as React from "react";
import { ChevronDownIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A real `<select>` (not shadcn's Base-UI-backed `Select` in select.tsx),
 * styled to match it visually with a trailing chevron. Kept native
 * specifically so existing tests can keep using userEvent.selectOptions()/
 * getByRole("option") against real DOM <option> elements -- the Base UI
 * Select has no DOM options while closed, which those tests depend on.
 */
const NativeSelect = React.forwardRef<HTMLSelectElement, React.ComponentProps<"select">>(
  ({ className, children, ...props }, ref) => {
    return (
      <div className="relative">
        <select
          ref={ref}
          className={cn(
            "flex h-8 w-full appearance-none items-center justify-between rounded-lg border border-input bg-transparent px-2.5 py-1 pr-7 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30",
            className,
          )}
          {...props}
        >
          {children}
        </select>
        <ChevronDownIcon className="pointer-events-none absolute top-1/2 right-2 size-4 -translate-y-1/2 text-muted-foreground" />
      </div>
    );
  },
);
NativeSelect.displayName = "NativeSelect";

export { NativeSelect };

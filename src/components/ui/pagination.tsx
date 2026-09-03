"use client"

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SelectField } from "@/components/ui/select-field"
import { cn } from "@/lib/utils"

/**
 * Standalone pagination footer meant to sit under DataTable (or any list),
 * decoupled from it so the row-range copy, Prev/Next affordance, and
 * optional page-size control stay identical everywhere they're reused
 * instead of each table hand-rolling its own footer (see the ad-hoc version
 * this replaces in clientes-table.tsx).
 */
function Pagination({
  page,
  pageCount,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50, 100],
  className,
}: {
  page: number
  pageCount: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
  onPageSizeChange?: (pageSize: number) => void
  pageSizeOptions?: number[]
  className?: string
}) {
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1
  const end = total === 0 ? 0 : Math.min(page * pageSize, total)
  const pageItems = getPageItems(page, pageCount)

  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 border-t border-border pt-4 pb-2 text-sm",
        className,
      )}
    >
      <span className="font-medium text-foreground">
        {total === 0
          ? "Mostrando 0 de 0 registros"
          : `Mostrando ${start}-${end} de ${total} registros`}
      </span>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {onPageSizeChange ? (
          <SelectField
            items={pageSizeOptions.map((size) => ({
              value: String(size),
              label: `${size} por página`,
            }))}
            value={String(pageSize)}
            onValueChange={(value) => onPageSizeChange(Number(value))}
          />
        ) : null}
        {pageCount > 1 ? (
          <div className="flex items-center gap-2">
            {pageCount > 5 ? (
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="Primera página"
                disabled={page <= 1}
                onClick={() => onPageChange(1)}
              >
                <ChevronsLeft />
              </Button>
            ) : null}
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Página anterior"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
            >
              <ChevronLeft />
            </Button>
            {pageItems.map((item, index) =>
              item === "ellipsis" ? (
                <span key={`ellipsis-${index}`} className="px-1 text-xs text-muted-foreground">
                  …
                </span>
              ) : (
                <Button
                  key={item}
                  variant={item === page ? "default" : "outline"}
                  size="icon-sm"
                  aria-label={`Página ${item}`}
                  aria-current={item === page ? "page" : undefined}
                  onClick={() => onPageChange(item)}
                >
                  {item}
                </Button>
              ),
            )}
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Página siguiente"
              disabled={page >= pageCount}
              onClick={() => onPageChange(page + 1)}
            >
              <ChevronRight />
            </Button>
            {pageCount > 5 ? (
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="Última página"
                disabled={page >= pageCount}
                onClick={() => onPageChange(pageCount)}
              >
                <ChevronsRight />
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}

/**
 * Builds the numbered-page-button sequence with ellipsis windowing:
 * always page 1 and the last page, the current page plus one neighbor on
 * each side, and any gap of 2+ collapsed into a single "ellipsis" marker
 * (never more than one consecutive ellipsis per side).
 */
function getPageItems(page: number, pageCount: number): (number | "ellipsis")[] {
  if (pageCount <= 5) {
    return Array.from({ length: pageCount }, (_, i) => i + 1)
  }

  const items: (number | "ellipsis")[] = []
  const windowStart = Math.max(2, page - 1)
  const windowEnd = Math.min(pageCount - 1, page + 1)

  // Number of pages hidden between page 1 and windowStart. A gap of exactly
  // one page is shown by its own number rather than collapsed into "…" —
  // only gaps of 2+ pages get an ellipsis.
  const leadingGap = windowStart - 2
  const trailingGap = pageCount - windowEnd - 1

  items.push(1)
  if (leadingGap >= 2) {
    items.push("ellipsis")
  } else if (leadingGap === 1) {
    items.push(windowStart - 1)
  }
  for (let p = windowStart; p <= windowEnd; p++) {
    items.push(p)
  }
  if (trailingGap >= 2) {
    items.push("ellipsis")
  } else if (trailingGap === 1) {
    items.push(windowEnd + 1)
  }
  items.push(pageCount)

  return items
}

export { Pagination }

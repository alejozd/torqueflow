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

  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground", className)}>
      <span>
        {total === 0
          ? "Mostrando 0 de 0 registros"
          : `Mostrando ${start}-${end} de ${total} registros`}
      </span>
      <div className="flex items-center gap-2">
        {onPageSizeChange ? (
          <SelectField
            items={pageSizeOptions.map((size) => ({
              value: String(size),
              label: `${size} por página`,
            }))}
            value={String(pageSize)}
            onValueChange={(value) => onPageSizeChange(Number(value))}
            size="sm"
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
            <span className="font-mono text-xs">
              {page}/{pageCount}
            </span>
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

export { Pagination }

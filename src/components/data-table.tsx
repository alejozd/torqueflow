import type { ReactNode } from "react";
import Link from "next/link";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type DataTableColumn<T> = {
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
};

export function DataTable<T>({
  columns,
  rows,
  getRowKey,
  emptyMessage,
  rowHref,
}: {
  columns: DataTableColumn<T>[];
  rows: T[];
  getRowKey: (row: T) => string;
  emptyMessage: string;
  /**
   * When set, the whole row navigates there -- not just one cell. Implemented
   * as a "stretched link" (an invisible <Link> absolutely positioned over the
   * row) rather than a client-side onClick: DataTable stays a Server
   * Component this way, so none of its 30+ other callers (which pass plain
   * functions as `cell`/`getRowKey` -- not serializable across a client
   * boundary) need to change. `position: relative` on the row makes it the
   * containing block the link's `inset-0` sizes against. `cursor-pointer` is
   * scoped to rowHref rows only -- showing it on a row that isn't actually
   * clickable would be a false affordance.
   */
  rowHref?: (row: T) => string;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          {columns.map((column) => (
            <TableHead key={column.header}>{column.header}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={getRowKey(row)} className={cn("hover:bg-border", rowHref && "relative cursor-pointer")}>
            {columns.map((column, index) => (
              <TableCell key={column.header} className={column.className}>
                {rowHref && index === 0 ? (
                  <Link href={rowHref(row)} className="absolute inset-0 z-10">
                    <span className="sr-only">Ver detalle</span>
                  </Link>
                ) : null}
                {column.cell(row)}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

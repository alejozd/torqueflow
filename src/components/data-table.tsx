import type { ReactNode } from "react";
import Link from "next/link";

import { DataTableInteractive } from "@/components/data-table-interactive";
import { TableCell, TableHead, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type DataTableColumn<T> = {
  header: ReactNode;
  cell: (row: T) => ReactNode;
  className?: string;
  /**
   * Plain-text representation of this column's value for a row, used by
   * DataTableInteractive's client-side search filter when the caller opts
   * in via `DataTable`'s `searchable` prop.
   */
  searchValue?: (row: T) => string;
};

export function DataTable<T>({
  columns,
  rows,
  getRowKey,
  emptyMessage,
  rowHref,
  pageSize = 20,
  searchable = false,
  searchPlaceholder = "Buscar...",
  headerClassName,
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
  /** Rows per page for the client-side pagination footer. Defaults to 20. */
  pageSize?: number;
  /**
   * Enables the client-side search box in DataTableInteractive. Only
   * meaningful when at least one column defines `searchValue`. Defaults to
   * `false` -- zero visible change for callers that don't opt in.
   */
  searchable?: boolean;
  /** Placeholder text for the search box. Only used when `searchable` is true. */
  searchPlaceholder?: string;
  /** Optional className for the table's <thead>. Undefined by default -- zero visual change for callers that don't opt in. */
  headerClassName?: string;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  // Everything below calls the raw function props (`cell`, `getRowKey`,
  // `rowHref`) -- exactly the calls that aren't serializable across the
  // Server->Client boundary -- so it must happen here, in the Server
  // Component, producing plain already-rendered elements. Only those
  // elements (and the derived searchTexts strings) cross into
  // DataTableInteractive, which is a Client Component that owns pagination
  // state but never needs to call `cell`/`getRowKey`/`rowHref` itself.
  const headerCells = columns.map((column, index) => (
    <TableHead key={index} className={column.className}>
      {column.header}
    </TableHead>
  ));

  const rowElements = rows.map((row) => (
    <TableRow key={getRowKey(row)} className={cn("hover:bg-border", rowHref && "relative cursor-pointer")}>
      {columns.map((column, index) => (
        <TableCell key={index} className={column.className}>
          {rowHref && index === 0 ? (
            <Link href={rowHref(row)} className="absolute inset-0 z-10">
              <span className="sr-only">Ver detalle</span>
            </Link>
          ) : null}
          {column.cell(row)}
        </TableCell>
      ))}
    </TableRow>
  ));

  const searchTexts = rows.map((row) =>
    columns
      .map((column) => column.searchValue?.(row) ?? "")
      .join(" ")
      .toLowerCase(),
  );

  return (
    <DataTableInteractive
      headerCells={headerCells}
      rowElements={rowElements}
      searchTexts={searchTexts}
      rowCount={rows.length}
      pageSize={pageSize}
      searchable={searchable}
      searchPlaceholder={searchPlaceholder}
      emptyMessage={emptyMessage}
      headerClassName={headerClassName}
    />
  );
}

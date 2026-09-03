"use client";

import { useState, type ReactNode } from "react";

import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { Table, TableBody, TableHeader, TableRow } from "@/components/ui/table";

/**
 * Client-side pagination/search shell for DataTable. It never touches the
 * row/column data itself -- data-table.tsx (a Server Component) already did
 * every function call that isn't serializable across the Server->Client
 * boundary (`cell(row)`, `getRowKey(row)`, `rowHref(row)`) and handed this
 * component the already-built <TableHead>/<TableRow> elements. This
 * component's only job is to own `page`/`query` state and slice/filter those
 * pre-rendered elements for display.
 */
export function DataTableInteractive({
  headerCells,
  rowElements,
  searchTexts,
  rowCount,
  pageSize: initialPageSize,
  searchable,
  searchPlaceholder,
  emptyMessage,
}: {
  headerCells: ReactNode[];
  rowElements: ReactNode[];
  searchTexts: string[];
  rowCount: number;
  /** Initial rows-per-page; the user can change it afterwards via the Pagination page-size selector. */
  pageSize: number;
  searchable: boolean;
  searchPlaceholder?: string;
  emptyMessage: string;
}) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [query, setQuery] = useState("");

  const normalizedQuery = query.trim().toLowerCase();
  const allIndexes = Array.from({ length: rowCount }, (_, index) => index);
  const visibleIndexes =
    searchable && normalizedQuery
      ? allIndexes.filter((index) => (searchTexts[index] ?? "").includes(normalizedQuery))
      : allIndexes;

  const total = visibleIndexes.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, pageCount);
  const start = (currentPage - 1) * pageSize;
  const pageIndexes = visibleIndexes.slice(start, start + pageSize);

  function handleQueryChange(value: string) {
    setQuery(value);
    setPage(1);
  }

  function handlePageSizeChange(value: number) {
    setPageSize(value);
    setPage(1);
  }

  return (
    <div className="flex flex-col gap-3">
      {searchable ? (
        <Input
          type="search"
          placeholder={searchPlaceholder}
          value={query}
          onChange={(event) => handleQueryChange(event.target.value)}
        />
      ) : null}

      {total === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>{headerCells}</TableRow>
            </TableHeader>
            <TableBody>{pageIndexes.map((index) => rowElements[index])}</TableBody>
          </Table>
          <Pagination
            page={currentPage}
            pageCount={pageCount}
            pageSize={pageSize}
            total={total}
            onPageChange={setPage}
            onPageSizeChange={handlePageSizeChange}
          />
        </>
      )}
    </div>
  );
}

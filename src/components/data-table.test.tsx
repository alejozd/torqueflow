import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { DataTable, type DataTableColumn } from "./data-table";

type Row = { id: string; name: string; amount: string };

const ROWS: Row[] = [{ id: "1", name: "Item A", amount: "$10" }];

function buildRows(count: number): Row[] {
  return Array.from({ length: count }, (_, i) => ({
    id: String(i + 1),
    name: `Item ${i + 1}`,
    amount: `$${i + 1}`,
  }));
}

describe("DataTable", () => {
  it("renders header and cell with no extra class when column.className is not set", () => {
    const columns: DataTableColumn<Row>[] = [
      { header: "Nombre", cell: (row) => row.name },
      { header: "Monto", cell: (row) => row.amount },
    ];
    render(<DataTable columns={columns} rows={ROWS} getRowKey={(row) => row.id} emptyMessage="Sin datos" />);

    const header = screen.getByRole("columnheader", { name: "Monto" });
    const cell = screen.getByRole("cell", { name: "$10" });
    // No column.className -- the header/cell must render with exactly the
    // base table styles baked into TableHead/TableCell, nothing extra. This
    // is the regression guard for the 17 existing DataTable consumers that
    // never set className.
    expect(header.className).toBe(
      "h-10 px-2 text-left align-middle font-medium whitespace-nowrap text-foreground [&:has([role=checkbox])]:pr-0",
    );
    expect(cell.className).toBe("p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0");
  });

  it("applies column.className to both the header and the cell", () => {
    const columns: DataTableColumn<Row>[] = [
      { header: "Nombre", cell: (row) => row.name },
      { header: "Monto", cell: (row) => row.amount, className: "text-right" },
    ];
    render(<DataTable columns={columns} rows={ROWS} getRowKey={(row) => row.id} emptyMessage="Sin datos" />);

    const header = screen.getByRole("columnheader", { name: "Monto" });
    const cell = screen.getByRole("cell", { name: "$10" });
    expect(header.className).toContain("text-right");
    expect(cell.className).toContain("text-right");
  });

  it("renders a ReactNode header (e.g. a <span>) instead of plain text", () => {
    const columns: DataTableColumn<Row>[] = [
      { header: "Nombre", cell: (row) => row.name },
      { header: <span data-testid="monto-header">Monto</span>, cell: (row) => row.amount },
    ];
    render(<DataTable columns={columns} rows={ROWS} getRowKey={(row) => row.id} emptyMessage="Sin datos" />);

    const header = screen.getByRole("columnheader", { name: "Monto" });
    expect(header.querySelector('[data-testid="monto-header"]')).not.toBeNull();
  });

  it("renders only pageSize rows (default 20) when there are more rows than that", () => {
    const columns: DataTableColumn<Row>[] = [{ header: "Nombre", cell: (row) => row.name }];
    render(
      <DataTable columns={columns} rows={buildRows(25)} getRowKey={(row) => row.id} emptyMessage="Sin datos" />,
    );

    // 1 header row + 20 data rows on the first page -- the other 5 rows must
    // not be in the DOM at all (this is real pagination, not CSS hiding).
    expect(screen.getAllByRole("row")).toHaveLength(21);
    expect(screen.getByRole("cell", { name: "Item 1" })).toBeInTheDocument();
    expect(screen.queryByRole("cell", { name: "Item 21" })).not.toBeInTheDocument();
  });

  it("honors a custom pageSize prop", () => {
    const columns: DataTableColumn<Row>[] = [{ header: "Nombre", cell: (row) => row.name }];
    render(
      <DataTable
        columns={columns}
        rows={buildRows(5)}
        getRowKey={(row) => row.id}
        emptyMessage="Sin datos"
        pageSize={2}
      />,
    );

    // 1 header row + 2 data rows -- the custom pageSize must be honored
    // instead of the default 20.
    expect(screen.getAllByRole("row")).toHaveLength(3);
    expect(screen.getByRole("cell", { name: "Item 1" })).toBeInTheDocument();
    expect(screen.queryByRole("cell", { name: "Item 3" })).not.toBeInTheDocument();
  });

  it("still produces a working rowHref stretched-link on a visible (first-page) row", () => {
    const columns: DataTableColumn<Row>[] = [{ header: "Nombre", cell: (row) => row.name }];
    render(
      <DataTable
        columns={columns}
        rows={ROWS}
        getRowKey={(row) => row.id}
        emptyMessage="Sin datos"
        rowHref={(row) => `/items/${row.id}`}
      />,
    );

    // The stretched-link mechanism: an <a> absolutely positioned (inset-0)
    // over the row, pointing at the row's detail URL. If the split ever
    // drops rowHref, loses the absolute/inset-0 positioning, or points the
    // link at the wrong row, this assertion fails.
    const link = screen.getByRole("link", { name: "Ver detalle" });
    expect(link).toHaveAttribute("href", "/items/1");
    expect(link.className).toContain("absolute");
    expect(link.className).toContain("inset-0");

    // The link must live inside the row it belongs to, not floating loose
    // elsewhere in the pre-rendered tree.
    const row = screen.getByRole("row", { name: /Item A/ });
    expect(row.contains(link)).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { DataTable, type DataTableColumn } from "./data-table";

type Row = { id: string; name: string; amount: string };

const ROWS: Row[] = [{ id: "1", name: "Item A", amount: "$10" }];

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
});

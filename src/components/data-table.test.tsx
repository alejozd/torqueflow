import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

  it("does not render a search input when searchable is omitted (default false), even if a column sets searchValue", () => {
    const columns: DataTableColumn<Row>[] = [
      { header: "Nombre", cell: (row) => row.name, searchValue: (row) => row.name },
    ];
    render(<DataTable columns={columns} rows={buildRows(3)} getRowKey={(row) => row.id} emptyMessage="Sin datos" />);

    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
  });

  it("filters rows down to only the matches when searchable is true and a column defines searchValue", async () => {
    const user = userEvent.setup();
    const columns: DataTableColumn<Row>[] = [
      { header: "Nombre", cell: (row) => row.name, searchValue: (row) => row.name },
    ];
    render(
      <DataTable
        columns={columns}
        rows={buildRows(3)}
        getRowKey={(row) => row.id}
        emptyMessage="Sin datos"
        searchable
      />,
    );

    await user.type(screen.getByRole("searchbox"), "Item 2");

    expect(screen.getByRole("cell", { name: "Item 2" })).toBeInTheDocument();
    expect(screen.queryByRole("cell", { name: "Item 1" })).not.toBeInTheDocument();
    expect(screen.queryByRole("cell", { name: "Item 3" })).not.toBeInTheDocument();
  });

  it("shows the empty message instead of the table when the search query matches no row", async () => {
    const user = userEvent.setup();
    const columns: DataTableColumn<Row>[] = [
      { header: "Nombre", cell: (row) => row.name, searchValue: (row) => row.name },
    ];
    render(
      <DataTable
        columns={columns}
        rows={buildRows(3)}
        getRowKey={(row) => row.id}
        emptyMessage="Sin datos"
        searchable
      />,
    );

    await user.type(screen.getByRole("searchbox"), "no existe ningun item asi");

    expect(screen.getByText("Sin datos")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("changing the page-size selector re-slices rows, updates the counter, and resets to page 1", async () => {
    const user = userEvent.setup();
    const columns: DataTableColumn<Row>[] = [{ header: "Nombre", cell: (row) => row.name }];
    render(
      <DataTable columns={columns} rows={buildRows(25)} getRowKey={(row) => row.id} emptyMessage="Sin datos" />,
    );

    // Default pageSize is 20 -- move to page 2 first so we can verify the
    // pageSize change resets back to page 1.
    await user.click(screen.getByRole("button", { name: "Página siguiente" }));
    expect(screen.getByRole("cell", { name: "Item 21" })).toBeInTheDocument();

    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "10 por página" }));

    // 1 header row + 10 data rows -- back on page 1 with the new pageSize.
    expect(screen.getAllByRole("row")).toHaveLength(11);
    expect(screen.getByRole("cell", { name: "Item 1" })).toBeInTheDocument();
    expect(screen.queryByRole("cell", { name: "Item 11" })).not.toBeInTheDocument();
    expect(screen.getByText("Mostrando 1-10 de 25 registros")).toBeInTheDocument();
  });

  it("applies the searchPlaceholder prop to the search input", () => {
    const columns: DataTableColumn<Row>[] = [
      { header: "Nombre", cell: (row) => row.name, searchValue: (row) => row.name },
    ];
    render(
      <DataTable
        columns={columns}
        rows={buildRows(3)}
        getRowKey={(row) => row.id}
        emptyMessage="Sin datos"
        searchable
        searchPlaceholder="Buscar cliente..."
      />,
    );

    expect(screen.getByPlaceholderText("Buscar cliente...")).toBeInTheDocument();
  });
});

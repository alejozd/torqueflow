import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { DataTableSkeleton } from "./data-table-skeleton";

describe("DataTableSkeleton", () => {
  it("renders exactly 5 columnheader roles and 40 cell roles with default rows=8", () => {
    render(<DataTableSkeleton columns={5} />);

    const headers = screen.getAllByRole("columnheader");
    const cells = screen.getAllByRole("cell");

    expect(headers).toHaveLength(5);
    expect(cells).toHaveLength(40); // 5 columns * 8 rows
  });

  it("renders exactly 5 columnheader roles and 15 cell roles with rows=3", () => {
    render(<DataTableSkeleton columns={5} rows={3} />);

    const headers = screen.getAllByRole("columnheader");
    const cells = screen.getAllByRole("cell");

    expect(headers).toHaveLength(5);
    expect(cells).toHaveLength(15); // 5 columns * 3 rows
  });

  it("renders a single columnheader with a single row", () => {
    render(<DataTableSkeleton columns={1} rows={1} />);

    const headers = screen.getAllByRole("columnheader");
    const cells = screen.getAllByRole("cell");

    expect(headers).toHaveLength(1);
    expect(cells).toHaveLength(1);
  });

  it("renders 10 columnheaders and 20 cells with columns=10 and rows=2", () => {
    render(<DataTableSkeleton columns={10} rows={2} />);

    const headers = screen.getAllByRole("columnheader");
    const cells = screen.getAllByRole("cell");

    expect(headers).toHaveLength(10);
    expect(cells).toHaveLength(20);
  });
});

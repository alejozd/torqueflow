import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Pagination } from "./pagination";

describe("Pagination", () => {
  it('renders "Mostrando X-Y de Z registros" for a middle page', () => {
    render(<Pagination page={2} pageCount={5} pageSize={10} total={45} onPageChange={vi.fn()} />);
    expect(screen.getByText("Mostrando 11-20 de 45 registros")).toBeInTheDocument();
  });

  it('renders "Mostrando 0 de 0 registros" when there are no rows', () => {
    render(<Pagination page={1} pageCount={1} pageSize={10} total={0} onPageChange={vi.fn()} />);
    expect(screen.getByText("Mostrando 0 de 0 registros")).toBeInTheDocument();
  });

  it("clamps the end of the range to the total on the last page", () => {
    render(<Pagination page={3} pageCount={3} pageSize={10} total={25} onPageChange={vi.fn()} />);
    expect(screen.getByText("Mostrando 21-25 de 25 registros")).toBeInTheDocument();
  });

  it("disables the Prev button on the first page", () => {
    render(<Pagination page={1} pageCount={3} pageSize={10} total={30} onPageChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Página anterior" })).toBeDisabled();
  });

  it("disables the Next button on the last page", () => {
    render(<Pagination page={3} pageCount={3} pageSize={10} total={30} onPageChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Página siguiente" })).toBeDisabled();
  });

  it("calls onPageChange with page - 1 when Prev is clicked", async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(<Pagination page={2} pageCount={3} pageSize={10} total={30} onPageChange={onPageChange} />);
    await user.click(screen.getByRole("button", { name: "Página anterior" }));
    expect(onPageChange).toHaveBeenCalledWith(1);
  });

  it("calls onPageChange with page + 1 when Next is clicked", async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(<Pagination page={2} pageCount={3} pageSize={10} total={30} onPageChange={onPageChange} />);
    await user.click(screen.getByRole("button", { name: "Página siguiente" }));
    expect(onPageChange).toHaveBeenCalledWith(3);
  });

  it("hides Prev/Next but keeps the count line when pageCount <= 1", () => {
    render(<Pagination page={1} pageCount={1} pageSize={10} total={5} onPageChange={vi.fn()} />);
    expect(screen.getByText("Mostrando 1-5 de 5 registros")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Página anterior" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Página siguiente" })).not.toBeInTheDocument();
  });

  it("does not render the page-size selector when onPageSizeChange is omitted", () => {
    render(<Pagination page={1} pageCount={3} pageSize={10} total={30} onPageChange={vi.fn()} />);
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("renders the page-size selector when onPageSizeChange is provided, with a label per option", async () => {
    const user = userEvent.setup();
    render(
      <Pagination
        page={1}
        pageCount={3}
        pageSize={10}
        total={30}
        onPageChange={vi.fn()}
        onPageSizeChange={vi.fn()}
      />,
    );
    const trigger = screen.getByRole("combobox");
    expect(screen.getByText("10 por página")).toBeInTheDocument();
    await user.click(trigger);
    expect(await screen.findByRole("option", { name: "20 por página" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "50 por página" })).toBeInTheDocument();
  });

  it("calls onPageSizeChange with the numeric page size when a new option is selected", async () => {
    const user = userEvent.setup();
    const onPageSizeChange = vi.fn();
    render(
      <Pagination
        page={1}
        pageCount={3}
        pageSize={10}
        total={30}
        onPageChange={vi.fn()}
        onPageSizeChange={onPageSizeChange}
      />,
    );
    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "20 por página" }));
    expect(onPageSizeChange).toHaveBeenCalledWith(20);
  });

  it("still renders the page-size selector regardless of pageCount", () => {
    render(
      <Pagination
        page={1}
        pageCount={1}
        pageSize={10}
        total={5}
        onPageChange={vi.fn()}
        onPageSizeChange={vi.fn()}
      />,
    );
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });
});

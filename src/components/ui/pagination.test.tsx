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

  it("does not render First/Last buttons when pageCount <= 5", () => {
    render(<Pagination page={1} pageCount={5} pageSize={10} total={50} onPageChange={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Primera página" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Última página" })).not.toBeInTheDocument();
  });

  it("renders First/Last buttons when pageCount > 5, disabled at the corresponding boundary", () => {
    const { rerender } = render(
      <Pagination page={1} pageCount={6} pageSize={10} total={60} onPageChange={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: "Primera página" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Última página" })).not.toBeDisabled();

    rerender(<Pagination page={6} pageCount={6} pageSize={10} total={60} onPageChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Primera página" })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "Última página" })).toBeDisabled();
  });

  it("calls onPageChange(pageCount) when Última is clicked", async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(<Pagination page={2} pageCount={6} pageSize={10} total={60} onPageChange={onPageChange} />);
    await user.click(screen.getByRole("button", { name: "Última página" }));
    expect(onPageChange).toHaveBeenCalledWith(6);
  });

  it("calls onPageChange(1) when Primera is clicked", async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(<Pagination page={4} pageCount={6} pageSize={10} total={60} onPageChange={onPageChange} />);
    await user.click(screen.getByRole("button", { name: "Primera página" }));
    expect(onPageChange).toHaveBeenCalledWith(1);
  });

  it("includes 100 in the default pageSizeOptions", async () => {
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
    await user.click(screen.getByRole("combobox"));
    expect(await screen.findByRole("option", { name: "100 por página" })).toBeInTheDocument();
  });

  it("renders the count label with legible text styling instead of muted", () => {
    render(<Pagination page={1} pageCount={1} pageSize={10} total={5} onPageChange={vi.fn()} />);
    const label = screen.getByText("Mostrando 1-5 de 5 registros");
    expect(label.className).toContain("text-foreground");
    expect(label.className).toContain("font-medium");
    expect(label.className).not.toContain("text-muted-foreground");
  });

  describe("numbered page buttons", () => {
    it("renders every page with no ellipsis when pageCount is 3 (<= 5)", () => {
      render(<Pagination page={2} pageCount={3} pageSize={10} total={30} onPageChange={vi.fn()} />);
      expect(screen.getByRole("button", { name: "Página 1" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Página 2" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Página 3" })).toBeInTheDocument();
      expect(screen.queryByText("…")).not.toBeInTheDocument();
    });

    it("windows around the current page with ellipsis on both sides (pageCount=10, page=5)", () => {
      render(<Pagination page={5} pageCount={10} pageSize={10} total={100} onPageChange={vi.fn()} />);
      expect(screen.getByRole("button", { name: "Página 1" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Página 4" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Página 5" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Página 6" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Página 10" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Página 2" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Página 9" })).not.toBeInTheDocument();
      expect(screen.getAllByText("…")).toHaveLength(2);
    });

    it("collapses only the trailing gap with a single ellipsis when on page 1 (pageCount=10, page=1)", () => {
      render(<Pagination page={1} pageCount={10} pageSize={10} total={100} onPageChange={vi.fn()} />);
      expect(screen.getByRole("button", { name: "Página 1" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Página 2" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Página 10" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Página 3" })).not.toBeInTheDocument();
      expect(screen.getAllByText("…")).toHaveLength(1);
    });

    it("collapses only the leading gap with a single ellipsis when on the last page (pageCount=10, page=10)", () => {
      render(<Pagination page={10} pageCount={10} pageSize={10} total={100} onPageChange={vi.fn()} />);
      expect(screen.getByRole("button", { name: "Página 1" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Página 9" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Página 10" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Página 8" })).not.toBeInTheDocument();
      expect(screen.getAllByText("…")).toHaveLength(1);
    });

    it("marks the active page's button with aria-current=page and no others", () => {
      render(<Pagination page={5} pageCount={10} pageSize={10} total={100} onPageChange={vi.fn()} />);
      expect(screen.getByRole("button", { name: "Página 5" })).toHaveAttribute("aria-current", "page");
      expect(screen.getByRole("button", { name: "Página 1" })).not.toHaveAttribute("aria-current");
      expect(screen.getByRole("button", { name: "Página 4" })).not.toHaveAttribute("aria-current");
      expect(screen.getByRole("button", { name: "Página 6" })).not.toHaveAttribute("aria-current");
      expect(screen.getByRole("button", { name: "Página 10" })).not.toHaveAttribute("aria-current");
    });

    it("calls onPageChange(n) when a numbered page button is clicked", async () => {
      const user = userEvent.setup();
      const onPageChange = vi.fn();
      render(<Pagination page={5} pageCount={10} pageSize={10} total={100} onPageChange={onPageChange} />);
      await user.click(screen.getByRole("button", { name: "Página 6" }));
      expect(onPageChange).toHaveBeenCalledWith(6);
    });

    it("does not render numbered page buttons when pageCount <= 1", () => {
      render(<Pagination page={1} pageCount={1} pageSize={10} total={5} onPageChange={vi.fn()} />);
      expect(screen.queryByRole("button", { name: "Página 1" })).not.toBeInTheDocument();
    });
  });
});

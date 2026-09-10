import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FocusTrap } from "@/components/a11y/FocusTrap";

describe("FocusTrap", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("focuses the first control, wraps Tab, and restores the invoker", async () => {
    vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue({ length: 1, item: () => null } as unknown as DOMRectList);
    const opener = document.createElement("button");
    opener.textContent = "Open dialog";
    document.body.appendChild(opener);
    opener.focus();

    const view = render(
      <FocusTrap>
        <button type="button">First action</button>
        <button type="button">Last action</button>
      </FocusTrap>,
    );

    const first = screen.getByRole("button", { name: "First action" });
    const last = screen.getByRole("button", { name: "Last action" });
    await waitFor(() => expect(first).toHaveFocus());

    last.focus();
    fireEvent.keyDown(last, { key: "Tab" });
    expect(first).toHaveFocus();

    view.unmount();
    expect(opener).toHaveFocus();
    opener.remove();
  });

  it("moves focus into controls that appear after an async render", async () => {
    vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue({ length: 1, item: () => null } as unknown as DOMRectList);
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();

    const view = render(<FocusTrap><div data-testid="async-content" /></FocusTrap>);
    const asyncContent = screen.getByTestId("async-content");
    const first = document.createElement("button");
    first.textContent = "Loaded action";
    asyncContent.appendChild(first);

    await waitFor(() => expect(first).toHaveFocus());

    view.unmount();
    expect(opener).toHaveFocus();
    opener.remove();
  });
});

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SettingsApp } from "./settings-app";

vi.mock("../shared/shortcuts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../shared/shortcuts")>();
  return { ...actual, ShortcutEditor: () => <div>shortcut editor</div> };
});

describe("SettingsApp", () => {
  it("keeps only exit and undo controls fixed, shown without editable fields", () => {
    render(<SettingsApp />);
    expect(screen.getByRole("heading", { name: "Shortcuts & gestures" })).toBeInTheDocument();
    expect(screen.getByText("shortcut editor")).toBeInTheDocument();

    const fixed = screen.getByRole("group", { name: "Fixed" });
    const rows = Array.from(fixed.querySelectorAll("[data-row]")).map((row) => row.textContent);
    expect(rows).toEqual(["Undo⌘Z", "Redo⇧⌘Z", "Finish drawingEsc"]);
    expect(within(fixed).queryByRole("button")).not.toBeInTheDocument();
    expect(within(fixed).queryByText("Move a mark")).not.toBeInTheDocument();
    expect(within(fixed).queryByText("Choose color")).not.toBeInTheDocument();
    expect(within(fixed).queryByText("Adjust tool size")).not.toBeInTheDocument();
  });

  it("keeps ink color swatches out of the settings chrome", () => {
    const { container } = render(<SettingsApp />);
    for (const hex of ["#FFD400", "#FF7A00", "#FF2D95", "#2ED573", "#00AEEF"]) {
      expect(container.innerHTML).not.toContain(hex);
    }
  });
});

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SettingsApp } from "./settings-app";

vi.mock("../shared/shortcuts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../shared/shortcuts")>();
  return { ...actual, ShortcutEditor: () => <div>shortcut editor</div> };
});

describe("SettingsApp", () => {
  it("separates customizable shortcuts from fixed gestures without editable controls", () => {
    render(<SettingsApp />);
    expect(screen.getByRole("heading", { name: "Shortcuts & gestures" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Customizable shortcuts" })).toBeInTheDocument();
    expect(screen.getByText("shortcut editor")).toBeInTheDocument();

    const fixedHeading = screen.getByRole("heading", { name: "Fixed controls" });
    const fixedSection = fixedHeading.closest("section")!;
    expect(within(fixedSection).getByText("Move a mark")).toBeInTheDocument();
    expect(within(fixedSection).getByText("Delete one mark")).toBeInTheDocument();
    expect(screen.getByText("Undo")).toBeInTheDocument();
    expect(screen.getByText("Redo")).toBeInTheDocument();
    expect(screen.getByText("Delete marks continuously")).toBeInTheDocument();
    expect(screen.getByText("Adjust tool size")).toBeInTheDocument();
    expect(screen.getByText("Finish drawing")).toBeInTheDocument();
    expect(within(fixedSection).queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByText("Fixed")).not.toBeInTheDocument();
  });

  it("lists color switching as a fixed reference row with its shortcut and no swatches", () => {
    render(<SettingsApp />);
    const fixedSection = screen
      .getByRole("heading", { name: "Fixed controls" })
      .closest("section")!;
    const colorRow = within(fixedSection).getByText("Change color").closest("div")!;
    expect(within(colorRow).getByText("⌘")).toBeInTheDocument();
    expect(within(colorRow).getByText("1–5")).toBeInTheDocument();
    // 잉크 5색 견본을 크롬에 두지 않는다 — 시각 언어 계약.
    const inkColors = ["#FFD400", "#FF7A00", "#FF2D95", "#2ED573", "#00AEEF"];
    for (const hex of inkColors) {
      expect(colorRow.innerHTML).not.toContain(hex);
    }
  });
});

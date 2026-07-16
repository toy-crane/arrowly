import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SettingsApp } from "./settings-app";

vi.mock("../shared/shortcuts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../shared/shortcuts")>();
  return { ...actual, ShortcutEditor: () => <div>shortcut editor</div> };
});

describe("SettingsApp", () => {
  it("shows text resizing as fixed shortcuts alongside undo and exit", () => {
    render(<SettingsApp />);
    expect(screen.getByText("shortcut editor")).toBeInTheDocument();
    expect(screen.getByText("Undo")).toBeInTheDocument();
    expect(screen.getByText("Text larger")).toBeInTheDocument();
    expect(screen.getByText("Text smaller")).toBeInTheDocument();
    expect(screen.getByText("Exit")).toBeInTheDocument();
    expect(screen.getAllByText("Fixed")).toHaveLength(4);
  });
});

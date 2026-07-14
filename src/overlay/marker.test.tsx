import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Marker } from "./marker";

const settings = vi.hoisted(() => ({
  loadMarkerPos: vi.fn(),
  saveMarkerPos: vi.fn(),
}));

vi.mock("../shared/settings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../shared/settings")>();
  return { ...actual, loadMarkerPos: settings.loadMarkerPos, saveMarkerPos: settings.saveMarkerPos };
});

describe("Marker", () => {
  beforeEach(() => {
    settings.loadMarkerPos.mockReset().mockResolvedValue({ xRatio: 0.2, yRatio: 0.2 });
    settings.saveMarkerPos.mockReset().mockResolvedValue(undefined);
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1000 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
  });

  it("loads position and operates color, width, board, outside-close and popover clamp controls", async () => {
    const user = userEvent.setup();
    const onColorChange = vi.fn();
    const onWidthChange = vi.fn();
    const onBoardToggle = vi.fn();
    const onTextToggle = vi.fn();
    let popoverSide: "left" | "right" = "left";
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this.style.position === "absolute") {
        return {
          left: popoverSide === "left" ? -10 : 900,
          right: popoverSide === "left" ? 200 : 1020,
          top: 0,
          bottom: 44,
          width: 210,
          height: 44,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        };
      }
      return { left: 200, top: 160, right: 370, bottom: 204, width: 170, height: 44, x: 200, y: 160, toJSON: () => ({}) };
    });

    render(
      <Marker
        color="#FF2D95"
        widthKey="medium"
        board={false}
        textMode={false}
        onColorChange={onColorChange}
        onWidthChange={onWidthChange}
        onBoardToggle={onBoardToggle}
        onTextToggle={onTextToggle}
      />,
    );
    await waitFor(() => expect(settings.loadMarkerPos).toHaveBeenCalledOnce());

    const color = screen.getByRole("button", { name: "Change color" });
    await user.click(color);
    expect(screen.getByRole("button", { name: "Color #FFD400" }).parentElement).toHaveStyle({ transform: "translateX(calc(-50% + 16px))" });
    await user.click(color);
    expect(screen.queryByRole("button", { name: "Color #FFD400" })).not.toBeInTheDocument();

    await user.click(color);
    await user.click(screen.getByRole("button", { name: "Color #00AEEF" }));
    expect(onColorChange).toHaveBeenCalledWith("#00AEEF");

    popoverSide = "right";
    const width = screen.getByRole("button", { name: "Change thickness" });
    await user.click(width);
    expect(screen.getByRole("button", { name: "Thickness xthin" }).parentElement).toHaveStyle({ transform: "translateX(calc(-50% + -26px))" });
    await user.click(screen.getByRole("button", { name: "Thickness thick" }));
    expect(onWidthChange).toHaveBeenCalledWith("thick");

    await user.click(width);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("button", { name: "Thickness xthin" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Toggle blackboard" }));
    expect(onBoardToggle).toHaveBeenCalledOnce();

    // T 셀: 팝오버를 접으며 토글한다
    await user.click(color);
    await user.click(screen.getByRole("button", { name: "Type text" }));
    expect(onTextToggle).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: "Color #FFD400" })).not.toBeInTheDocument();
  });

  it("highlights the text cell with the shared mode-on style", () => {
    const props = {
      color: "#FF2D95" as const,
      widthKey: "medium" as const,
      board: false,
      onColorChange: vi.fn(),
      onWidthChange: vi.fn(),
      onBoardToggle: vi.fn(),
      onTextToggle: vi.fn(),
    };
    const { rerender } = render(<Marker {...props} textMode={false} />);
    const cell = screen.getByRole("button", { name: "Type text" });
    expect(cell.style.background).toBe("none");

    rerender(<Marker {...props} textMode={true} />);
    expect(cell.style.background).toBe("rgba(255, 255, 255, 0.16)");
  });

  it("distinguishes taps from drags, clamps both edges, saves ratios and restores session position", async () => {
    const rect = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      left: 100,
      top: 100,
      right: 270,
      bottom: 144,
      width: 170,
      height: 44,
      x: 100,
      y: 100,
      toJSON: () => ({}),
    });
    Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, get: () => 170 });
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", { configurable: true, get: () => 44 });

    const props = {
      color: "#FFD400" as const,
      widthKey: "xthin" as const,
      board: true,
      textMode: false,
      onColorChange: vi.fn(),
      onWidthChange: vi.fn(),
      onBoardToggle: vi.fn(),
      onTextToggle: vi.fn(),
    };
    const { container, rerender } = render(<Marker {...props} />);
    const root = container.firstElementChild as HTMLElement;

    fireEvent.pointerUp(root, { pointerId: 1 });
    fireEvent.pointerDown(root, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(root, { clientX: 102, clientY: 102, pointerId: 1 });
    fireEvent.pointerUp(root, { clientX: 102, clientY: 102, pointerId: 1 });
    expect(settings.saveMarkerPos).not.toHaveBeenCalled();

    fireEvent.pointerDown(root, { clientX: 100, clientY: 100, pointerId: 2 });
    fireEvent.pointerMove(root, { clientX: -500, clientY: -500, pointerId: 2 });
    rect.mockReturnValue({ left: 6, top: 6, right: 176, bottom: 50, width: 170, height: 44, x: 6, y: 6, toJSON: () => ({}) });
    fireEvent.pointerUp(root, { pointerId: 2 });
    await waitFor(() => expect(settings.saveMarkerPos).toHaveBeenCalledWith({ xRatio: 0.006, yRatio: 0.0075 }));

    rect.mockReturnValue({ left: 100, top: 100, right: 270, bottom: 144, width: 170, height: 44, x: 100, y: 100, toJSON: () => ({}) });
    fireEvent.pointerDown(root, { clientX: 100, clientY: 100, pointerId: 3 });
    fireEvent.pointerMove(root, { clientX: 2000, clientY: 2000, pointerId: 3 });
    fireEvent.pointerCancel(root, { pointerId: 3 });

    rerender(<Marker {...props} />);
    expect(root.style.left).not.toBe("");
  });
});

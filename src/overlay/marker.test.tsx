import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

  it("keeps the approved dock geometry while its tool icons reflect current properties", () => {
    const props = {
      color: "#FF2D95" as const,
      widthKey: "medium" as const,
      textSizeKey: "medium" as const,
      board: false,
      tool: "freehand" as const,
      drawingTool: "freehand" as const,
      onColorChange: vi.fn(),
      onWidthChange: vi.fn(),
      onTextSizeChange: vi.fn(),
      onBoardToggle: vi.fn(),
      onToolChange: vi.fn(),
    };
    const { container, rerender } = render(<Marker {...props} />);
    const marker = container.querySelector<HTMLElement>("[data-arrowly-marker]")!;
    const freehand = screen.getByRole("button", { name: "Drawing tool" });
    const text = screen.getByRole("button", { name: "Text tool" });
    const deletion = screen.getByRole("button", { name: "Mark deletion tool" });
    const sweep = freehand.querySelector("svg")!;

    expect(marker).toHaveStyle({ width: "209px", height: "44px" });
    expect(freehand).toHaveStyle({ marginRight: "4px", color: "#FF2D95" });
    expect(sweep).toHaveAttribute("stroke", "currentColor");
    expect(sweep).toHaveAttribute("stroke-width", "3.2");
    expect(sweep.querySelector("path")).toHaveAttribute(
      "d",
      "M3 15.8c3.2-7.4 6.3-7.5 8.2-3.2 2.1 4.8 6 3.7 9.8-2.5",
    );
    expect(text.querySelector("span")).toHaveStyle({ fontSize: "19px" });
    expect(deletion).toHaveAttribute("aria-pressed", "false");

    rerender(
      <Marker
        {...props}
        color="#00AEEF"
        widthKey="xthick"
        textSizeKey="xlarge"
      />,
    );
    expect(freehand).toHaveStyle({ color: "#00AEEF" });
    expect(sweep).toHaveAttribute("stroke-width", "5.6");
    expect(text.querySelector("span")).toHaveStyle({ fontSize: "24px" });
  });

  it("switches an inactive tool without opening properties and toggles properties from the active tool", async () => {
    const user = userEvent.setup();
    const onToolChange = vi.fn();
    const props = {
      color: "#FF2D95" as const,
      widthKey: "medium" as const,
      textSizeKey: "medium" as const,
      board: false,
      drawingTool: "freehand" as const,
      onColorChange: vi.fn(),
      onWidthChange: vi.fn(),
      onTextSizeChange: vi.fn(),
      onBoardToggle: vi.fn(),
      onToolChange,
    };
    const { rerender } = render(<Marker {...props} tool="freehand" />);

    const freehand = screen.getByRole("button", { name: "Drawing tool" });
    const text = screen.getByRole("button", { name: "Text tool" });
    expect(freehand).toHaveAttribute("aria-pressed", "true");
    expect(text).toHaveAttribute("aria-pressed", "false");

    await user.click(freehand);
    const penInspector = screen.getByRole("group", { name: "Drawing properties" });
    const colorRow = screen.getByRole("group", { name: "Color" });
    const widthRow = screen.getByRole("group", { name: "Thickness" });
    expect(penInspector).toHaveStyle({ width: "max-content", padding: "8px", gap: "4px" });
    expect(penInspector.style.minWidth).toBe("");
    expect(colorRow).toHaveStyle({ minHeight: "32px", display: "block" });
    expect(widthRow).toHaveStyle({ minHeight: "32px", display: "block" });
    expect(colorRow.firstElementChild).toHaveStyle({ gap: "4px" });
    expect(screen.queryByText("Color")).not.toBeInTheDocument();
    expect(screen.queryByText("Thickness")).not.toBeInTheDocument();

    await user.click(freehand);
    expect(screen.queryByRole("group", { name: "Drawing properties" })).not.toBeInTheDocument();

    await user.click(text);
    expect(onToolChange).toHaveBeenCalledWith("text");
    expect(screen.queryByRole("group", { name: "Text properties" })).not.toBeInTheDocument();

    rerender(<Marker {...props} tool="text" />);
    await user.click(text);
    expect(screen.getByRole("group", { name: "Text properties" })).toBeInTheDocument();
  });

  it("keeps a selected geometric tool fixed and reflects its current ink width", async () => {
    const user = userEvent.setup();
    const onToolChange = vi.fn();
    const props = {
      color: "#FF2D95" as const,
      widthKey: "medium" as const,
      textSizeKey: "medium" as const,
      board: false,
      tool: "freehand" as const,
      drawingTool: "freehand" as const,
      onColorChange: vi.fn(),
      onWidthChange: vi.fn(),
      onTextSizeChange: vi.fn(),
      onBoardToggle: vi.fn(),
      onToolChange,
    };
    const { rerender } = render(<Marker {...props} />);

    await user.click(screen.getByRole("button", { name: "Drawing tool" }));
    expect(screen.getByRole("group", { name: "Drawing tools" })).toBeInTheDocument();
    expect(within(screen.getByRole("group", { name: "Drawing tools" })).getAllByRole("button"))
      .toHaveLength(5);

    await user.click(screen.getByRole("button", { name: "Triangle tool" }));
    expect(onToolChange).toHaveBeenCalledWith("triangle");
    expect(screen.queryByRole("group", { name: "Drawing properties" })).not.toBeInTheDocument();

    rerender(<Marker {...props} tool="triangle" drawingTool="triangle" />);
    onToolChange.mockClear();
    const freehand = screen.getByRole("button", { name: "Drawing tool" });
    expect(freehand).toHaveAttribute("aria-pressed", "true");
    expect(freehand.querySelector("svg")).toHaveAttribute("data-drawing-tool-icon", "triangle");
    expect(freehand.querySelector("svg")).toHaveAttribute("stroke-width", "3.2");

    await user.click(freehand);
    expect(screen.getByRole("group", { name: "Drawing properties" })).toBeInTheDocument();
    expect(onToolChange).not.toHaveBeenCalled();
  });

  it("shows and restores the remembered geometric tool while text is active", async () => {
    const user = userEvent.setup();
    const onToolChange = vi.fn();
    render(
      <Marker
        color="#FF2D95"
        widthKey="medium"
        textSizeKey="medium"
        board={false}
        tool="text"
        drawingTool="triangle"
        onColorChange={vi.fn()}
        onWidthChange={vi.fn()}
        onTextSizeChange={vi.fn()}
        onBoardToggle={vi.fn()}
        onToolChange={onToolChange}
      />,
    );

    const drawingButton = screen.getByRole("button", { name: "Drawing tool" });
    expect(drawingButton).toHaveAttribute("aria-pressed", "false");
    expect(drawingButton.querySelector("svg")).toHaveAttribute(
      "data-drawing-tool-icon",
      "triangle",
    );

    await user.click(drawingButton);
    expect(onToolChange).toHaveBeenCalledWith("triangle");
  });

  it("orders drawing choices by usage and returns to freehand from the first choice", async () => {
    const user = userEvent.setup();
    const onToolChange = vi.fn();
    render(
      <Marker
        color="#FF2D95"
        widthKey="medium"
        textSizeKey="medium"
        board={false}
        tool="freehand"
        drawingTool="freehand"
        onColorChange={vi.fn()}
        onWidthChange={vi.fn()}
        onTextSizeChange={vi.fn()}
        onBoardToggle={vi.fn()}
        onToolChange={onToolChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Drawing tool" }));
    const choices = within(screen.getByRole("group", { name: "Drawing tools" })).getAllByRole(
      "button",
    );

    expect(choices.map((button) => button.getAttribute("aria-label"))).toEqual([
      "Freehand tool",
      "Arrow tool",
      "Rectangle tool",
      "Ellipse tool",
      "Triangle tool",
    ]);

    await user.click(choices[0]);
    expect(onToolChange).toHaveBeenCalledWith("freehand");
    expect(screen.queryByRole("group", { name: "Drawing properties" })).not.toBeInTheDocument();
  });

  it("shows every drawing choice icon in neutral white", async () => {
    const user = userEvent.setup();
    render(
      <Marker
        color="#FF2D95"
        widthKey="medium"
        textSizeKey="medium"
        board={false}
        tool="freehand"
        drawingTool="freehand"
        onColorChange={vi.fn()}
        onWidthChange={vi.fn()}
        onTextSizeChange={vi.fn()}
        onBoardToggle={vi.fn()}
        onToolChange={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Drawing tool" }));
    const drawingChoiceButtons = within(
      screen.getByRole("group", { name: "Drawing tools" }),
    ).getAllByRole("button");

    expect(drawingChoiceButtons).toHaveLength(5);
    for (const button of drawingChoiceButtons) {
      expect(button.style.color).toBe("rgb(232, 234, 240)");
      expect(button.querySelector("svg")).toHaveAttribute("stroke", "currentColor");
      expect(button.querySelector("svg")).toHaveAttribute("stroke-width", "1.8");
    }
  });

  it("closes open properties when a keyboard tool change updates the active tool", async () => {
    const user = userEvent.setup();
    const props = {
      color: "#FF2D95" as const,
      widthKey: "medium" as const,
      textSizeKey: "medium" as const,
      board: false,
      drawingTool: "freehand" as const,
      onColorChange: vi.fn(),
      onWidthChange: vi.fn(),
      onTextSizeChange: vi.fn(),
      onBoardToggle: vi.fn(),
      onToolChange: vi.fn(),
    };
    const { rerender } = render(<Marker {...props} tool="text" />);

    await user.click(screen.getByRole("button", { name: "Text tool" }));
    expect(screen.getByRole("group", { name: "Text properties" })).toBeInTheDocument();

    rerender(<Marker {...props} tool="freehand" />);
    expect(screen.queryByRole("group", { name: "Text properties" })).not.toBeInTheDocument();
  });

  it("clamps the property panel while its arrow stays anchored to the active tool", async () => {
    const user = userEvent.setup();
    let side: "left" | "right" = "right";
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const rootLeft = side === "right" ? 164 : 6;
      if (this.hasAttribute("data-arrowly-marker")) {
        return rect(rootLeft, 160, 209, 44);
      }
      if (this.getAttribute("aria-label") === "Drawing tool") {
        return rect(rootLeft + 8, 166, 42, 32);
      }
      if (this.getAttribute("aria-label") === "Text tool") {
        return rect(rootLeft + 50, 166, 42, 32);
      }
      if (this.getAttribute("role") === "group") {
        return rect(0, 104, 306, 76);
      }
      return rect(0, 0, 0, 0);
    });
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 320 });
    const props = {
      color: "#FF2D95" as const,
      widthKey: "medium" as const,
      textSizeKey: "medium" as const,
      board: false,
      drawingTool: "freehand" as const,
      onColorChange: vi.fn(),
      onWidthChange: vi.fn(),
      onTextSizeChange: vi.fn(),
      onBoardToggle: vi.fn(),
      onToolChange: vi.fn(),
    };
    const { rerender } = render(<Marker {...props} tool="text" />);

    await user.click(screen.getByRole("button", { name: "Text tool" }));
    let panel = screen.getByRole("group", { name: "Text properties" });
    let arrow = panel.querySelector<HTMLElement>("[data-arrowly-inspector-arrow]");
    expect(panel).toHaveStyle({ left: "-156px", transform: "none" });
    expect(arrow).toHaveStyle({ left: "222.5px" });

    Object.defineProperty(window, "innerWidth", { configurable: true, value: 400 });
    fireEvent(window, new Event("resize"));
    await waitFor(() => expect(panel).toHaveStyle({ left: "-82px" }));
    expect(arrow).toHaveStyle({ left: "148.5px" });

    side = "left";
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 320 });
    rerender(<Marker {...props} tool="freehand" />);
    await user.click(screen.getByRole("button", { name: "Drawing tool" }));
    panel = screen.getByRole("group", { name: "Drawing properties" });
    arrow = panel.querySelector<HTMLElement>("[data-arrowly-inspector-arrow]");
    expect(panel).toHaveStyle({ left: "0px", transform: "none" });
    expect(arrow).toHaveStyle({ left: "24.5px" });
  });

  it("opens the three-row pen panel below when its measured height would cross the top edge", async () => {
    const user = userEvent.setup();
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this.hasAttribute("data-arrowly-marker")) return rect(100, 80, 209, 44);
      if (this.getAttribute("aria-label") === "Drawing tool") return rect(108, 86, 42, 32);
      if (this.getAttribute("role") === "group") return rect(0, -14, 306, 86);
      return rect(0, 0, 0, 0);
    });

    render(
      <Marker
        color="#FF2D95"
        widthKey="medium"
        textSizeKey="medium"
        board={false}
        tool="freehand"
        drawingTool="freehand"
        onColorChange={vi.fn()}
        onWidthChange={vi.fn()}
        onTextSizeChange={vi.fn()}
        onBoardToggle={vi.fn()}
        onToolChange={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Drawing tool" }));

    const panel = screen.getByRole("group", { name: "Drawing properties" });
    const arrow = panel.querySelector<HTMLElement>("[data-arrowly-inspector-arrow]");
    expect(panel).toHaveStyle({ top: "calc(100% + 8px)" });
    expect(arrow).toHaveStyle({ top: "-5px" });
  });

  it("applies pen properties and closes them on selection, outside press and blackboard toggle", async () => {
    const user = userEvent.setup();
    const onColorChange = vi.fn();
    const onWidthChange = vi.fn();
    const onTextSizeChange = vi.fn();
    const onBoardToggle = vi.fn();
    const onToolChange = vi.fn();

    render(
      <Marker
        color="#FF2D95"
        widthKey="medium"
        textSizeKey="medium"
        board={false}
        tool="freehand"
        drawingTool="freehand"
        onColorChange={onColorChange}
        onWidthChange={onWidthChange}
        onTextSizeChange={onTextSizeChange}
        onBoardToggle={onBoardToggle}
        onToolChange={onToolChange}
      />,
    );

    const freehand = screen.getByRole("button", { name: "Drawing tool" });
    expect(freehand).toHaveStyle({ color: "#FF2D95" });
    expect(freehand.querySelector("svg")).toHaveAttribute("stroke", "currentColor");

    await user.click(freehand);
    expect(screen.getByRole("group", { name: "Drawing properties" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Thickness extra thin" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Color blue" }));
    expect(onColorChange).toHaveBeenCalledWith("#00AEEF");
    expect(screen.queryByRole("group", { name: "Drawing properties" })).not.toBeInTheDocument();

    await user.click(freehand);
    await user.click(screen.getByRole("button", { name: "Thickness thick" }));
    expect(onWidthChange).toHaveBeenCalledWith("thick");
    expect(screen.queryByRole("group", { name: "Drawing properties" })).not.toBeInTheDocument();

    await user.click(freehand);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("group", { name: "Drawing properties" })).not.toBeInTheDocument();

    await user.click(freehand);
    await user.click(screen.getByRole("button", { name: "Toggle blackboard" }));
    expect(onBoardToggle).toHaveBeenCalledOnce();
    expect(screen.queryByRole("group", { name: "Drawing properties" })).not.toBeInTheDocument();
    expect(onTextSizeChange).not.toHaveBeenCalled();
    expect(onToolChange).not.toHaveBeenCalled();
  });

  it("uses the same neutral active treatment for tools and blackboard", () => {
    const props = {
      color: "#FF2D95" as const,
      widthKey: "medium" as const,
      textSizeKey: "medium" as const,
      drawingTool: "freehand" as const,
      onColorChange: vi.fn(),
      onWidthChange: vi.fn(),
      onTextSizeChange: vi.fn(),
      onBoardToggle: vi.fn(),
      onToolChange: vi.fn(),
    };
    const { rerender } = render(<Marker {...props} board={false} tool="freehand" />);
    const freehand = screen.getByRole("button", { name: "Drawing tool" });
    const text = screen.getByRole("button", { name: "Text tool" });
    const board = screen.getByRole("button", { name: "Toggle blackboard" });
    expect(freehand.style.background).toBe("rgba(255, 255, 255, 0.16)");
    expect(text.style.background).toBe("none");
    expect(board.style.background).toBe("none");

    rerender(<Marker {...props} board tool="text" />);
    expect(freehand.style.background).toBe("none");
    expect(text.style.background).toBe("rgba(255, 255, 255, 0.16)");
    expect(board.style.background).toBe("rgba(255, 255, 255, 0.16)");
  });

  it("distinguishes taps from drags, clamps both edges and saves ratios", async () => {
    const rect = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      left: 100,
      top: 100,
      right: 309,
      bottom: 144,
      width: 209,
      height: 44,
      x: 100,
      y: 100,
      toJSON: () => ({}),
    });
    Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, get: () => 209 });
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", { configurable: true, get: () => 44 });

    const props = {
      color: "#FFD400" as const,
      widthKey: "xthin" as const,
      textSizeKey: "xsmall" as const,
      board: true,
      tool: "freehand" as const,
      drawingTool: "freehand" as const,
      onColorChange: vi.fn(),
      onWidthChange: vi.fn(),
      onTextSizeChange: vi.fn(),
      onBoardToggle: vi.fn(),
      onToolChange: vi.fn(),
    };
    const { container } = render(<Marker {...props} />);
    const root = container.firstElementChild as HTMLElement;

    fireEvent.pointerUp(root, { pointerId: 1 });
    fireEvent.pointerDown(root, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(root, { clientX: 102, clientY: 102, pointerId: 1 });
    fireEvent.pointerUp(root, { clientX: 102, clientY: 102, pointerId: 1 });
    expect(settings.saveMarkerPos).not.toHaveBeenCalled();

    fireEvent.pointerDown(root, { clientX: 100, clientY: 100, pointerId: 2 });
    fireEvent.pointerMove(root, { clientX: -500, clientY: -500, pointerId: 2 });
    rect.mockReturnValue({ left: 6, top: 6, right: 215, bottom: 50, width: 209, height: 44, x: 6, y: 6, toJSON: () => ({}) });
    fireEvent.pointerUp(root, { pointerId: 2 });
    await waitFor(() => expect(settings.saveMarkerPos).toHaveBeenCalledWith({ xRatio: 0.006, yRatio: 0.0075 }));

    rect.mockReturnValue({ left: 100, top: 100, right: 309, bottom: 144, width: 209, height: 44, x: 100, y: 100, toJSON: () => ({}) });
    fireEvent.pointerDown(root, { clientX: 100, clientY: 100, pointerId: 3 });
    fireEvent.pointerMove(root, { clientX: 2000, clientY: 2000, pointerId: 3 });
    fireEvent.pointerCancel(root, { pointerId: 3 });

    fireEvent.pointerDown(root, { clientX: 100, clientY: 100, pointerId: 4 });
    fireEvent.pointerMove(root, { clientX: -500, clientY: -500, pointerId: 4 });
    rect.mockReturnValue({ left: 6, top: 6, right: 215, bottom: 50, width: 209, height: 44, x: 6, y: 6, toJSON: () => ({}) });
    fireEvent.pointerUp(root, { pointerId: 4 });
    fireEvent.click(screen.getByRole("button", { name: "Drawing tool" }));

    const panel = screen.getByRole("group", { name: "Drawing properties" });
    const arrow = panel.querySelector<HTMLElement>("[data-arrowly-inspector-arrow]");
    expect(panel).toHaveStyle({ top: "calc(100% + 8px)" });
    expect(arrow).toHaveStyle({ top: "-5px" });
  });
});

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    x: left,
    y: top,
    toJSON: () => ({}),
  };
}

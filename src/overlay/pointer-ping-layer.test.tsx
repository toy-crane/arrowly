import { createRef } from "react";
import { act, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PointerPingLayer, type PointerPingLayerHandle } from "./pointer-ping-layer";

describe("PointerPingLayer", () => {
  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, "animate", {
      configurable: true,
      value: vi.fn(),
    });
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: false }),
    });
  });

  it("creates independent eight-particle bursts that travel for 200ms and fade by 500ms", async () => {
    const resolvers: Array<() => void> = [];
    const animate = vi.mocked(HTMLElement.prototype.animate).mockImplementation(() => {
      const finished = new Promise<void>((resolve) => resolvers.push(resolve));
      return { finished } as unknown as Animation;
    });
    const ref = createRef<PointerPingLayerHandle>();
    const { container } = render(<PointerPingLayer ref={ref} />);

    ref.current!.pingAt({ x: 100, y: 80 });
    ref.current!.pingAt({ x: 100, y: 80 });
    ref.current!.pingAt({ x: 100, y: 80 });

    const layer = container.firstElementChild as HTMLElement;
    expect(layer).toHaveStyle({ pointerEvents: "none" });
    expect(layer.children).toHaveLength(3);
    expect(layer.children[0].children).toHaveLength(8);
    expect(animate).toHaveBeenCalledTimes(24);
    const [frames, options] = animate.mock.calls[0];
    expect(options).toMatchObject({ duration: 500, fill: "forwards" });
    expect(frames).toEqual(expect.arrayContaining([
      expect.objectContaining({ offset: 0.4, opacity: 0.95 }),
      expect.objectContaining({ opacity: 0 }),
    ]));
    expect(animate.mock.calls.some(([candidate]) => JSON.stringify(candidate).includes("34px"))).toBe(true);

    await act(async () => {
      resolvers.slice(0, 8).forEach((resolve) => resolve());
      await Promise.resolve();
    });
    expect(layer.children).toHaveLength(2);

    await act(async () => {
      resolvers.slice(8).forEach((resolve) => resolve());
      await Promise.resolve();
    });
    expect(layer.children).toHaveLength(0);
  });

  it("uses one static 150ms emphasis when reduced motion is requested", () => {
    vi.mocked(window.matchMedia).mockReturnValue({ matches: true } as MediaQueryList);
    const animate = vi.mocked(HTMLElement.prototype.animate).mockReturnValue({
      finished: new Promise(() => undefined),
    } as unknown as Animation);
    const ref = createRef<PointerPingLayerHandle>();
    const { container } = render(<PointerPingLayer ref={ref} />);

    ref.current!.pingAt({ x: 20, y: 30 });

    expect(container.firstElementChild!.children[0].children).toHaveLength(1);
    expect(animate).toHaveBeenCalledOnce();
    expect(animate.mock.calls[0][1]).toMatchObject({ duration: 150 });
    expect(JSON.stringify(animate.mock.calls[0][0])).not.toContain("translate");
  });
});

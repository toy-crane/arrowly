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

  it("creates independent two-ring ripples that leave the origin empty and fade by 620ms", async () => {
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

    // 각 버스트는 빈 링 두 겹뿐이다: 클릭 지점을 채우는 중심 요소가 없다.
    const firstBurst = layer.children[0] as HTMLElement;
    expect(firstBurst.children).toHaveLength(2);
    const outerRing = firstBurst.children[0] as HTMLElement;
    expect(outerRing.style.borderRadius).toBe("50%");
    expect(outerRing.style.background).toBe("transparent");

    expect(animate).toHaveBeenCalledTimes(6);
    const [frames, options] = animate.mock.calls[0];
    expect(options).toMatchObject({ duration: 620, delay: 0, fill: "forwards" });
    expect(frames).toEqual(expect.arrayContaining([
      expect.objectContaining({ transform: "scale(.3)", opacity: 0 }),
      expect.objectContaining({ opacity: 0 }),
    ]));
    // 원점을 옮기지 않고 제자리에서만 확장한다.
    expect(animate.mock.calls.every(([candidate]) => !JSON.stringify(candidate).includes("translate"))).toBe(true);
    // 안쪽 링은 늦게 출발한다.
    expect(animate.mock.calls[1][1]).toMatchObject({ delay: 110 });

    await act(async () => {
      resolvers.slice(0, 2).forEach((resolve) => resolve());
      await Promise.resolve();
    });
    expect(layer.children).toHaveLength(2);

    await act(async () => {
      resolvers.slice(2).forEach((resolve) => resolve());
      await Promise.resolve();
    });
    expect(layer.children).toHaveLength(0);
  });

  it("uses one static 150ms emphasis without spatial expansion when reduced motion is requested", () => {
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
    const frames = JSON.stringify(animate.mock.calls[0][0]);
    expect(frames).not.toContain("translate");
    expect(frames).not.toContain("scale");
  });
});

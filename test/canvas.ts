import { vi } from "vitest";

export function createCanvasContext() {
  return {
    clearRect: vi.fn(),
    setTransform: vi.fn(),
    scale: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    bezierCurveTo: vi.fn(),
    arc: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    strokeStyle: "",
    fillStyle: "",
    lineWidth: 0,
    lineCap: "butt",
    lineJoin: "miter",
    globalAlpha: 0,
  } as unknown as CanvasRenderingContext2D;
}

export function installCanvasMock() {
  const contexts: CanvasRenderingContext2D[] = [];
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => {
    const context = createCanvasContext();
    contexts.push(context);
    return context;
  });
  return contexts;
}

export function installResizeObserver() {
  const disconnect = vi.fn();
  class ResizeObserverMock {
    constructor(private readonly callback: ResizeObserverCallback) {}
    observe(target: Element) {
      this.callback([{ target } as ResizeObserverEntry], this as unknown as ResizeObserver);
    }
    disconnect = disconnect;
    unobserve() {}
  }
  vi.stubGlobal("ResizeObserver", ResizeObserverMock);
  return { disconnect };
}

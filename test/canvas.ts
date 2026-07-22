import { vi } from "vitest";

export function createCanvasContext() {
  return {
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    setTransform: vi.fn(),
    scale: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    bezierCurveTo: vi.fn(),
    arc: vi.fn(),
    rect: vi.fn(),
    ellipse: vi.fn(),
    closePath: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    fillText: vi.fn(),
    measureText: vi.fn(() => ({ width: 10 })),
    strokeStyle: "",
    fillStyle: "",
    lineWidth: 0,
    lineCap: "butt",
    lineJoin: "miter",
    globalAlpha: 0,
    font: "",
    textBaseline: "alphabetic",
    shadowColor: "",
    shadowBlur: 0,
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

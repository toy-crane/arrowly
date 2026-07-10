import "@testing-library/jest-dom/vitest";
import { clearMocks } from "@tauri-apps/api/mocks";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

if (!("setPointerCapture" in HTMLElement.prototype)) {
  Object.defineProperty(HTMLElement.prototype, "setPointerCapture", {
    configurable: true,
    value: () => undefined,
  });
}

if (!("releasePointerCapture" in HTMLElement.prototype)) {
  Object.defineProperty(HTMLElement.prototype, "releasePointerCapture", {
    configurable: true,
    value: () => undefined,
  });
}

afterEach(async () => {
  cleanup();
  // Tauri listen() returns its async unlisten callback. Let React effect cleanup
  // unregister listeners before clearMocks removes the mock event registry.
  await new Promise((resolve) => setTimeout(resolve, 0));
  clearMocks();
  vi.restoreAllMocks();
});

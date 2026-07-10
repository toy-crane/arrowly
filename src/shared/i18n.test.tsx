import { Fragment, isValidElement, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

describe("frontend i18n", () => {
  it("formats English strings, rich slots and stable shortcut errors", async () => {
    vi.resetModules();
    vi.stubGlobal("navigator", { language: "en-US" });
    const { lang, shortcutErrorMessage, t, tx } = await import("./i18n");

    expect(lang).toBe("en");
    expect(t("marker.colorValue", { value: "pink" })).toBe("Color pink");
    expect(t("marker.colorValue")).toBe("Color {value}");
    const rich = tx("onboarding.draw.body", { hi: "ONE" });
    expect(
      rich.some(
        (node) =>
          isValidElement<{ children?: ReactNode }>(node) &&
          node.type === Fragment &&
          node.props.children === "ONE",
      ),
    ).toBe(true);
    expect(shortcutErrorMessage("error:reserved_escape")).toBe("Esc is a reserved key");
    expect(shortcutErrorMessage(new Error("unknown"))).toBe("Couldn't set this shortcut");
  });

  it("selects Korean from the navigator language", async () => {
    vi.resetModules();
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const { lang, t } = await import("./i18n");
    expect(lang).toBe("ko");
    expect(t("shortcut.toggle")).toBe("그리기 토글");
  });

  it("falls back to English when navigator has no language", async () => {
    vi.resetModules();
    vi.stubGlobal("navigator", {});
    const { lang } = await import("./i18n");
    expect(lang).toBe("en");
  });
});

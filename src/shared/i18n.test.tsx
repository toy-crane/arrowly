import { describe, expect, it, vi } from "vitest";

describe("frontend i18n", () => {
  it("formats English strings, rich slots and stable shortcut errors", async () => {
    vi.resetModules();
    vi.stubGlobal("navigator", { language: "en-US" });
    const { lang, shortcutErrorMessage, t } = await import("./i18n");

    expect(lang).toBe("en");
    expect(t("marker.colorValue", { value: "pink" })).toBe("Color pink");
    expect(t("marker.colorName.blue")).toBe("blue");
    expect(t("marker.widthName.xthin")).toBe("extra thin");
    expect(t("marker.colorValue")).toBe("Color {value}");
    expect(t("marker.drawingTool")).toBe("Drawing tool");
    expect(t("marker.textSizeValue", { value: 54 })).toBe("Text size 54px");
    expect(t("onboarding.draw.title")).toBe("Draw one mark");
    expect(shortcutErrorMessage("error:reserved_escape")).toBe("Esc is a reserved key");
    expect(shortcutErrorMessage(new Error("unknown"))).toBe("Couldn't set this shortcut");
  });

  it("selects Korean from the navigator language", async () => {
    vi.resetModules();
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const { lang, t } = await import("./i18n");
    expect(lang).toBe("ko");
    expect(t("shortcut.toggle")).toBe("그리기 토글");
    expect(t("marker.drawingProperties")).toBe("그리기 속성");
    expect(t("marker.drawingTool.triangle")).toBe("삼각형 도구");
    expect(t("marker.colorName.blue")).toBe("파랑");
    expect(t("marker.widthName.xthin")).toBe("매우 얇음");
    expect(t("marker.textSizeValue", { value: 16 })).toBe("텍스트 크기 16px");
  });

  it("falls back to English when navigator has no language", async () => {
    vi.resetModules();
    vi.stubGlobal("navigator", {});
    const { lang } = await import("./i18n");
    expect(lang).toBe("en");
  });
});

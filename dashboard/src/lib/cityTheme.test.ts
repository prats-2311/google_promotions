import { describe, expect, it } from "vitest";
import { cityAccent, cityAccentOnPaper, CITY_ACCENT_DARK, CITY_ACCENT_LIGHT } from "./cityTheme";

describe("cityAccent", () => {
  it("returns the dark-canvas accent for a known city", () => {
    expect(cityAccent("mumbai")).toBe(CITY_ACCENT_DARK.mumbai);
  });

  it("falls back to the new_york accent for an unknown city", () => {
    expect(cityAccent("atlantis")).toBe(CITY_ACCENT_DARK.new_york);
  });
});

describe("cityAccentOnPaper", () => {
  it("returns the paper-surface accent for a known city", () => {
    expect(cityAccentOnPaper("tokyo")).toBe(CITY_ACCENT_LIGHT.tokyo);
  });

  it("falls back to the new_york accent for an unknown city", () => {
    expect(cityAccentOnPaper("atlantis")).toBe(CITY_ACCENT_LIGHT.new_york);
  });

  it("dark and light palettes cover the same set of cities", () => {
    expect(Object.keys(CITY_ACCENT_DARK).sort()).toEqual(Object.keys(CITY_ACCENT_LIGHT).sort());
  });

  it("every accent color is a valid 6-digit hex value", () => {
    const hexPattern = /^#[0-9a-f]{6}$/i;
    for (const color of [...Object.values(CITY_ACCENT_DARK), ...Object.values(CITY_ACCENT_LIGHT)]) {
      expect(color).toMatch(hexPattern);
    }
  });
});

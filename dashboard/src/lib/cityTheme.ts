// Validated via the dataviz skill's palette validator (scripts/validate_palette.js)
// against both the dark canvas shell and the paper (light) card surface — all
// six categorical checks pass in both modes. Hue families were chosen to match
// intended per-city identity (terracotta/orange = Mumbai, blue = London,
// magenta/plum = Tokyo, green = São Paulo, violet/indigo = New York) and then
// snapped to the nearest validated step, per the skill's "documented palette
// only" rule — not eyeballed. Tokyo's light-surface contrast sits at 2.62:1
// (a WARN, not a fail); mitigated because city names are always shown as
// direct text labels next to these colors, never color alone.
export const CITY_ACCENT_DARK: Record<string, string> = {
  mumbai: "#d95926",
  london: "#3987e5",
  tokyo: "#d55181",
  sao_paulo: "#008300",
  new_york: "#9085e9",
};

export const CITY_ACCENT_LIGHT: Record<string, string> = {
  mumbai: "#eb6834",
  london: "#2a78d6",
  tokyo: "#e87ba4",
  sao_paulo: "#008300",
  new_york: "#4a3aa7",
};

/** For use against the dark canvas shell (text, icons, decorative bars). */
export function cityAccent(cityId: string): string {
  return CITY_ACCENT_DARK[cityId] ?? CITY_ACCENT_DARK.new_york;
}

/** For use against paper (light) card surfaces — icons, small text. */
export function cityAccentOnPaper(cityId: string): string {
  return CITY_ACCENT_LIGHT[cityId] ?? CITY_ACCENT_LIGHT.new_york;
}

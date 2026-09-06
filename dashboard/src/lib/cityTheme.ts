// Re-validated 2026-09-07 for the "Premiere Neon" direction via the dataviz
// skill's validate_palette.js against both surfaces this app actually paints
// these on:
//   node scripts/validate_palette.js "#ff3d00,#0091ea,#ff00aa,#009e5c,#7c4dff" --mode dark --surface "#08080a"
//   node scripts/validate_palette.js "#ff3d00,#0091ea,#ff00aa,#009e5c,#7c4dff" --mode light --surface "#ffffff"
// Both ALL CHECKS PASS. Unlike the previous (more muted) palette, this one
// clears the dark canvas's tighter OKLCH lightness band [0.48,0.67] as-is,
// so dark and light variants collapse to the same five hexes -- kept as two
// separate maps anyway so cityAccent()/cityAccentOnPaper() call sites don't
// need to change if a future palette needs them to diverge again. Hue
// families kept their prior per-city identity (red-orange = Mumbai, blue =
// London, magenta = Tokyo, green = São Paulo, violet = New York), snapped to
// validated steps rather than eyeballed, per the skill's "documented
// palette only" rule.
export const CITY_ACCENT_DARK: Record<string, string> = {
  mumbai: "#ff3d00",
  london: "#0091ea",
  tokyo: "#ff00aa",
  sao_paulo: "#009e5c",
  new_york: "#7c4dff",
};

export const CITY_ACCENT_LIGHT: Record<string, string> = {
  mumbai: "#ff3d00",
  london: "#0091ea",
  tokyo: "#ff00aa",
  sao_paulo: "#009e5c",
  new_york: "#7c4dff",
};

/** For use against the dark canvas shell (text, icons, decorative bars). */
export function cityAccent(cityId: string): string {
  return CITY_ACCENT_DARK[cityId] ?? CITY_ACCENT_DARK.new_york;
}

/** For use against paper (light) card surfaces — icons, small text. */
export function cityAccentOnPaper(cityId: string): string {
  return CITY_ACCENT_LIGHT[cityId] ?? CITY_ACCENT_LIGHT.new_york;
}

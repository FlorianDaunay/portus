import {
  COLOR_TOKENS,
  FONT_TOKENS,
  RADIUS_TOKENS,
  SHADOW_TOKENS,
  cssVar,
  tailwindName,
} from "./tokens";

/**
 * Tailwind's `theme.extend`, generated from the tokens: `bg-surface-hover`, `text-text-muted`,
 * `rounded-card`, `shadow-overlay`, `font-mono`, and the width of every `border`.
 * Imported by `tailwind.config.ts`, so it must stay free of browser/React code.
 */
export function tailwindThemeExtension() {
  return {
    colors: Object.fromEntries(
      COLOR_TOKENS.map((t) => [tailwindName(t), `rgb(var(${cssVar.color(t)}) / <alpha-value>)`])
    ),
    borderRadius: Object.fromEntries(RADIUS_TOKENS.map((t) => [t, `var(${cssVar.radius(t)})`])),
    boxShadow: Object.fromEntries(SHADOW_TOKENS.map((t) => [t, `var(${cssVar.shadow(t)})`])),
    fontFamily: Object.fromEntries(FONT_TOKENS.map((t) => [t, `var(${cssVar.font(t)})`])),
    borderWidth: { DEFAULT: `var(${cssVar.borderWidth})` },
  };
}

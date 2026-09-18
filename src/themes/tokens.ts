/**
 * The vocabulary of a theme. This is the single list of design tokens: the `Theme` type,
 * the CSS variables and the Tailwind classes (`bg-surface-hover`, `rounded-card`,
 * `shadow-overlay`, ...) are all generated from it. To add a token, add it here, give it a
 * value in every theme definition, and the rest follows.
 */

export const COLOR_TOKENS = [
  "canvas",
  "surface",
  "surfaceHover",
  "border",
  "textPrimary",
  "textSecondary",
  "textMuted",
  "accent",
  "accentHover",
  "accentForeground",
  "success",
  "warning",
  "danger",
] as const;

/** Corner radii by role: `control` (buttons, inputs), `tile` (icon tiles, toasts), `card` (panels), `pill` (badges, bars). */
export const RADIUS_TOKENS = ["control", "tile", "card", "pill"] as const;

export const SHADOW_TOKENS = ["card", "overlay"] as const;

export const FONT_TOKENS = ["sans", "mono"] as const;

export type ColorToken = (typeof COLOR_TOKENS)[number];
export type RadiusToken = (typeof RADIUS_TOKENS)[number];
export type ShadowToken = (typeof SHADOW_TOKENS)[number];
export type FontToken = (typeof FONT_TOKENS)[number];

const kebab = (name: string) => name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/** Names of the CSS custom properties that carry each token at runtime. */
export const cssVar = {
  color: (token: ColorToken) => `--color-${kebab(token)}`,
  radius: (token: RadiusToken) => `--radius-${token}`,
  shadow: (token: ShadowToken) => `--shadow-${token}`,
  font: (token: FontToken) => `--font-${token}`,
  borderWidth: "--border-width",
} as const;

/** Tailwind class name for a token (`surfaceHover` -> `surface-hover`). */
export const tailwindName = kebab;

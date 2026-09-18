import type { CSSProperties } from "react";
import {
  COLOR_TOKENS,
  FONT_TOKENS,
  RADIUS_TOKENS,
  SHADOW_TOKENS,
  cssVar,
} from "./tokens";
import type { Theme } from "./types";

/** `#4f46e5` (or `#46e`) -> `79 70 229`, the channel form Tailwind needs for `bg-accent/10`. */
export function hexToChannels(hex: string): string {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) throw new Error(`Invalid theme color "${hex}": expected #RGB or #RRGGBB.`);
  const digits = match[1].length === 3 ? [...match[1]].map((c) => c + c).join("") : match[1];
  const n = parseInt(digits, 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

/** Every CSS custom property a theme sets, by name. */
export function themeToCssVars(theme: Theme): Record<string, string> {
  const vars: Record<string, string> = { [cssVar.borderWidth]: theme.borderWidth };
  for (const token of COLOR_TOKENS) vars[cssVar.color(token)] = hexToChannels(theme.colors[token]);
  for (const token of RADIUS_TOKENS) vars[cssVar.radius(token)] = theme.radius[token];
  for (const token of SHADOW_TOKENS) vars[cssVar.shadow(token)] = theme.shadow[token];
  for (const token of FONT_TOKENS) vars[cssVar.font(token)] = theme.fonts[token];
  return vars;
}

/** Inline style that scopes a theme to one element (used for the live previews). */
export function themeToStyle(theme: Theme): CSSProperties {
  return themeToCssVars(theme) as CSSProperties;
}

/** Makes `theme` the look of the whole app. */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  for (const [name, value] of Object.entries(themeToCssVars(theme))) root.style.setProperty(name, value);
  root.dataset.theme = theme.id;
  root.dataset.scheme = theme.scheme;
  root.style.colorScheme = theme.scheme;
}

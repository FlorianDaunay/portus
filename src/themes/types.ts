import type { ColorToken, FontToken, RadiusToken, ShadowToken } from "./tokens";

export type ThemeScheme = "light" | "dark";

/** A complete theme: every token has a value. */
export interface Theme {
  /** Unique, stable id (stored in the user's preferences). */
  id: string;
  name: string;
  /** One short line shown in the theme picker. */
  description: string;
  /** Whether it is a light or a dark look: drives native controls and "match system". */
  scheme: ThemeScheme;
  /** `#RRGGBB` colors. */
  colors: Record<ColorToken, string>;
  radius: Record<RadiusToken, string>;
  shadow: Record<ShadowToken, string>;
  /** Width of every border and divider (`0px` for a borderless look). */
  borderWidth: string;
  fonts: Record<FontToken, string>;
}

/** What a theme file provides: colors are required, shape and fonts fall back to the defaults. */
export interface ThemeDefinition {
  id: string;
  name: string;
  description: string;
  scheme: ThemeScheme;
  colors: Record<ColorToken, string>;
  radius?: Partial<Record<RadiusToken, string>>;
  shadow?: Partial<Record<ShadowToken, string>>;
  borderWidth?: string;
  fonts?: Partial<Record<FontToken, string>>;
}

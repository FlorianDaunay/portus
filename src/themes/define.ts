import type { Theme, ThemeDefinition } from "./types";

/** Shape and typography shared by every theme unless it overrides them. */
const defaults = {
  radius: {
    control: "0.5rem",
    tile: "0.875rem",
    card: "1.125rem",
    pill: "9999px",
  },
  shadow: {
    card: "0 1px 2px 0 rgb(0 0 0 / 0.04), 0 1px 3px 0 rgb(0 0 0 / 0.06)",
    overlay: "0 4px 24px -4px rgb(0 0 0 / 0.12)",
  },
  borderWidth: "1px",
  fonts: {
    sans: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    mono: '"JetBrains Mono", SFMono-Regular, Menlo, Consolas, monospace',
  },
} satisfies Pick<Theme, "radius" | "shadow" | "borderWidth" | "fonts">;

/** Builds a complete theme from a definition, filling in whatever it does not override. */
export function defineTheme(definition: ThemeDefinition): Theme {
  return {
    ...definition,
    radius: { ...defaults.radius, ...definition.radius },
    shadow: { ...defaults.shadow, ...definition.shadow },
    borderWidth: definition.borderWidth ?? defaults.borderWidth,
    fonts: { ...defaults.fonts, ...definition.fonts },
  };
}

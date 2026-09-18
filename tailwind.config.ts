import type { Config } from "tailwindcss";
import { tailwindThemeExtension } from "./src/themes/tailwind";

export default {
  // `dark:` variants follow the active theme's scheme (set by applyTheme on <html>).
  darkMode: ["selector", '[data-scheme="dark"]'],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      // Colors, radii, shadows, fonts and border width all come from the theme tokens.
      ...tailwindThemeExtension(),
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-dot": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.4" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.2s ease-out",
        "pulse-dot": "pulse-dot 2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;

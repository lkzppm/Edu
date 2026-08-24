import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Fin's blue (#3987e5) shifted to a greener blue — teal-cyan.
        accent: "#22b8cf",
        surface: "#0a171d",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        display: ["var(--font-grotesk)", "system-ui", "sans-serif"],
        mono: ["var(--font-jbmono)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        glow: "0 0 32px -8px rgba(34, 184, 207, 0.55)",
        "glow-sm": "0 0 20px -8px rgba(34, 184, 207, 0.5)",
      },
    },
  },
  plugins: [],
} satisfies Config;

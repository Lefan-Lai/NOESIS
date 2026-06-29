import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#111827",
        muted: "#667085",
        line: "#dbe3f0",
        paper: "#f8fbff",
        atlasBlue: "#1264ff",
        atlasGreen: "#18a44c",
        atlasOrange: "#ff7a1a",
        atlasPurple: "#8b5cf6",
        atlasRed: "#ff3b30"
      },
      boxShadow: {
        panel: "0 14px 40px rgba(15, 23, 42, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;

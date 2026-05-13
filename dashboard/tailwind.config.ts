import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: "#0a0a0b",
          elev: "#101012",
          card: "#131316",
          hover: "#1a1a1f",
        },
        border: {
          DEFAULT: "#1f1f25",
          strong: "#2a2a32",
        },
        ink: {
          DEFAULT: "#f5f5f7",
          muted: "#a1a1aa",
          dim: "#6b6b75",
        },
        accent: {
          DEFAULT: "#3ddc97",
          dim: "#2bb37a",
          soft: "#1b3d2e",
        },
        danger: "#f87171",
        warn: "#fbbf24",
      },
      fontFamily: {
        sans: [
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Inter",
          "sans-serif",
        ],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      boxShadow: {
        card: "0 1px 0 0 rgba(255,255,255,0.04) inset, 0 1px 2px rgba(0,0,0,0.4)",
        glow: "0 0 0 1px rgba(61,220,151,0.15), 0 8px 32px -8px rgba(61,220,151,0.25)",
      },
      keyframes: {
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        fadeIn: {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        shimmer: "shimmer 2s linear infinite",
        fadeIn: "fadeIn 0.3s ease-out",
      },
    },
  },
  plugins: [],
};

export default config;

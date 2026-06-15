import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "../../packages/ui/src/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#16131f",
        signal: "#6f35ff",
        plasma: "#a855f7",
        "soft-grid": "#ece7f8"
      },
      boxShadow: {
        "orb-core": "0 24px 90px rgba(111, 53, 255, 0.28), inset 0 0 40px rgba(255,255,255,0.44)"
      }
    }
  },
  plugins: []
};

export default config;

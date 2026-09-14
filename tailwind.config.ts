import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eefdf4",
          100: "#d7f9e3",
          400: "#3cd17a",
          500: "#1cb35e",
          600: "#128f49",
          700: "#0f713b",
          900: "#0c3d21",
        },
      },
    },
  },
  plugins: [],
};

export default config;

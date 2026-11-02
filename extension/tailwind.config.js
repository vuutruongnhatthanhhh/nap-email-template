/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{ts,tsx,html}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#2563EB",
          hover: "#1D4ED8",
          light: "#2563EB1A",
        },
      },
    },
  },
  plugins: [],
};

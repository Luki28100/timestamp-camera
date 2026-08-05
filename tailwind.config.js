/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0b0f14",
        panel: "#151b23",
        stamp: "#ffd400",
      },
    },
  },
  plugins: [],
};

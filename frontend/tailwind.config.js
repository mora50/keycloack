/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        mono: [
          "JetBrains Mono",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Monaco",
          "monospace",
        ],
      },
      colors: {
        gateway: {
          50: "#eef4ff",
          100: "#dbe6ff",
          200: "#bdd0ff",
          300: "#90b1ff",
          400: "#5e8aff",
          500: "#3a66f6",
          600: "#2848df",
          700: "#1f37b3",
          800: "#1d3091",
          900: "#1c2c75",
        },
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(58, 102, 246, 0.25), 0 12px 30px -10px rgba(58, 102, 246, 0.4)",
      },
    },
  },
  plugins: [],
};

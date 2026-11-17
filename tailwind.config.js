/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#701f2f',
          dark: '#541522',
          darker: '#3f1420',
          soft: '#fff1f3',
        },
        accent: {
          DEFAULT: '#f4c95d',
          dark: '#b8862d',
        },
        cream: {
          DEFAULT: '#fffaf0',
          raised: '#fffcf6',
          muted: '#f8f1e5',
          hover: '#f2e4cc',
          deep: '#f0e4d2',
        },
        line: {
          DEFAULT: '#eadbc1',
          soft: '#e6d8c2',
        },
        ink: {
          DEFAULT: '#32151b',
          body: '#4a3b32',
          muted: '#6f5a49',
          faint: '#8c6b54',
          weakest: '#a89580',
        },
        warning: {
          bg: '#fff4d6',
          ink: '#765116',
        },
      },
    },
  },
  plugins: [],
}

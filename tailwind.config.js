/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter Variable', 'sans-serif'],
        display: ['Instrument Serif', 'Georgia', 'serif'],
      },
      colors: {
        brand: {
          DEFAULT: '#4f46e5',
          dark: '#3730a3',
          darker: '#1e1b4b',
          soft: '#eef2ff',
        },
        accent: {
          DEFAULT: '#fbbf24',
          dark: '#92400e',
        },
        cream: {
          DEFAULT: '#f8fafc',
          raised: '#ffffff',
          muted: '#f1f5f9',
          hover: '#e8edf5',
          deep: '#e2e8f0',
        },
        line: {
          DEFAULT: '#dce2ed',
          soft: '#e2e8f0',
        },
        ink: {
          DEFAULT: '#172033',
          body: '#334155',
          muted: '#475569',
          faint: '#526078',
          weakest: '#526078',
        },
        warning: {
          bg: '#fff7e6',
          ink: '#854d0e',
        },
      },
    },
  },
  plugins: [],
}

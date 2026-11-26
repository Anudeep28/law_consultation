/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
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
        white: 'rgb(var(--white) / <alpha-value>)',
        'on-brand': 'rgb(var(--on-brand) / <alpha-value>)',
        brand: {
          DEFAULT: 'rgb(var(--brand) / <alpha-value>)',
          dark: 'rgb(var(--brand-dark) / <alpha-value>)',
          darker: 'rgb(var(--brand-darker) / <alpha-value>)',
          soft: 'rgb(var(--brand-soft) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'rgb(var(--accent) / <alpha-value>)',
          dark: 'rgb(var(--accent-dark) / <alpha-value>)',
        },
        cream: {
          DEFAULT: 'rgb(var(--cream) / <alpha-value>)',
          raised: 'rgb(var(--cream-raised) / <alpha-value>)',
          muted: 'rgb(var(--cream-muted) / <alpha-value>)',
          hover: 'rgb(var(--cream-hover) / <alpha-value>)',
          deep: 'rgb(var(--cream-deep) / <alpha-value>)',
        },
        line: {
          DEFAULT: 'rgb(var(--line) / <alpha-value>)',
          soft: 'rgb(var(--line-soft) / <alpha-value>)',
        },
        ink: {
          DEFAULT: 'rgb(var(--ink) / <alpha-value>)',
          body: 'rgb(var(--ink-body) / <alpha-value>)',
          muted: 'rgb(var(--ink-muted) / <alpha-value>)',
          faint: 'rgb(var(--ink-faint) / <alpha-value>)',
          weakest: 'rgb(var(--ink-faint) / <alpha-value>)',
        },
        warning: {
          bg: 'rgb(var(--warning-bg) / <alpha-value>)',
          ink: 'rgb(var(--warning-ink) / <alpha-value>)',
        },
        surface: 'rgb(var(--surface-border) / <alpha-value>)',
      },
    },
  },
  plugins: [],
}

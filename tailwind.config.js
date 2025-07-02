/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'amore-red': '#B91C1C',
        'amore-charcoal': '#1F2937',
        'amore-gray': '#6B7280',
        'amore-red-soft': '#FEF2F2',
      },
      animation: {
        'pro-spinner': 'profesional-spin-pulse 6s ease-in-out infinite',
      },
      keyframes: {
        'profesional-spin-pulse': {
          '0%, 100%': { transform: 'rotate(0deg) scale(1)', opacity: '0.8' },
          '50%': { transform: 'rotate(180deg) scale(1.15)', opacity: '1' },
        }
      }
    },
  },
  plugins: [],
}
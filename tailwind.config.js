/** @type {import('tailwindcss').Config} */
export default {
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
      },
      keyframes: {
        heartbeat: {
          '0%, 100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.05)' },
        }
      },
      animation: {
        heartbeat: 'heartbeat 2.5s ease-in-out infinite',
      }
    },
  },
  plugins: [],
}
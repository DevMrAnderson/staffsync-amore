/** @type {import('tailwindcss').Config} */
module.exports = {
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
      // --- INICIO DE LA SECCIÓN DE ANIMACIONES ---
      keyframes: {
        heartbeat: {
          '0%, 100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.05)' },
        },
        // AÑADIMOS LA ANIMACIÓN DE FADE IN
        fadeIn: {
          'from': { opacity: '0' },
          'to': { opacity: '1' },
        },
        // AÑADIMOS LA ANIMACIÓN DE SCALE UP
        scaleUp: {
          'from': { transform: 'scale(0.95)', opacity: '0' },
          'to': { transform: 'scale(1)', opacity: '1' },
        }
      },
      animation: {
        heartbeat: 'heartbeat 2.5s ease-in-out infinite',
        // AÑADIMOS LAS CLASES PARA USAR LAS ANIMACIONES
        fadeIn: 'fadeIn 0.3s ease-out forwards',
        scaleUp: 'scaleUp 0.3s ease-out forwards',
      }
      // --- FIN DE LA SECCIÓN DE ANIMACIONES ---
    },
  },
  plugins: [],
}
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        brand: {
          50:  '#f0f4ff',
          100: '#dce7ff',
          200: '#baccff',
          300: '#8faaff',
          400: '#617dff',
          500: '#3d56f0',
          600: '#2d3de6',
          700: '#252fd4',
          800: '#2127ab',
          900: '#202587',
          950: '#13164f',
        },
      },
      backgroundImage: {
        'canvas-grid': 'radial-gradient(circle, rgba(255,255,255,0.07) 1px, transparent 1px)',
      },
      backgroundSize: {
        'grid-sm': '28px 28px',
      },
      animation: {
        'fade-in':    'fadeIn 0.2s ease-out',
        'slide-up':   'slideUp 0.25s ease-out',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn:    { '0%': { opacity: 0 },                           '100%': { opacity: 1 } },
        slideUp:   { '0%': { opacity: 0, transform: 'translateY(12px)' }, '100%': { opacity: 1, transform: 'translateY(0)' } },
        pulseSoft: { '0%,100%': { boxShadow: '0 0 0 0 rgba(61,86,240,0)' }, '50%': { boxShadow: '0 0 0 6px rgba(61,86,240,0.25)' } },
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [],
}

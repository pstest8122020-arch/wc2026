/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Jupiter brand palette (jup-eco-6056a2.webflow.io)
        nebula: '#00B6E7',     // Nebula Blue (primary)
        helix:  '#22CCEE',     // Helix Cyan
        trifid: '#2ED3B7',     // Trifid Teal
        aurora: '#76D484',
        comet:  '#94E5A0',
        cosmic: '#A4D756',     // Cosmic Lime
        venus:  '#C7F284',     // Venus Lime
        space:    '#0C0C0C',   // Space Black
        meteorite:'#151514',
        charcoal: '#1D1D1C',
        gunmetal: '#30302E',
        steel:    '#707070',
        cloud:    '#E8F9FF',
        // Backwards-compat aliases so we don't have to touch every component
        pitch: {
          50:  '#E8F9FF',
          500: '#22CCEE',
          700: '#00B6E7',
          900: '#0C0C0C',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['Syne', 'Inter', 'system-ui', 'sans-serif'],
      },
      backgroundImage: {
        'jupiter-gradient': 'linear-gradient(135deg, #00B6E7 0%, #A4D756 100%)',
        'jupiter-cyan-teal': 'linear-gradient(135deg, #22CCEE 0%, #2ED3B7 100%)',
      },
      animation: {
        'pulse-live': 'pulse-live 1.5s ease-in-out infinite',
      },
      keyframes: {
        'pulse-live': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.4' },
        },
      },
    },
  },
  plugins: [],
};

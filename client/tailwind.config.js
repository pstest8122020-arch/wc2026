/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // community.jup.ag design language (community-jup-v02.vercel.app).
        // Token NAMES are kept so every component re-skins from this one file —
        // the neutrals move from warm black to the hub's blue-slate ramp.
        nebula: '#00B6E7',     // Nebula Blue (links / secondary accent)
        helix:  '#22CCEE',     // Helix Cyan
        trifid: '#2ED3B7',     // Trifid Teal
        aurora: '#76D484',
        comet:  '#94E5A0',
        cosmic: '#A4D756',     // Cosmic Lime
        venus:  '#C7F284',     // Venus Lime — the hub's primary CTA color
        space:    '#090D10',   // page bg (hub body: rgb(9 13 16))
        meteorite:'#151E28',   // card bg (hub: rgb(21 30 40))
        charcoal: '#19242E',   // borders (hub: rgb(25 36 46))
        gunmetal: '#243140',   // input borders / stronger lines
        steel:    '#8A97A3',   // secondary text (blue-tinted slate)
        cloud:    '#E8F9FF',
        // Backwards-compat aliases so we don't have to touch every component
        pitch: {
          50:  '#E8F9FF',
          500: '#22CCEE',
          700: '#00B6E7',
          900: '#090D10',
        },
      },
      fontFamily: {
        // Jupiter brand uses Inter for both body and headings; weight does the
        // display work, not a separate display font. Syne is the JupDAO mark.
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      backgroundImage: {
        // The hub's primary CTA is FLAT Venus lime (#C7F284) with dark text — keep
        // the gradient utility name so every existing CTA re-skins automatically.
        'jupiter-gradient': 'linear-gradient(135deg, #C7F284 0%, #C7F284 100%)',
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

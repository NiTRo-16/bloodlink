/** @type {import('tailwindcss').Config} */
// Neo-brutalist theme: black outlines, hard offset shadows, flat colour.
// Colour carries meaning: blood = need and main actions, amber = urgent,
// sage (mint) = donors coming / good news, sky = information.
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  // hover: styles only apply on devices with a real pointer, so a tap doesn't leave a button "lifted".
  future: { hoverOnlyWhenSupported: true },
  theme: {
    extend: {
      colors: {
        ink: '#000000', // text, outlines, shadows
        mist: '#FFF1EC', // page background
        line: '#000000', // outlines and dividers
        blood: { DEFAULT: '#E5172F', dark: '#B80F22', soft: '#FFE0E3' },
        amber: { DEFAULT: '#FFD23F', soft: '#FFF3C4', ink: '#000000' },
        sage: { DEFAULT: '#0B7A48', soft: '#7BE0B0' },
        sky: { DEFAULT: '#9CC8FF' },
        slate: { DEFAULT: '#3A3A3A' }, // secondary text, still high contrast
      },
      fontFamily: {
        display: ['"Archivo Black"', '"Archivo"', 'system-ui', 'sans-serif'],
        sans: ['"Archivo"', 'system-ui', 'sans-serif'],
      },
      borderWidth: { 3: '3px' },
      boxShadow: {
        card: '6px 6px 0 #000',
        cta: '4px 4px 0 #000',
        sm: '3px 3px 0 #000',
      },
    },
  },
  plugins: [],
};

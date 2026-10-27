/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        cream: '#FFF8EC',
        plum: '#302034',
        plumdeep: '#241722',
        citrus: '#F47B35',
        citrusdark: '#C85A1E',
        butter: '#F5D96B',
        leaf: '#547451',
        leafdark: '#3E5A3C',
        peach: '#F5D1BD',
        paper: '#FFFFFF',
      },
      fontFamily: {
        serif: ['Georgia', "'Times New Roman'", 'serif'],
        sans: ['system-ui', '-apple-system', "'Segoe UI'", 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        card: '0 2px 12px rgba(48,32,52,0.08)',
        lift: '0 10px 28px rgba(48,32,52,0.14)',
      },
    },
  },
  plugins: [],
}

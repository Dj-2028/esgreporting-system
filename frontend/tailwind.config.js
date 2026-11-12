/** @type {import('tailwindcss').Config} */
// Design tokens from frontend.md §2.1 (Hoshō Digital red on white).
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#FDECEC',
          600: '#DC1F26',
          700: '#B3151B',
          900: '#5A0A0E',
        },
        ink: {
          500: '#6B6B6B',
          900: '#1F1F1F',
        },
        line: '#E5E5E5',
        surface: {
          DEFAULT: '#FFFFFF',
          muted: '#FAF7F7',
        },
      },
      fontFamily: {
        sans: ['Inter', 'Arial', 'sans-serif'],
      },
      borderRadius: {
        card: '12px',
        input: '8px',
      },
      boxShadow: {
        card: '0 1px 3px rgba(0,0,0,.08)',
      },
    },
  },
  plugins: [],
};

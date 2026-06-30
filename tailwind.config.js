/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./*.html",
    "./js/**/*.js"
  ],
  darkMode: ['class', '.dark-mode'],
  theme: {
    extend: {
      colors: {
        brand: '#F2CE5A',
        brandHover: '#e6c045',
        primary: '#F2CE5A',
        darkBg: '#121212',
        darkSurface: '#1E1E1E',
        darkCard: '#1E1E1E',
        lightBg: '#F9FAFB',
        dark: '#0F0F0F',
      },
      fontFamily: {
        cairo: ['Cairo', 'sans-serif'],
        inter: ['Inter', 'sans-serif'],
        readex: ['Readex Pro', 'sans-serif'],
      },
      boxShadow: {
        'glow': '0 0 20px rgba(242, 206, 90, 0.15)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-up': 'fadeUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'fade-down': 'fadeDown 0.4s ease forwards',
      },
      keyframes: {
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(15px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeDown: {
          '0%': { opacity: '0', transform: 'translateY(-10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      }
    }
  },
  plugins: [],
}

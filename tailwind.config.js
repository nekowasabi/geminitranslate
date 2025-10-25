/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{ts,tsx}',
    './public/**/*.html',
  ],
  darkMode: 'media', // Enables automatic dark mode based on system preference
  theme: {
    extend: {
      colors: {
        primary: '#3b82f6',    // blue-500
        secondary: '#8b5cf6',  // violet-500
      },
    },
  },
  plugins: [],
};

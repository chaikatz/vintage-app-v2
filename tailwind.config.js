/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        vintage: {
          cream: '#F5F5F0',
          charcoal: '#2C2C2C',
          gold: '#D4AF37',
          orange: '#FF8C00',
          muted: '#666666',
        }
      },
      fontFamily: {
        serif: ['Georgia', 'Times New Roman', 'serif'],
        mono: ['Courier New', 'monospace'],
      },
    },
  },
  plugins: [],
}

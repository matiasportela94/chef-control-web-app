/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{html,ts}",
  ],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        accent:  'var(--accent)',
        'accent-dark': 'var(--accent-dark)',
        bg:      'var(--bg)',
        card:    'var(--bg-card)',
        input:   'var(--bg-input)',
        border:  'var(--border)',
        text1:   'var(--text-1)',
        text2:   'var(--text-2)',
        text3:   'var(--text-3)',
        textnav: 'var(--text-nav)',
        pop:     'var(--pop-bg)',
        poptext: 'var(--pop-text)',
        red:     'var(--red)',
        'red-bg': 'var(--red-bg)',
        // Backward compat — componentes existentes siguen funcionando
        // hasta que los migremos en fases siguientes
        brand: {
          50:  '#fff5f0',
          100: '#ffe8db',
          200: '#ffd0b5',
          300: '#ffae84',
          400: '#ff7d4d',
          500: '#f36525',
          600: '#c04a0a',
          700: '#963808',
          800: '#6e2905',
          900: '#4a1b03',
          950: '#2a1000',
        },
        surface: {
          50:  '#f8f6f4',
          100: '#f5f2ee',
          200: '#ede8e2',
          300: '#d9d0c8',
          400: '#b8aca0',
          500: '#9a9390',
          600: '#6b6560',
          700: '#3d3530',
          800: '#2a2420',
          900: '#1a1210',
          950: '#111214',
        },
        success: {
          400: '#4ade80',
          500: '#22c55e',
          600: '#16a34a',
        },
        warning: {
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
        },
        danger: {
          400: '#f87171',
          500: '#ef4444',
          600: '#dc2626',
        },
      },
      fontFamily: {
        sans:    ['Poppins', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['Poppins', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        'nav':   '9px',
        'badge': '20px',
        'card':  '18px',
        'drawer':'14px',
        'sidebar':'16px',
      },
    },
  },
  plugins: [],
}

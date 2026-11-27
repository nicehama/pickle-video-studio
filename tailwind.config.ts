import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#07080d',
          900: '#0b0d14',
          850: '#10131c',
          800: '#151925',
          700: '#1e2433',
          600: '#2a3245',
          500: '#3a445c',
        },
        lime: { 400: '#c6f24e', 500: '#aee22f' },
      },
      fontFamily: {
        sans: ['Pretendard Variable', 'Pretendard', 'system-ui', 'sans-serif'],
      },
      boxShadow: { glow: '0 0 0 1px rgba(198,242,78,.35), 0 12px 40px -12px rgba(198,242,78,.35)' },
    },
  },
  plugins: [],
};
export default config;

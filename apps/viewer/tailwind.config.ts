import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    container: {
      center: true,
      padding: '1.5rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      colors: {
        // Custom dark palette tuned for monitoring/triage UI.
        bg: {
          DEFAULT: 'hsl(220 13% 6%)',
          raised: 'hsl(220 13% 8%)',
          panel: 'hsl(220 13% 10%)',
          hover: 'hsl(220 13% 13%)',
        },
        border: {
          DEFAULT: 'hsl(220 13% 18%)',
          strong: 'hsl(220 13% 24%)',
        },
        fg: {
          DEFAULT: 'hsl(220 14% 96%)',
          muted: 'hsl(220 10% 64%)',
          subtle: 'hsl(220 10% 46%)',
        },
        accent: {
          DEFAULT: 'hsl(212 100% 67%)',
          fg: 'hsl(220 14% 6%)',
        },
        success: { DEFAULT: 'hsl(151 55% 53%)', fg: 'hsl(220 14% 6%)' },
        danger: { DEFAULT: 'hsl(0 78% 65%)', fg: 'hsl(220 14% 96%)' },
        warn: { DEFAULT: 'hsl(38 92% 56%)', fg: 'hsl(220 14% 6%)' },
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
      },
      animation: {
        'fade-in': 'fade-in 150ms ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;

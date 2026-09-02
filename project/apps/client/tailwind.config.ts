// tailwind.config.ts
import type { Config } from 'tailwindcss'
import defaultTheme from 'tailwindcss/defaultTheme'

export default {
  darkMode: 'class', // enable class‑based dark mode
  content: [
    './src/**/*.{ts,tsx,js,jsx}',
    './src/components/**/*.{ts,tsx,js,jsx}',
    './index.html',
  ],
  theme: {
    extend: {
      colors: {
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        card: 'var(--card)',
        "card-foreground": 'var(--card-foreground)',
        popover: 'var(--popover)',
        "popover-foreground": 'var(--popover-foreground)',
        primary: 'var(--primary)',
        "primary-foreground": 'var(--primary-foreground)',
        secondary: 'var(--secondary)',
        "secondary-foreground": 'var(--secondary-foreground)',
      },
      borderRadius: {
        xl: '1rem',
        lg: '0.75rem',
        md: '0.5rem',
        sm: '0.375rem',
        DEFAULT: '0.5rem',
      },
      boxShadow: {
        sm: '0 1px 2px 0 rgba(0,0,0,0.05)',
        DEFAULT: '0 1px 3px 0 rgba(0,0,0,0.1), 0 1px 2px -1px rgba(0,0,0,0.1)',
        md: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -2px rgba(0,0,0,0.1)',
        lg: '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0).1',
        xl: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -6px rgba(0,0,0,0.1)',
      },
      fontFamily: {
        sans: ['"Inter"', ...defaultTheme.fontFamily.sans],
      },
    },
  },
  plugins: [],
} satisfies Config;

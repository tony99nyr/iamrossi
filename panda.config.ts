import { defineConfig } from '@pandacss/dev';

export default defineConfig({
  // Enable preflight (CSS reset)
  preflight: true,

  // Reduce log noise from ts-evaluator warnings
  logLevel: 'warn',

  // Where to look for your css declarations
  include: ['./src/**/*.{js,jsx,ts,tsx}'],

  // Files to exclude
  // Exclude files with dynamic imports that ts-evaluator can't handle
  exclude: [
    './src/app/api/backup/route.ts',
    './src/lib/transform-calendar-events.ts',
    './src/lib/mhr-service.ts',
  ],

  // Output directory for generated files
  outdir: 'styled-system',

  // Design tokens
  theme: {
    extend: {
      tokens: {
        colors: {
          // GitHub dark mode colors
          github: {
            bg: { value: '#0d1117' },
            bgSecondary: { value: '#0a0a0a' },
            border: { value: '#30363d' },
            borderSubtle: { value: '#21262d' },
            text: { value: '#c9d1d9' },
            textSecondary: { value: '#ededed' },
            link: { value: '#58a6ff' },
          },
          // Admin page gradients
          admin: {
            purple: { value: '#7877c6' },
            purpleDark: { value: '#5e5da8' },
            purpleLight: { value: '#8887d7' },
            purpleLighter: { value: '#6f6eb9' },
            purpleGlow: { value: 'rgba(120, 119, 198, 0.1)' },
            orangeGlow: { value: 'rgba(255, 138, 101, 0.1)' },
          },
          // GameCard badges
          badge: {
            homeStart: { value: '#dc2626' },
            homeEnd: { value: '#991b1b' },
            awayStart: { value: '#6366f1' },
            awayEnd: { value: '#4f46e5' },
          },
        },
        spacing: {
          // Custom spacing if needed
        },
        fonts: {
          github: {
            value: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji'",
          },
        },
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '200% 0' },
          '100%': { backgroundPosition: '-200% 0' },
        },
        slideDown: {
          from: {
            opacity: '0',
            transform: 'translateY(-10px)',
          },
          to: {
            opacity: '1',
            transform: 'translateY(0)',
          },
        },
        fadeIn: {
          from: {
            opacity: '0',
            transform: 'translateY(20px)',
          },
          to: {
            opacity: '1',
            transform: 'translateY(0)',
          },
        },
        slideIn: {
          from: {
            opacity: '0',
            transform: 'translateY(-10px)',
          },
          to: {
            opacity: '1',
            transform: 'translateY(0)',
          },
        },
        shake: {
          '0%, 100%': { transform: 'rotate(0deg)' },
          '25%': { transform: 'rotate(-10deg)' },
          '75%': { transform: 'rotate(10deg)' },
        },
      },
    },
  },

  // Global CSS
  globalCss: {
    ':root': {
      '--background': '#ffffff',
      '--foreground': '#171717',
    },
    '@media (prefers-color-scheme: dark)': {
      ':root': {
        '--background': '#0a0a0a',
        '--foreground': '#ededed',
      },
      html: {
        colorScheme: 'dark',
      },
    },
    'html, body': {
      maxWidth: '100vw',
      overflowX: 'hidden',
    },
    body: {
      color: 'var(--foreground)',
      background: 'var(--background)',
      fontFamily: 'Arial, Helvetica, sans-serif',
      WebkitFontSmoothing: 'antialiased',
      MozOsxFontSmoothing: 'grayscale',
    },
    '*': {
      boxSizing: 'border-box',
      padding: 0,
      margin: 0,
    },
    a: {
      color: 'inherit',
      textDecoration: 'none',
    },
  },

  // Utilities
  utilities: {
    extend: {
      // Add backdrop-filter support
      backdropFilter: {
        values: ['blur(10px)', 'blur(12px)', 'blur(20px)'],
        transform: (value: string) => ({  
          WebkitBackdropFilter: value,
          backdropFilter: value,
        }),
      },
      // Add tap-highlight-color support
      tapHighlightColor: {
        values: ['transparent'],
        transform: (value: string) => ({
          WebkitTapHighlightColor: value,
          tapHighlightColor: value,
        }),
      },
    },
  },

  // Conditions (responsive breakpoints)
  conditions: {
    extend: {
      xlg: '@media (min-width: 1400px)',
      md: '@media (min-width: 768px)',
      sm: '@media (max-width: 768px)',
      xs: '@media (max-width: 480px)',
    },
  },

  // JSX framework
  jsxFramework: 'react',
});

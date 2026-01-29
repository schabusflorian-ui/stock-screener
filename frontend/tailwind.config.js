/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./public/index.html"
  ],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        // Navy Scale (Prism Primary)
        navy: {
          50: '#F8FAFC',
          100: '#F1F5F9',
          200: '#E2E8F0',
          300: '#CBD5E1',
          400: '#94A3B8',
          500: '#64748B',
          600: '#475569',
          700: '#334155',
          800: '#1E293B',
          900: '#0F172A',
        },
        // Gold Scale (Prism Accent)
        gold: {
          50: '#FFFBEB',
          100: '#FEF3C7',
          200: '#FAE9A6',
          300: '#F0D77A',
          400: '#E5C158',
          500: '#D4AF37',
          600: '#B8860B',
          700: '#A67C3D',
          800: '#92400E',
          900: '#78350F',
        },
        // Brand Colors (Navy + Gold)
        brand: {
          primary: '#0F172A',
          'primary-hover': '#1E293B',
          secondary: '#D4AF37',
          accent: '#D4AF37'
        },
        // Semantic Colors (Prism values)
        positive: {
          DEFAULT: '#059669',
          muted: 'rgba(5, 150, 105, 0.1)',
          bg: '#D1FAE5'
        },
        negative: {
          DEFAULT: '#DC2626',
          muted: 'rgba(220, 38, 38, 0.1)',
          bg: '#FEE2E2'
        },
        warning: {
          DEFAULT: '#F59E0B',
          muted: 'rgba(245, 158, 11, 0.1)',
          bg: '#FEF3C7',
          dark: '#D97706'
        },
        info: {
          DEFAULT: '#2563EB',
          muted: 'rgba(37, 99, 235, 0.1)',
          bg: '#DBEAFE'
        },
        // AI Colors
        ai: {
          violet: '#7C3AED',
          blue: '#2563EB',
          cyan: '#0891B2',
        },
        // Text Colors
        text: {
          primary: '#0F172A',
          secondary: '#64748B',
          tertiary: '#94A3B8',
          muted: '#CBD5E1',
          inverse: '#FFFFFF'
        },
        // Background Colors
        surface: {
          primary: '#F8F5EF',
          secondary: '#FFFFFF',
          tertiary: '#F8FAFC',
          muted: '#F1F5F9',
          elevated: '#FFFFFF',
          card: '#FFFFFF'
        },
        // Border Colors
        border: {
          DEFAULT: '#E2E8F0',
          secondary: '#CBD5E1',
          focus: '#0F172A',
          gold: '#D4AF37'
        },
        // Chart Colors (Prism Palette)
        chart: {
          1: '#2563EB',
          2: '#059669',
          3: '#D97706',
          4: '#DC2626',
          5: '#7C3AED',
          6: '#0891B2',
          7: '#DB2777',
          8: '#64748B',
          primary: '#2563EB',
          positive: '#059669',
          negative: '#DC2626'
        }
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'SF Mono', 'Menlo', 'Consolas', 'monospace']
      },
      fontSize: {
        xs: ['11px', { lineHeight: '1rem' }],
        sm: ['12px', { lineHeight: '1.25rem' }],
        base: ['14px', { lineHeight: '1.5rem' }],
        md: ['16px', { lineHeight: '1.5rem' }],
        lg: ['18px', { lineHeight: '1.75rem' }],
        xl: ['20px', { lineHeight: '1.75rem' }],
        '2xl': ['24px', { lineHeight: '2rem' }],
        '3xl': ['28px', { lineHeight: '2.25rem' }],
        '4xl': ['32px', { lineHeight: '2.5rem' }]
      },
      borderRadius: {
        none: '0',
        sm: '4px',
        md: '8px',
        lg: '12px',
        xl: '16px',
        full: '9999px'
      },
      boxShadow: {
        xs: '0 1px 2px rgba(0, 0, 0, 0.05)',
        sm: '0 2px 4px rgba(0, 0, 0, 0.05)',
        md: '0 4px 12px rgba(0, 0, 0, 0.08)',
        lg: '0 8px 24px rgba(0, 0, 0, 0.12)',
        xl: '0 16px 48px rgba(0, 0, 0, 0.16)',
        gold: '0 4px 12px rgba(212, 175, 55, 0.3)',
        'gold-hover': '0 6px 16px rgba(212, 175, 55, 0.4)'
      },
      spacing: {
        sidebar: '240px',
        'sidebar-collapsed': '64px',
        header: '56px',
        // Prism spacing scale (4px base)
        '0': '0',
        '1': '4px',
        '2': '8px',
        '3': '12px',
        '4': '16px',
        '5': '20px',
        '6': '24px',
        '8': '32px',
        '10': '40px',
        '12': '48px',
        '16': '64px'
      },
      maxWidth: {
        content: '1440px'
      },
      zIndex: {
        dropdown: '100',
        sticky: '200',
        'modal-backdrop': '300',
        modal: '400',
        popover: '500',
        tooltip: '600',
        'command-palette': '700'
      },
      transitionDuration: {
        fast: '150ms',
        normal: '200ms',
        slow: '300ms'
      },
      animation: {
        'fade-in': 'fadeIn 200ms ease-out',
        'fade-in-up': 'fadeInUp 200ms ease-out',
        'fade-in-down': 'fadeInDown 200ms ease-out',
        shimmer: 'shimmer 1.5s infinite',
        float: 'float 3s ease-in-out infinite',
        pulse: 'pulse 2s ease-in-out infinite',
        'prism-shimmer': 'prismShimmer 3s linear infinite',
        'prism-pulse': 'prismPulse 2s ease-in-out infinite'
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' }
        },
        fadeInUp: {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'translateY(0)' }
        },
        fadeInDown: {
          from: { opacity: '0', transform: 'translateY(-10px)' },
          to: { opacity: '1', transform: 'translateY(0)' }
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' }
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-8px)' }
        },
        pulse: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' }
        },
        prismShimmer: {
          '0%': { backgroundPosition: '200% 0' },
          '100%': { backgroundPosition: '-200% 0' }
        },
        prismPulse: {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.7', transform: 'scale(0.95)' }
        }
      },
      backgroundImage: {
        'ai-gradient': 'linear-gradient(90deg, #7C3AED 0%, #2563EB 25%, #0891B2 50%, #059669 75%, #D4AF37 100%)',
        'ai-gradient-subtle': 'linear-gradient(90deg, rgba(124, 58, 237, 0.1) 0%, rgba(37, 99, 235, 0.1) 50%, rgba(8, 145, 178, 0.1) 100%)',
        'gold-gradient': 'linear-gradient(135deg, #D4AF37 0%, #B8860B 100%)',
        'navy-gradient': 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
        'warm-cream': 'linear-gradient(180deg, #F8F5EF 0%, #FAF8F4 100%)'
      }
    }
  },
  plugins: []
}

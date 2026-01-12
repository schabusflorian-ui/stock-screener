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
        // Brand Colors
        brand: {
          primary: '#6366f1',
          'primary-hover': '#818cf8',
          secondary: '#8b5cf6',
          accent: '#a78bfa'
        },
        // Semantic Colors
        positive: {
          DEFAULT: '#10b981',
          muted: 'rgba(16, 185, 129, 0.1)'
        },
        negative: {
          DEFAULT: '#ef4444',
          muted: 'rgba(239, 68, 68, 0.1)'
        },
        warning: {
          DEFAULT: '#f59e0b',
          muted: 'rgba(245, 158, 11, 0.1)'
        },
        info: {
          DEFAULT: '#3b82f6',
          muted: 'rgba(59, 130, 246, 0.1)'
        },
        // Text Colors (light mode)
        text: {
          primary: '#374151',
          secondary: '#6b7280',
          tertiary: '#9ca3af',
          muted: '#d1d5db'
        },
        // Glass/Surface Colors
        glass: {
          bg: 'rgba(255, 255, 255, 0.7)',
          'bg-hover': 'rgba(255, 255, 255, 0.85)',
          border: 'rgba(255, 255, 255, 0.5)'
        },
        // Background colors
        surface: {
          primary: '#f5f7fa',
          secondary: 'rgba(255, 255, 255, 0.7)',
          tertiary: 'rgba(255, 255, 255, 0.5)',
          elevated: 'rgba(255, 255, 255, 0.85)',
          hover: 'rgba(255, 255, 255, 0.9)',
          active: 'rgba(99, 102, 241, 0.08)'
        },
        // Border Colors
        border: {
          DEFAULT: 'rgba(0, 0, 0, 0.06)',
          secondary: 'rgba(0, 0, 0, 0.1)',
          focus: '#6366f1'
        },
        // Chart Colors
        chart: {
          1: '#6366f1',
          2: '#8b5cf6',
          3: '#ec4899',
          4: '#f59e0b',
          5: '#10b981',
          6: '#3b82f6'
        },
        // Snowflake Dimensions
        snowflake: {
          value: '#6366f1',
          growth: '#10b981',
          past: '#f59e0b',
          health: '#3b82f6',
          dividend: '#ec4899'
        }
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'SF Mono', 'Consolas', 'monospace']
      },
      fontSize: {
        xs: ['0.75rem', { lineHeight: '1rem' }],           // 12px
        sm: ['0.8125rem', { lineHeight: '1.25rem' }],      // 13px
        base: ['0.875rem', { lineHeight: '1.5rem' }],      // 14px
        md: ['1rem', { lineHeight: '1.5rem' }],            // 16px
        lg: ['1.125rem', { lineHeight: '1.75rem' }],       // 18px
        xl: ['1.25rem', { lineHeight: '1.75rem' }],        // 20px
        '2xl': ['1.5rem', { lineHeight: '2rem' }],         // 24px
        '3xl': ['1.875rem', { lineHeight: '2.25rem' }],    // 30px
        '4xl': ['2.25rem', { lineHeight: '2.5rem' }]       // 36px
      },
      borderRadius: {
        sm: '0.375rem',    // 6px
        md: '0.5rem',      // 8px
        lg: '0.75rem',     // 12px
        xl: '1rem',        // 16px
        '2xl': '1.5rem',   // 24px
        glass: '1.5rem'    // 24px (for glass cards)
      },
      boxShadow: {
        sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        md: '0 4px 6px -1px rgba(0, 0, 0, 0.07), 0 2px 4px -2px rgba(0, 0, 0, 0.05)',
        lg: '0 10px 15px -3px rgba(0, 0, 0, 0.08), 0 4px 6px -4px rgba(0, 0, 0, 0.05)',
        xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.05)',
        glass: '0 8px 32px rgba(0, 0, 0, 0.08)',
        'glass-hover': '0 12px 40px rgba(0, 0, 0, 0.12)',
        glow: '0 0 20px rgba(99, 102, 241, 0.2)'
      },
      backdropBlur: {
        glass: '20px'
      },
      spacing: {
        sidebar: '240px',
        'sidebar-collapsed': '64px',
        header: '56px'
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
        pulse: 'pulse 2s ease-in-out infinite'
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
        }
      }
    }
  },
  plugins: []
}

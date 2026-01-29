// frontend/src/components/icons/iconColors.js
// Prism Design System - Icon Color Presets
// Based on prism-icons-pastel-hover.jsx design specification

/**
 * Color presets for icon categories
 * Each preset includes:
 * - color: Solid background color (default state)
 * - pastel: Light background color (hover state)
 * - dark: Dark text/icon color (hover state)
 */
export const iconColors = {
  analytics: {
    color: '#2563EB',   // Blue
    pastel: '#DBEAFE',
    dark: '#1D4ED8'
  },
  risk: {
    color: '#D97706',   // Orange/Amber
    pastel: '#FEF3C7',
    dark: '#B45309'
  },
  ai: {
    color: '#7C3AED',   // Violet
    pastel: '#EDE9FE',
    dark: '#6D28D9'
  },
  growth: {
    color: '#059669',   // Emerald/Green
    pastel: '#D1FAE5',
    dark: '#047857'
  },
  decline: {
    color: '#DC2626',   // Red
    pastel: '#FEE2E2',
    dark: '#B91C1C'
  },
  watchlist: {
    color: '#0891B2',   // Cyan
    pastel: '#CFFAFE',
    dark: '#0E7490'
  },
  alerts: {
    color: '#DC2626',   // Red
    pastel: '#FEE2E2',
    dark: '#B91C1C'
  },
  portfolio: {
    color: '#059669',   // Emerald
    pastel: '#D1FAE5',
    dark: '#047857'
  },
  brand: {
    color: '#0F172A',   // Navy
    pastel: '#FBF8F1',  // Warm cream
    dark: '#A67C3D'     // Gold
  },
  navigation: {
    color: '#64748B',   // Slate
    pastel: '#F1F5F9',
    dark: '#374151'
  },
  default: {
    color: '#64748B',   // Slate
    pastel: '#F1F5F9',
    dark: '#374151'
  }
};

/**
 * Map icon names to their semantic color categories
 */
export const iconCategoryMap = {
  // Analytics & Charts
  LineChart: 'analytics',
  BarChart2: 'analytics',
  BarChart3: 'analytics',
  PieChart: 'analytics',
  Activity: 'analytics',
  Target: 'analytics',
  Percent: 'analytics',
  Hash: 'analytics',

  // Risk & Security
  Shield: 'risk',
  AlertTriangle: 'risk',
  AlertOctagon: 'risk',
  Lock: 'risk',

  // AI & Intelligence
  Brain: 'ai',
  Bot: 'ai',
  PrismSparkle: 'ai',
  Sparkles: 'ai',
  Lightbulb: 'ai',

  // Growth & Positive
  TrendingUp: 'growth',
  ArrowUpRight: 'growth',
  CheckCircle: 'growth',
  CheckCircle2: 'growth',
  Check: 'growth',

  // Decline & Negative
  TrendingDown: 'decline',
  ArrowDownRight: 'decline',
  XCircle: 'decline',

  // Watchlist & Observation
  Eye: 'watchlist',
  Star: 'watchlist',
  Bookmark: 'watchlist',

  // Alerts & Notifications
  Bell: 'alerts',
  BellOff: 'alerts',
  AlertCircle: 'alerts',
  Info: 'alerts',

  // Portfolio & Finance
  Wallet: 'portfolio',
  Briefcase: 'portfolio',
  DollarSign: 'portfolio',
  Banknote: 'portfolio',
  Scale: 'portfolio',
  Receipt: 'portfolio',

  // Navigation
  Home: 'navigation',
  Settings: 'navigation',
  Search: 'navigation',
  Menu: 'navigation',
  ChevronLeft: 'navigation',
  ChevronRight: 'navigation',
  ChevronUp: 'navigation',
  ChevronDown: 'navigation',
  ArrowLeft: 'navigation',
  ArrowRight: 'navigation',
};

/**
 * Get color preset for an icon by name
 * @param {string} iconName - The name of the icon
 * @returns {object} Color preset object with color, pastel, dark
 */
export const getIconColors = (iconName) => {
  const category = iconCategoryMap[iconName] || 'default';
  return iconColors[category];
};

/**
 * Gradient presets for premium/brand elements
 */
export const gradientPresets = {
  analytics: ['#3B82F6', '#1D4ED8'],
  risk: ['#F59E0B', '#D97706'],
  ai: ['#8B5CF6', '#6D28D9'],
  growth: ['#10B981', '#059669'],
  watchlist: ['#06B6D4', '#0891B2'],
  brand: ['#0F172A', '#1E293B'],
  prismatic: ['#7C3AED', '#2563EB', '#0891B2', '#059669', '#D4AF37']
};

export default iconColors;

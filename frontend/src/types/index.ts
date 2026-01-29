/**
 * TypeScript type definitions for the Investment Research Platform
 *
 * These types mirror the PropTypes definitions and API response shapes
 * for gradual TypeScript adoption.
 */

// ============================================================================
// Core Entity Types
// ============================================================================

export interface Company {
  id?: number;
  symbol: string;
  name?: string;
  sector?: string;
  industry?: string;
  cik?: string;
  sic_code?: string;
  fiscal_year_end?: string;
}

export interface PriceData {
  date: string;
  open?: number;
  high?: number;
  low?: number;
  close: number;
  volume?: number;
}

export interface Metrics {
  period?: string;
  roic?: number;
  roe?: number;
  fcf_yield?: number;
  pe_ratio?: number;
  net_margin?: number;
  operating_margin?: number;
  debt_to_equity?: number;
  current_ratio?: number;
}

// ============================================================================
// Analysis Types
// ============================================================================

export interface Sentiment {
  signal?: string;
  score?: number;
  weighted_sentiment?: number;
  post_count?: number;
  positive_count?: number;
  negative_count?: number;
  neutral_count?: number;
}

export interface AnalystData {
  recommendation?: string;
  targetPrice?: number;
  currentPrice?: number;
  upside?: number;
  buyPercent?: number;
  holdPercent?: number;
  sellPercent?: number;
  totalAnalysts?: number;
}

export interface InsiderTransaction {
  id?: number;
  insider_name?: string;
  insider_title?: string;
  transaction_type?: string;
  transaction_date?: string;
  shares?: number;
  price_per_share?: number;
  total_value?: number;
}

export interface DividendData {
  annual_dividend?: number;
  dividend_yield?: number;
  payout_ratio?: number;
  dividend_growth_5y?: number;
  years_of_growth?: number;
  ex_date?: string;
  payment_date?: string;
}

// ============================================================================
// Valuation Types
// ============================================================================

export interface DCFAssumptions {
  discount_rate?: number;
  terminal_growth?: number;
  growth_rate?: number;
}

export interface DCFValuation {
  intrinsic_value?: number;
  current_price?: number;
  upside?: number;
  margin_of_safety?: number;
  assumptions?: DCFAssumptions;
}

// ============================================================================
// Portfolio Types
// ============================================================================

export interface Portfolio {
  id: number;
  name: string;
  description?: string;
  cash_balance?: number;
  total_value?: number;
  created_at?: string;
}

export interface Holding {
  id?: number;
  symbol: string;
  shares: number;
  avg_cost?: number;
  current_price?: number;
  market_value?: number;
  gain_loss?: number;
  gain_loss_pct?: number;
}

// ============================================================================
// Enums and Constants
// ============================================================================

export type TimePeriod = '1d' | '5d' | '1w' | '1m' | '3m' | '6m' | '1y' | '2y' | '5y' | 'ytd' | 'max';

export type SortDirection = 'asc' | 'desc' | 'ASC' | 'DESC';

export type PeriodType = 'annual' | 'quarterly' | 'ttm';

// ============================================================================
// API Response Types
// ============================================================================

export interface ApiResponse<T> {
  data: T;
  status: number;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ErrorResponse {
  error: string;
  message: string;
  statusCode: number;
}

// ============================================================================
// Sector & Industry Types
// ============================================================================

export interface Sector {
  name: string;
  company_count?: number;
  avg_roic?: number;
  avg_roe?: number;
  avg_pe_ratio?: number;
  avg_net_margin?: number;
}

export interface Industry {
  name: string;
  sector?: string;
  company_count?: number;
  avg_roic?: number;
  avg_roe?: number;
}

// ============================================================================
// Screening Types
// ============================================================================

export interface ScreeningCriteria {
  metric: string;
  operator: 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'between';
  value: number | [number, number];
}

export interface ScreeningResult {
  symbol: string;
  name?: string;
  sector?: string;
  industry?: string;
  metrics: Record<string, number>;
  score?: number;
}

// ============================================================================
// Chart Types
// ============================================================================

export interface ChartDataPoint {
  date: string;
  value: number;
  label?: string;
}

export interface ChartSeries {
  name: string;
  data: ChartDataPoint[];
  color?: string;
}

// ============================================================================
// Factor Analysis Types
// ============================================================================

export interface FactorExposure {
  factor: string;
  exposure: number;
  benchmark?: number;
  active?: number;
}

export interface FactorReturn {
  factor: string;
  return_1m?: number;
  return_3m?: number;
  return_ytd?: number;
  return_1y?: number;
}

// ============================================================================
// Context Types
// ============================================================================

export interface AuthContextValue {
  isAuthenticated: boolean;
  isAdmin: boolean;
  user?: {
    id: number;
    email: string;
    name?: string;
  };
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  checkAuth: () => Promise<boolean>;
}

export interface PreferencesContextValue {
  currency: string;
  locale: string;
  theme: 'light' | 'dark' | 'system';
  setCurrency: (currency: string) => void;
  setLocale: (locale: string) => void;
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
}

// ============================================================================
// Component Props Types
// ============================================================================

export interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  type?: 'button' | 'submit' | 'reset';
}

export interface CardProps {
  children: React.ReactNode;
  className?: string;
  interactive?: boolean;
  onClick?: () => void;
}

export interface BadgeProps {
  variant?: 'positive' | 'negative' | 'warning' | 'info' | 'neutral';
  children: React.ReactNode;
  className?: string;
}

export interface TableColumn<T> {
  key: keyof T | string;
  header: string;
  render?: (row: T) => React.ReactNode;
  sortable?: boolean;
  width?: string;
  align?: 'left' | 'center' | 'right';
}

export interface TableProps<T> {
  columns: TableColumn<T>[];
  data: T[];
  loading?: boolean;
  emptyMessage?: string;
  onRowClick?: (row: T) => void;
  sortColumn?: string;
  sortDirection?: SortDirection;
  onSort?: (column: string) => void;
}

// ============================================================================
// Hook Types
// ============================================================================

export interface UseApiResult<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export interface UseAsyncResult<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  execute: (...args: unknown[]) => Promise<T>;
}

// ============================================================================
// Utility Types
// ============================================================================

export type Nullable<T> = T | null;

export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

// Re-export React types for convenience
export type { ReactNode, FC, ComponentProps } from 'react';

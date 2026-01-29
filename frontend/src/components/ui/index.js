// frontend/src/components/ui/index.js

/**
 * UI Component Library
 *
 * Consistent, reusable UI components following the design system.
 * Import from this barrel file for cleaner imports:
 *
 *   import { Card, Button, Badge, Grid } from '../components/ui';
 *
 * All components use CSS variables from design-system.css and
 * follow the same patterns for variants, sizes, and responsive behavior.
 */

// Layout Components
export { default as Card } from './Card';
export { default as Grid } from './Grid';
export { default as Section } from './Section';
export { default as StandardPage } from './StandardPage';

// Display Components
export { default as PageHeader } from './PageHeader';
export { default as DataCard } from './DataCard';
export { default as EmptyState } from './EmptyState';
export { default as Table } from './Table';
export { default as VirtualizedTable } from './VirtualizedTable';

// Feedback Components
export { default as Badge } from './Badge';
export { default as Callout } from './Callout';

// Action Components
export { default as Button } from './Button';

// Typography Components
export { Heading, Text, Label, MonoNumber } from './Typography';

# Design System Validation Prompt

Use this prompt to validate that the Prism Design System has been properly applied to a component or page.

---

## Validation Checklist for: [COMPONENT/PAGE NAME]

### Step 1: File Inventory
Before validating, identify ALL files related to this component:

```
Files to check:
- [ ] Main CSS file: ____________________
- [ ] Component JS/JSX file: ____________________
- [ ] Child component CSS files: ____________________
- [ ] Child component JS files: ____________________
- [ ] Chart/visualization components used: ____________________
```

### Step 2: CSS Token Validation

For each CSS file, search for and flag these anti-patterns:

#### 2.1 Hardcoded Colors (MUST FIX)
```bash
# Search for hardcoded hex colors
grep -E '#[0-9A-Fa-f]{3,6}' [filename].css

# Search for hardcoded rgba values
grep -E 'rgba?\([^)]+\)' [filename].css
```

**Expected replacements:**
| Hardcoded Pattern | Prism Token |
|-------------------|-------------|
| `#7C3AED`, `#8B5CF6` | `var(--color-ai-violet)` or `var(--brand-primary)` |
| `#059669`, `#10B981` | `var(--positive)` |
| `#DC2626`, `#EF4444` | `var(--negative)` |
| `#F59E0B`, `#D97706` | `var(--warning)` |
| `#3B82F6`, `#2563EB` | `var(--info)` |
| `rgba(255,255,255,0.7)` | `var(--glass-bg)` |
| `rgba(0,0,0,0.06)` | `var(--border-primary)` |
| `white`, `#fff`, `#ffffff` | `var(--bg-primary)` or `var(--text-inverse)` |
| `#1a1a2e`, `#16213e` | `var(--bg-primary)` (dark mode) |

#### 2.2 Hardcoded Spacing (SHOULD FIX)
```bash
# Search for pixel values that should be tokens
grep -E '(padding|margin|gap):\s*\d+px' [filename].css
```

**Expected replacements:**
| Hardcoded | Prism Token |
|-----------|-------------|
| `4px` | `var(--space-1)` |
| `8px` | `var(--space-2)` |
| `12px` | `var(--space-3)` |
| `16px` / `1rem` | `var(--space-4)` |
| `20px` | `var(--space-5)` |
| `24px` / `1.5rem` | `var(--space-6)` |
| `32px` / `2rem` | `var(--space-8)` |

#### 2.3 Hardcoded Typography (SHOULD FIX)
```bash
# Search for font-weight numbers
grep -E 'font-weight:\s*[0-9]+' [filename].css

# Search for hardcoded font-sizes
grep -E 'font-size:\s*[0-9]+(\.[0-9]+)?(px|rem)' [filename].css
```

**Expected replacements:**
| Hardcoded | Prism Token |
|-----------|-------------|
| `font-weight: 400` | `var(--font-normal)` |
| `font-weight: 500` | `var(--font-medium)` |
| `font-weight: 600` | `var(--font-semibold)` |
| `font-weight: 700` | `var(--font-bold)` |
| `0.75rem` | `var(--text-xs)` |
| `0.8125rem` | `var(--text-sm)` |
| `0.875rem` | `var(--text-base)` |
| `1rem` | `var(--text-md)` |
| `1.125rem` | `var(--text-lg)` |

#### 2.4 Hardcoded Transitions (SHOULD FIX)
```bash
grep -E 'transition:\s*[^;]*[0-9]+(\.[0-9]+)?s' [filename].css
```

**Expected:** Use `var(--transition-fast)`, `var(--transition-normal)`, or `var(--transition-slow)`

#### 2.5 Hardcoded Border Radius (SHOULD FIX)
```bash
grep -E 'border-radius:\s*[0-9]+px' [filename].css
```

**Expected:** Use `var(--radius-sm)`, `var(--radius-md)`, `var(--radius-lg)`, `var(--radius-xl)`

---

### Step 3: JavaScript/JSX Inline Style Validation

For each JS/JSX file, search for inline styles:

```bash
# Search for style={{ patterns
grep -E 'style=\{\{' [filename].js [filename].jsx

# Search for style objects
grep -E "style:\s*\{" [filename].js

# Search for hardcoded colors in JS
grep -E "(color|background|border).*['\"]#" [filename].js
```

**Common issues to fix:**
- Inline `style={{ color: '#7C3AED' }}` → Use CSS class with token
- Inline `style={{ padding: '16px' }}` → Use CSS class with token
- Dynamic styles with hardcoded values → Pass CSS variable via inline style

---

### Step 4: Chart/Visualization Theming Validation

For any charts (Recharts, Chart.js, D3, etc.), check:

#### 4.1 Recharts Components
```bash
# Search for hardcoded colors in chart props
grep -E "(stroke|fill)=['\"]#" [filename].js
grep -E "colors=\[" [filename].js
```

**Expected pattern for Recharts:**
```jsx
// Get CSS variable value for charts
const getChartColor = (varName) =>
  getComputedStyle(document.documentElement).getPropertyValue(varName).trim();

// Usage
<Line stroke={getChartColor('--brand-primary')} />
<Bar fill={getChartColor('--positive')} />
```

#### 4.2 Chart Color Arrays
Search for color arrays like:
```javascript
const COLORS = ['#8884d8', '#82ca9d', '#ffc658'];
```

**Should be:**
```javascript
const COLORS = [
  'var(--brand-primary)',
  'var(--positive)',
  'var(--warning)'
];
// Or use getComputedStyle for libraries that don't support CSS vars
```

#### 4.3 Axis and Grid Styling
```bash
grep -E "(axisLine|tickLine|gridLine)" [filename].js
```

Check that axis colors use `var(--text-tertiary)` or `var(--border-primary)`

---

### Step 5: Component State Validation

Check that all interactive states use design tokens:

#### 5.1 Hover States
```bash
grep -E ':hover' [filename].css
```

Verify hover states use:
- `var(--brand-primary-hover)` for primary actions
- `var(--bg-hover)` for backgrounds
- `var(--shadow-gold)` for premium/gold hover effects

#### 5.2 Focus States
```bash
grep -E ':focus' [filename].css
```

Verify focus states include proper outline using brand colors.

#### 5.3 Active/Selected States
```bash
grep -E '(\.active|\.selected|:active)' [filename].css
```

Verify consistent use of `var(--brand-primary)` for selected states.

#### 5.4 Disabled States
```bash
grep -E '(\.disabled|:disabled)' [filename].css
```

Verify disabled states use `opacity` or `var(--text-tertiary)`.

---

### Step 6: Dark Mode Validation

#### 6.1 Check for dark mode media query
```bash
grep -E '@media.*prefers-color-scheme.*dark' [filename].css
```

#### 6.2 Within dark mode blocks, verify:
- No hardcoded light-mode colors
- Proper use of semantic tokens that auto-switch
- Background/text contrast is maintained

---

### Step 7: Responsive Design Validation

```bash
grep -E '@media.*max-width' [filename].css
```

Within media queries, verify:
- Spacing tokens are adjusted appropriately
- Typography sizes remain tokenized
- No hardcoded values introduced for mobile

---

### Step 8: Semantic HTML & Accessibility

Check that semantic patterns use appropriate tokens:

| Element | Expected Pattern |
|---------|------------------|
| Headings (h1-h6) | `color: var(--text-primary)`, appropriate `--text-*` size |
| Body text | `color: var(--text-secondary)` or `var(--text-primary)` |
| Muted/helper text | `color: var(--text-tertiary)` |
| Links | `color: var(--brand-primary)` |
| Error messages | `color: var(--negative)` |
| Success messages | `color: var(--positive)` |
| Warning messages | `color: var(--warning)` |
| Info messages | `color: var(--info)` |

---

## Validation Report Template

After running the validation, fill out this report:

```
## Validation Report: [COMPONENT/PAGE NAME]
Date: [DATE]
Validated by: [AGENT NAME]

### Files Validated
- [x] [filename.css] - [X issues found]
- [x] [filename.js] - [X issues found]

### Critical Issues (Hardcoded Colors)
1. [file:line] - `#7C3AED` should be `var(--brand-primary)`
2. [file:line] - `rgba(0,0,0,0.1)` should be `var(--border-primary)`

### Medium Issues (Spacing/Typography)
1. [file:line] - `padding: 16px` should be `var(--space-4)`
2. [file:line] - `font-weight: 600` should be `var(--font-semibold)`

### Chart Theming Issues
1. [file:line] - Chart uses hardcoded color array
2. [file:line] - Axis styling not using design tokens

### Missing State Styles
1. [component] - Missing hover state
2. [component] - Focus state uses hardcoded outline color

### Dark Mode Issues
1. [file:line] - Dark mode override uses hardcoded color

### Estimated Completion: [X]%
```

---

## Quick Validation Commands

Run these commands from the frontend/src directory to get a quick overview:

```bash
# Count hardcoded hex colors in a specific directory
grep -r '#[0-9A-Fa-f]\{6\}' ./pages/[PageName]*.css | wc -l

# Count hardcoded rgba in a specific directory
grep -r 'rgba(' ./pages/[PageName]*.css | wc -l

# Find all chart-related files that may need theming
find . -name "*.js" -exec grep -l "Recharts\|Chart\|<Line\|<Bar\|<Area" {} \;

# Count inline styles in JS files
grep -r 'style={{' ./components/ ./pages/ | wc -l
```

---

## Common Gotchas

1. **Third-party library styles**: Some libraries inject their own styles. Check if theme configuration is available.

2. **CSS-in-JS**: If using styled-components or emotion, search for template literals with hardcoded values.

3. **SVG colors**: Check `fill` and `stroke` attributes on inline SVGs.

4. **Canvas elements**: Chart.js and similar libraries render to canvas - colors must be passed as JS values, not CSS vars (use `getComputedStyle`).

5. **Pseudo-elements**: `::before` and `::after` content often has hardcoded colors for icons/decorations.

6. **Box shadows**: Complex shadows often have hardcoded rgba values - use `var(--glass-shadow)` or defined shadow tokens.

7. **Gradients**: Linear/radial gradients often contain hardcoded color stops.

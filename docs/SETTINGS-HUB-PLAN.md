# Settings & Support Hub - Implementation Plan

## Overview

Build a centralized Settings page that gives users visibility into system health, data freshness, and configuration options. The design will be clean and simple with status indicators for quick scanning.

## Key Adaptations from Spec

The specification was written for a Next.js + PostgreSQL stack. This project uses:
- **Backend**: Express.js with SQLite (better-sqlite3)
- **Frontend**: React 19 with React Router
- **State Management**: React Context + localStorage (no React Query)
- **API Pattern**: RESTful routes in `src/api/routes/`

I'll adapt the implementation accordingly while preserving the functionality.

---

## Implementation Tasks

### Phase 1: Database Schema (Migration)

**File**: `src/database-migrations/add-settings-tables.js`

Create SQLite tables adapted from the PostgreSQL spec:

1. **system_settings** - Key-value store for app configuration
2. **update_schedules** - Managed update job definitions with status tracking
3. **update_history** - Log of all update runs
4. **api_integrations** - API keys and usage tracking
5. **user_preferences** - User display/behavior preferences
6. **diagnostic_logs** - System logs for troubleshooting

Key SQLite adaptations:
- Use `INTEGER` instead of `SERIAL` for auto-increment
- Use `TEXT` instead of `JSONB` (store as JSON strings)
- Use `DATETIME DEFAULT CURRENT_TIMESTAMP` instead of `NOW()`
- No `INTERVAL` syntax - use date functions instead

---

### Phase 2: Backend Service

**File**: `src/services/settingsService.js`

Implement the settings service with these methods:

**Update Schedules:**
- `getUpdateSchedules()` - List all update schedules with status
- `toggleUpdateSchedule(name, enabled)` - Enable/disable a schedule
- `getUpdateHistory(scheduleName?, limit)` - Get run history
- `recordUpdateStart(name)` - Mark update as running
- `recordUpdateComplete(name, stats)` - Mark update complete with stats
- `recordUpdateFailure(name, error)` - Mark update as failed

**API Integrations:**
- `getApiIntegrations()` - List all integrations (keys masked)
- `updateApiKey(name, apiKey)` - Store encrypted API key
- `testApiConnection(name)` - Test if API is working
- `recordApiCall(name)` - Increment usage counters
- `resetDailyUsage()` - Reset daily counters (run at midnight)

**Data Health:**
- `generateDataHealthReport()` - Check data freshness across tables
- `runHealthCheck()` - Quick system health check

**User Preferences:**
- `getUserPreferences(userId)` - Get user preferences
- `updateUserPreferences(userId, prefs)` - Update preferences

**Database Stats:**
- `getDatabaseStats()` - Get table sizes and row counts

**Diagnostics:**
- `log(level, category, message, details)` - Add log entry
- `getLogs(options)` - Query logs with filters
- `cleanupOldLogs(daysToKeep)` - Remove old entries

---

### Phase 3: API Routes

**File**: `src/api/routes/settings.js`

RESTful endpoints following existing project patterns:

```
GET    /api/settings/updates              - List update schedules
PATCH  /api/settings/updates/:name        - Toggle schedule enabled
GET    /api/settings/updates/history      - Get update history

GET    /api/settings/data-health          - Generate health report
GET    /api/settings/health               - Quick health check

GET    /api/settings/integrations         - List API integrations
PATCH  /api/settings/integrations/:name   - Update API key
POST   /api/settings/integrations/:name/test - Test connection

GET    /api/settings/preferences          - Get user preferences
PATCH  /api/settings/preferences          - Update preferences

GET    /api/settings/database             - Get database stats
GET    /api/settings/diagnostics          - Get system diagnostics
GET    /api/settings/logs                 - Query diagnostic logs
```

---

### Phase 4: Frontend - Settings Page Structure

**File**: `frontend/src/pages/settings/SettingsPage.js`

Main settings page with tabbed navigation:
- Updates tab (default)
- Data Health tab
- Integrations tab
- Database tab
- Preferences tab
- Support tab

Use React state for tab switching (no nested routing needed for this scope).

**File**: `frontend/src/pages/settings/SettingsPage.css`

Styling following the project's design system:
- Use CSS variables from `design-system.css`
- Status indicator colors (green/yellow/red)
- Toggle switches
- Card-based layout

---

### Phase 5: Frontend Components

#### 5.1 Update Dashboard Tab
**File**: `frontend/src/components/settings/UpdateDashboard.js`

- List of update schedules with status dots
- Toggle switches to enable/disable
- Last run time in human-readable format ("2 hours ago")
- Error messages for failed updates
- Auto-refresh every 30 seconds

#### 5.2 Data Health Tab
**File**: `frontend/src/components/settings/DataHealthReport.js`

- Overall status banner (healthy/warning/critical)
- List of health metrics with status icons
- Value vs threshold display
- Refresh button

#### 5.3 Integrations Tab
**File**: `frontend/src/components/settings/IntegrationsPanel.js`

- List of API integrations
- Status badges (connected/error/rate_limited)
- Usage counters (calls today/month)
- API key update form (modal or inline)
- Test connection button

#### 5.4 Database Tab
**File**: `frontend/src/components/settings/DatabaseStats.js`

- Total database size
- Table breakdown with row counts and sizes
- Simple table view

#### 5.5 Preferences Tab
**File**: `frontend/src/components/settings/PreferencesForm.js`

- Theme selector (light/dark/system)
- Default benchmark dropdown
- Number format toggle (compact/full)
- Notification toggles

#### 5.6 Support Tab
**File**: `frontend/src/components/settings/SupportPanel.js`

- System diagnostics display
- Recent error logs
- App version and environment info
- Export diagnostics button

---

### Phase 6: API Client Updates

**File**: `frontend/src/services/api.js`

Add `settingsAPI` object:

```javascript
export const settingsAPI = {
  // Updates
  getUpdateSchedules: () => api.get('/settings/updates'),
  toggleSchedule: (name, enabled) => api.patch(`/settings/updates/${name}`, { enabled }),
  getUpdateHistory: (schedule, limit) => api.get('/settings/updates/history', { params: { schedule, limit } }),

  // Data Health
  getDataHealth: () => api.get('/settings/data-health'),
  getHealth: () => api.get('/settings/health'),

  // Integrations
  getIntegrations: () => api.get('/settings/integrations'),
  updateApiKey: (name, apiKey) => api.patch(`/settings/integrations/${name}`, { apiKey }),
  testConnection: (name) => api.post(`/settings/integrations/${name}/test`),

  // Preferences
  getPreferences: () => api.get('/settings/preferences'),
  updatePreferences: (prefs) => api.patch('/settings/preferences', prefs),

  // Database & Diagnostics
  getDatabaseStats: () => api.get('/settings/database'),
  getDiagnostics: () => api.get('/settings/diagnostics'),
  getLogs: (options) => api.get('/settings/logs', { params: options })
};
```

---

### Phase 7: Integration with Existing Jobs

Update existing scheduled jobs to record their runs:

1. **src/jobs/masterScheduler.js** - If exists, integrate with update_schedules table
2. **src/jobs/priceUpdates.js** or similar - Record start/complete/failure
3. **src/jobs/secDirectRefresh.js** - Record update status

This allows the settings page to show real status from actual jobs.

---

### Phase 8: App.js Integration

**File**: `frontend/src/App.js`

Replace the placeholder `SettingsPage` with the new implementation:
- Lazy load the settings page
- Keep existing route `/settings`

---

## File Summary

### New Files to Create

| File | Purpose |
|------|---------|
| `src/database-migrations/add-settings-tables.js` | Database migration |
| `src/services/settingsService.js` | Backend service layer |
| `src/api/routes/settings.js` | API endpoints |
| `frontend/src/pages/settings/SettingsPage.js` | Main settings page |
| `frontend/src/pages/settings/SettingsPage.css` | Settings page styles |
| `frontend/src/components/settings/UpdateDashboard.js` | Updates tab |
| `frontend/src/components/settings/DataHealthReport.js` | Health tab |
| `frontend/src/components/settings/IntegrationsPanel.js` | Integrations tab |
| `frontend/src/components/settings/DatabaseStats.js` | Database tab |
| `frontend/src/components/settings/PreferencesForm.js` | Preferences tab |
| `frontend/src/components/settings/SupportPanel.js` | Support tab |

### Files to Modify

| File | Changes |
|------|---------|
| `src/api/server.js` | Add settings router |
| `frontend/src/App.js` | Replace settings page placeholder |
| `frontend/src/services/api.js` | Add settingsAPI |

---

## Scope Decisions

### Included
- All 6 settings tabs with full functionality
- Database schema and seed data
- Backend service and API routes
- Frontend components with styling
- Integration with existing health endpoint

### Deferred (can add later)
- API key encryption (store as plain text initially, add encryption service later)
- Email notifications (UI present but backend not connected)
- Actual job integration (UI shows seed data until jobs are updated)
- Log cleanup cron job

---

## Execution Order

1. Run database migration to create tables and seed data
2. Create settings service
3. Create API routes and register in server.js
4. Add settingsAPI to frontend
5. Create frontend components (settings page + tabs)
6. Update App.js to use new settings page
7. Test all tabs
8. (Optional) Integrate with existing jobs

---

## Estimated Complexity

- **Migration**: Simple - standard SQLite table creation
- **Service**: Medium - multiple methods but straightforward queries
- **API Routes**: Simple - CRUD operations
- **Frontend**: Medium - multiple components but reusable patterns
- **Integration**: Simple - one-line import and route registration

Total: ~800-1000 lines of new code across all files.

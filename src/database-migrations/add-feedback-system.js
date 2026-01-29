/**
 * Database migration: Feedback System Tables
 *
 * Creates tables for user feedback collection, support requests,
 * and help article management.
 */

const { getDb, tableExists, columnExists, safeAddColumn } = require('./_migrationHelper');

const db = getDb();

// Helper to check if table exists

// Helper to check if index exists
function indexExists(indexName) {
  const result = db.prepare(`
    SELECT name FROM sqlite_master
    WHERE type='index' AND name=?
  `).get(indexName);
  return !!result;
}

console.log('Creating user_feedback table...');

// Create user_feedback table
db.exec(`
  CREATE TABLE IF NOT EXISTS user_feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    -- Source
    user_id TEXT,
    session_id TEXT,

    -- Feedback type
    feedback_type TEXT NOT NULL,

    -- Content
    rating INTEGER,
    sentiment TEXT,
    category TEXT,

    -- Details
    message TEXT,

    -- Context
    page TEXT,
    feature TEXT,
    related_content_id TEXT,

    -- Metadata (JSON: browser, device, error logs if permitted)
    metadata TEXT DEFAULT '{}',

    -- Status tracking
    status TEXT DEFAULT 'new',
    resolved_at DATETIME,
    resolved_by TEXT,
    resolution_notes TEXT,

    -- Admin notes
    internal_notes TEXT,
    priority INTEGER DEFAULT 3,
    tags TEXT DEFAULT '[]',

    -- Timestamps
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    -- Foreign keys
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (resolved_by) REFERENCES users(id) ON DELETE SET NULL
  )
`);

if (!indexExists('idx_feedback_status')) {
  db.exec('CREATE INDEX idx_feedback_status ON user_feedback(status)');
}

if (!indexExists('idx_feedback_type')) {
  db.exec('CREATE INDEX idx_feedback_type ON user_feedback(feedback_type)');
}

if (!indexExists('idx_feedback_category')) {
  db.exec('CREATE INDEX idx_feedback_category ON user_feedback(category)');
}

if (!indexExists('idx_feedback_created')) {
  db.exec('CREATE INDEX idx_feedback_created ON user_feedback(created_at)');
}

if (!indexExists('idx_feedback_user')) {
  db.exec('CREATE INDEX idx_feedback_user ON user_feedback(user_id)');
}

if (!indexExists('idx_feedback_feature')) {
  db.exec('CREATE INDEX idx_feedback_feature ON user_feedback(feature)');
}

if (!indexExists('idx_feedback_priority')) {
  db.exec('CREATE INDEX idx_feedback_priority ON user_feedback(priority)');
}

console.log('Creating quick_feedback table...');

// Create quick_feedback table for thumbs up/down reactions
db.exec(`
  CREATE TABLE IF NOT EXISTS quick_feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    -- Source
    user_id TEXT,
    session_id TEXT NOT NULL,

    -- Feedback target
    feedback_type TEXT NOT NULL,
    feature TEXT NOT NULL,
    content_id TEXT,

    -- Response
    response TEXT NOT NULL,

    -- Context
    page TEXT,

    -- Timestamps
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    -- Foreign key
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
  )
`);

if (!indexExists('idx_quick_feedback_session')) {
  db.exec('CREATE INDEX idx_quick_feedback_session ON quick_feedback(session_id)');
}

if (!indexExists('idx_quick_feedback_feature')) {
  db.exec('CREATE INDEX idx_quick_feedback_feature ON quick_feedback(feature)');
}

if (!indexExists('idx_quick_feedback_response')) {
  db.exec('CREATE INDEX idx_quick_feedback_response ON quick_feedback(response)');
}

if (!indexExists('idx_quick_feedback_created')) {
  db.exec('CREATE INDEX idx_quick_feedback_created ON quick_feedback(created_at)');
}

console.log('Creating support_requests table...');

// Create support_requests table
db.exec(`
  CREATE TABLE IF NOT EXISTS support_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    -- Ticket info
    ticket_number TEXT UNIQUE NOT NULL,

    -- Source
    user_id TEXT,
    email TEXT,
    session_id TEXT,

    -- Request details
    request_type TEXT NOT NULL,
    subject TEXT NOT NULL,
    description TEXT NOT NULL,

    -- Context
    page TEXT,
    browser TEXT,
    device TEXT,
    os TEXT,

    -- Attachments (JSON array of file references)
    attachments TEXT DEFAULT '[]',

    -- Debug info (if user permitted)
    debug_info TEXT,
    include_screenshot INTEGER DEFAULT 0,
    screenshot_path TEXT,

    -- Status tracking
    status TEXT DEFAULT 'new',
    assigned_to TEXT,
    assigned_at DATETIME,

    -- Resolution
    resolved_at DATETIME,
    resolved_by TEXT,
    resolution TEXT,

    -- Priority and categorization
    priority INTEGER DEFAULT 3,
    tags TEXT DEFAULT '[]',

    -- Communication
    last_response_at DATETIME,
    response_count INTEGER DEFAULT 0,

    -- Timestamps
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    -- Foreign keys
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (resolved_by) REFERENCES users(id) ON DELETE SET NULL
  )
`);

if (!indexExists('idx_support_ticket_number')) {
  db.exec('CREATE INDEX idx_support_ticket_number ON support_requests(ticket_number)');
}

if (!indexExists('idx_support_status')) {
  db.exec('CREATE INDEX idx_support_status ON support_requests(status)');
}

if (!indexExists('idx_support_type')) {
  db.exec('CREATE INDEX idx_support_type ON support_requests(request_type)');
}

if (!indexExists('idx_support_user')) {
  db.exec('CREATE INDEX idx_support_user ON support_requests(user_id)');
}

if (!indexExists('idx_support_priority')) {
  db.exec('CREATE INDEX idx_support_priority ON support_requests(priority)');
}

if (!indexExists('idx_support_created')) {
  db.exec('CREATE INDEX idx_support_created ON support_requests(created_at)');
}

console.log('Creating support_responses table...');

// Create support_responses table for tracking communication
db.exec(`
  CREATE TABLE IF NOT EXISTS support_responses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    -- Link to request
    request_id INTEGER NOT NULL,

    -- Response details
    responder_id TEXT,
    responder_type TEXT DEFAULT 'user',
    message TEXT NOT NULL,

    -- Attachments
    attachments TEXT DEFAULT '[]',

    -- Visibility
    is_internal INTEGER DEFAULT 0,

    -- Timestamps
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    -- Foreign keys
    FOREIGN KEY (request_id) REFERENCES support_requests(id) ON DELETE CASCADE,
    FOREIGN KEY (responder_id) REFERENCES users(id) ON DELETE SET NULL
  )
`);

if (!indexExists('idx_support_responses_request')) {
  db.exec('CREATE INDEX idx_support_responses_request ON support_responses(request_id)');
}

console.log('Creating help_articles table...');

// Create help_articles table
db.exec(`
  CREATE TABLE IF NOT EXISTS help_articles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    -- Article identification
    slug TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,

    -- Content
    summary TEXT,
    content TEXT NOT NULL,

    -- Organization
    category TEXT NOT NULL,
    subcategory TEXT,
    tags TEXT DEFAULT '[]',

    -- Context (which pages/features this article is relevant to)
    relevant_pages TEXT DEFAULT '[]',
    relevant_features TEXT DEFAULT '[]',

    -- Search optimization
    search_keywords TEXT DEFAULT '[]',

    -- Display order
    sort_order INTEGER DEFAULT 0,
    is_featured INTEGER DEFAULT 0,

    -- Status
    status TEXT DEFAULT 'published',

    -- Timestamps
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    -- Author
    created_by TEXT,
    updated_by TEXT,

    -- Foreign keys
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
  )
`);

if (!indexExists('idx_help_articles_slug')) {
  db.exec('CREATE INDEX idx_help_articles_slug ON help_articles(slug)');
}

if (!indexExists('idx_help_articles_category')) {
  db.exec('CREATE INDEX idx_help_articles_category ON help_articles(category)');
}

if (!indexExists('idx_help_articles_status')) {
  db.exec('CREATE INDEX idx_help_articles_status ON help_articles(status)');
}

console.log('Creating help_article_views table...');

// Create help_article_views table for tracking article usefulness
db.exec(`
  CREATE TABLE IF NOT EXISTS help_article_views (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    -- Article
    article_id INTEGER NOT NULL,

    -- Viewer
    user_id TEXT,
    session_id TEXT,

    -- Context
    from_page TEXT,
    search_query TEXT,

    -- Feedback
    was_helpful INTEGER,

    -- Timestamps
    viewed_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    -- Foreign keys
    FOREIGN KEY (article_id) REFERENCES help_articles(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
  )
`);

if (!indexExists('idx_article_views_article')) {
  db.exec('CREATE INDEX idx_article_views_article ON help_article_views(article_id)');
}

if (!indexExists('idx_article_views_viewed')) {
  db.exec('CREATE INDEX idx_article_views_viewed ON help_article_views(viewed_at)');
}

console.log('Creating feedback_prompts_shown table...');

// Create feedback_prompts_shown table to track which prompts were shown
db.exec(`
  CREATE TABLE IF NOT EXISTS feedback_prompts_shown (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    -- Identity
    user_id TEXT,
    session_id TEXT NOT NULL,

    -- Prompt details
    prompt_type TEXT NOT NULL,
    prompt_trigger TEXT,

    -- Response
    response TEXT,
    dismissed INTEGER DEFAULT 0,

    -- Context
    page TEXT,

    -- Timestamps
    shown_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    responded_at DATETIME,

    -- Foreign key
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
  )
`);

if (!indexExists('idx_prompts_shown_user')) {
  db.exec('CREATE INDEX idx_prompts_shown_user ON feedback_prompts_shown(user_id)');
}

if (!indexExists('idx_prompts_shown_session')) {
  db.exec('CREATE INDEX idx_prompts_shown_session ON feedback_prompts_shown(session_id)');
}

if (!indexExists('idx_prompts_shown_type')) {
  db.exec('CREATE INDEX idx_prompts_shown_type ON feedback_prompts_shown(prompt_type)');
}

// Seed some initial help articles
console.log('Seeding initial help articles...');

const articleCount = db.prepare('SELECT COUNT(*) as count FROM help_articles').get();

if (articleCount.count === 0) {
  const seedArticles = [
    {
      slug: 'getting-started',
      title: 'Getting Started with the Platform',
      summary: 'Learn the basics of navigating and using the investment analysis platform.',
      content: `# Getting Started

Welcome to the Investment Analysis Platform! This guide will help you get started with the key features.

## Overview

The platform provides comprehensive tools for:
- Portfolio analysis and tracking
- AI-powered investment insights
- Risk assessment and optimization
- Sentiment analysis
- Famous investor strategy comparison

## First Steps

1. **Add your portfolio** - Navigate to Portfolios and create your first portfolio
2. **Run an analysis** - Use the AI Analyst to get insights on your holdings
3. **Set up watchlists** - Track stocks you're interested in
4. **Explore tools** - Try the Monte Carlo simulation, sentiment analysis, and more

## Navigation

Use the sidebar to navigate between main sections:
- Dashboard - Your overview and quick stats
- Portfolios - Manage and analyze portfolios
- Screening - Find stocks matching your criteria
- Analysis - Deep dive into specific companies

Need more help? Browse our help articles or contact support.`,
      category: 'getting-started',
      tags: '["beginner", "tutorial", "overview"]',
      relevant_pages: '["/", "/dashboard", "/portfolios"]',
      is_featured: 1,
      sort_order: 1
    },
    {
      slug: 'understanding-portfolio-analysis',
      title: 'Understanding Portfolio Analysis Results',
      summary: 'Learn how to interpret the portfolio analysis results and metrics.',
      content: `# Understanding Portfolio Analysis

This guide explains the various metrics and insights provided in portfolio analysis.

## Key Metrics

### Risk Metrics
- **Volatility** - How much your portfolio value fluctuates
- **Max Drawdown** - The largest peak-to-trough decline
- **Sharpe Ratio** - Risk-adjusted return measure
- **Beta** - Sensitivity to market movements

### Performance Metrics
- **Total Return** - Overall percentage gain/loss
- **Annualized Return** - Return normalized to one year
- **Alpha** - Excess return vs benchmark

## Famous Investor Scores

We compare your portfolio against the strategies of famous investors:
- **Warren Buffett** - Value investing, quality companies
- **Peter Lynch** - Growth at reasonable price
- **Ray Dalio** - All-weather, diversification focus

Each score shows how well your portfolio aligns with their approach.

## AI Insights

The AI analyst provides:
- Specific observations about your holdings
- Risk warnings and opportunities
- Suggested improvements`,
      category: 'analysis',
      tags: '["portfolio", "metrics", "analysis"]',
      relevant_pages: '["/portfolios", "/analysis"]',
      relevant_features: '["portfolio_analysis"]',
      is_featured: 1,
      sort_order: 2
    },
    {
      slug: 'monte-carlo-simulation',
      title: 'Monte Carlo Simulation Explained',
      summary: 'Understand how Monte Carlo simulations work and how to interpret results.',
      content: `# Monte Carlo Simulation

Monte Carlo simulation is a powerful tool for understanding potential future outcomes of your portfolio.

## What is Monte Carlo?

Monte Carlo simulation runs thousands of possible scenarios for your portfolio based on historical volatility and returns. It helps answer: "What could happen to my portfolio?"

## How to Use It

1. Select your portfolio
2. Choose the time horizon (1-30 years)
3. Set the number of simulations (more = more accurate)
4. Click "Run Simulation"

## Understanding Results

### Probability Ranges
- **Best case (95th percentile)** - Top 5% of outcomes
- **Expected (median)** - Middle outcome
- **Worst case (5th percentile)** - Bottom 5% of outcomes

### Key Metrics
- **Probability of loss** - Chance of ending below starting value
- **Expected return** - Most likely outcome
- **Value at Risk (VaR)** - Maximum expected loss at a confidence level

## Limitations

Monte Carlo assumes:
- Future volatility resembles past volatility
- Returns are normally distributed (may underestimate tail risks)
- No major structural changes in markets

Use it as one tool among many, not a crystal ball.`,
      category: 'analysis',
      subcategory: 'tools',
      tags: '["monte-carlo", "simulation", "risk", "forecasting"]',
      relevant_pages: '["/portfolios"]',
      relevant_features: '["monte_carlo"]',
      is_featured: 0,
      sort_order: 3
    },
    {
      slug: 'privacy-and-data',
      title: 'Privacy & Data Security',
      summary: 'Learn how we handle your data and protect your privacy.',
      content: `# Privacy & Data Security

Your privacy is important to us. Here's how we handle your data.

## What We Collect

### Account Data
- Email address (for authentication)
- Display name and profile picture (from OAuth)

### Usage Data (Optional)
- Pages visited (anonymized)
- Features used (aggregated)
- Time spent on platform

We **never** collect:
- Your actual portfolio holdings
- Financial account credentials
- Specific analysis results
- Personal financial details

## How We Use Data

Usage data helps us:
- Improve the platform
- Fix bugs and issues
- Understand which features are most useful

## Your Controls

In Settings > Privacy, you can:
- Opt out of analytics tracking
- Disable feedback prompts
- Download your data
- Request data deletion

## Data Retention

- Account data: Until you delete your account
- Analytics: Aggregated after 90 days
- Feedback: Until resolved, then anonymized

Questions? Contact support.`,
      category: 'privacy',
      tags: '["privacy", "security", "data", "gdpr"]',
      relevant_pages: '["/settings", "/settings/privacy"]',
      is_featured: 1,
      sort_order: 4
    },
    {
      slug: 'watchlist-management',
      title: 'Managing Your Watchlists',
      summary: 'Learn how to create and manage watchlists to track stocks.',
      content: `# Managing Your Watchlists

Watchlists help you track stocks you're interested in without adding them to a portfolio.

## Creating a Watchlist

1. Navigate to Watchlists page
2. Click "Add to Watchlist"
3. Search for a stock
4. Optionally add notes

## Watchlist Features

### Quick Actions
- View company details
- Add to portfolio
- Set price alerts
- Add notes

### Sorting & Filtering
- Sort by name, change, volume
- Filter by sector or your tags
- Search within watchlist

### Notes
Add personal notes to any watchlist item to remember why you're tracking it.

## Tips

- Use watchlists for research before buying
- Track competitors of companies you own
- Monitor stocks waiting for better entry points`,
      category: 'features',
      tags: '["watchlist", "tracking", "stocks"]',
      relevant_pages: '["/watchlist"]',
      relevant_features: '["watchlist"]',
      is_featured: 0,
      sort_order: 5
    }
  ];

  const insertStmt = db.prepare(`
    INSERT INTO help_articles (slug, title, summary, content, category, subcategory, tags, relevant_pages, relevant_features, is_featured, sort_order, status)
    VALUES (@slug, @title, @summary, @content, @category, @subcategory, @tags, @relevant_pages, @relevant_features, @is_featured, @sort_order, 'published')
  `);

  for (const article of seedArticles) {
    insertStmt.run({
      slug: article.slug,
      title: article.title,
      summary: article.summary,
      content: article.content,
      category: article.category,
      subcategory: article.subcategory || null,
      tags: article.tags,
      relevant_pages: article.relevant_pages || '[]',
      relevant_features: article.relevant_features || '[]',
      is_featured: article.is_featured,
      sort_order: article.sort_order
    });
  }

  console.log(`Seeded ${seedArticles.length} help articles`);
}
console.log('Feedback system migration completed successfully!');

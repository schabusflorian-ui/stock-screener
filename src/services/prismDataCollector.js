// src/services/prismDataCollector.js
// Comprehensive data collection service for PRISM equity research reports
// Aggregates all available data sources for AI synthesis

const { getDatabaseAsync, isUsingPostgres } = require('../lib/db');
const SECFilingParser = require('./secFilingParser');
const EarningsTranscriptService = require('./earningsTranscriptService');
const WikipediaService = require('./wikipediaService');

class PRISMDataCollector {
  constructor() {
    // No database parameter needed - using getDatabaseAsync()
    this.secParser = new SECFilingParser();
    this.transcriptService = new EarningsTranscriptService();
    this.wikipediaService = new WikipediaService();
  }

  /**
   * Collect ALL available data for a company for PRISM report generation
   * This is the main entry point - gathers everything we have
   */
  async collectComprehensiveData(symbol) {
    const database = await getDatabaseAsync();
    const symbolUpper = symbol.toUpperCase();
    console.log(`\n📊 Collecting comprehensive data for ${symbolUpper}...`);

    const companyResult = await database.query(
      'SELECT * FROM companies WHERE symbol = $1',
      [symbolUpper]
    );
    const company = companyResult.rows[0];
    if (!company) {
      throw new Error(`Company ${symbolUpper} not found in database`);
    }

    // Collect all data sources in parallel where possible
    const [
      financialData,
      metricsData,
      priceData,
      analystData,
      secFilingData,
      newsData,
      sentimentData,
      insiderData,
      institutionalData,
      capitalData,
      earningsData,
      transcriptData,
      wikipediaData,
      peerData
    ] = await Promise.all([
      this.collectFinancialData(company.id),
      this.collectMetricsData(company.id),
      this.collectPriceData(company.id),
      this.collectAnalystData(company.id),
      this.collectSECFilingData(symbolUpper),
      this.collectNewsData(company.id, symbolUpper),
      this.collectSentimentData(company.id, symbolUpper),
      this.collectInsiderData(company.id),
      this.collectInstitutionalData(company.id, symbolUpper),
      this.collectCapitalAllocationData(company.id),
      this.collectEarningsData(company.id),
      this.collectTranscriptData(symbolUpper),
      this.collectWikipediaData(company.name, symbolUpper),
      this.collectPeerData(company.id, company.sector, company.industry)
    ]);

    // Compile the comprehensive data package
    const dataPackage = {
      symbol: symbolUpper,
      company: {
        id: company.id,
        name: company.name,
        sector: company.sector,
        industry: company.industry,
        exchange: company.exchange,
        country: company.country,
        description: company.description,
        marketCap: company.market_cap,  // Important for company classification
        cik: company.cik,
      },
      collectedAt: new Date().toISOString(),

      // Financial fundamentals
      financials: financialData,
      metrics: metricsData,

      // Market data
      prices: priceData,
      analyst: analystData,

      // Qualitative data (the gold for AI synthesis)
      secFiling: secFilingData,
      news: newsData,
      sentiment: sentimentData,
      transcripts: transcriptData,
      wikipedia: wikipediaData,

      // Ownership & capital
      insiders: insiderData,
      institutional: institutionalData,
      capital: capitalData,

      // Events & peers
      earnings: earningsData,
      peers: peerData,

      // Data quality indicators
      dataQuality: this.assessDataQuality({
        financialData,
        metricsData,
        secFilingData,
        newsData,
        sentimentData
      })
    };

    console.log(`✅ Data collection complete for ${symbolUpper}`);
    this.logDataSummary(dataPackage);

    return dataPackage;
  }

  // ============================================
  // FINANCIAL DATA COLLECTION
  // ============================================

  async collectFinancialData(companyId) {
    const database = await getDatabaseAsync();
    const data = {
      annual: [],
      quarterly: [],
      latest: null,
      historicalMetrics: []
    };

    try {
      // Annual financial statements (last 5 years)
      const annualResult = await database.query(`
        SELECT * FROM financial_data
        WHERE company_id = $1 AND period_type = 'annual'
        ORDER BY fiscal_date_ending DESC
        LIMIT 5
      `, [companyId]);
      data.annual = annualResult.rows;

      // Quarterly statements (last 8 quarters)
      const quarterlyResult = await database.query(`
        SELECT * FROM financial_data
        WHERE company_id = $1 AND period_type = 'quarterly'
        ORDER BY fiscal_date_ending DESC
        LIMIT 8
      `, [companyId]);
      data.quarterly = quarterlyResult.rows;

      if (data.annual.length > 0) {
        data.latest = data.annual[0];
      }

      // Parse JSON data fields if present
      data.annual = data.annual.map(f => ({
        ...f,
        parsedData: f.data ? JSON.parse(f.data) : {}
      }));

    } catch (e) {
      console.error('  Error collecting financial data:', e.message);
    }

    return data;
  }

  async collectMetricsData(companyId) {
    const database = await getDatabaseAsync();
    const data = {
      latest: null,
      history: [],
      trends: {}
    };

    try {
      // Historical calculated metrics
      const historyResult = await database.query(`
        SELECT * FROM calculated_metrics
        WHERE company_id = $1
        ORDER BY fiscal_period DESC
        LIMIT 5
      `, [companyId]);
      data.history = historyResult.rows;

      if (data.history.length > 0) {
        data.latest = data.history[0];

        // Calculate trends if we have multiple periods
        if (data.history.length >= 2) {
          data.trends = this.calculateMetricTrends(data.history);
        }
      }

    } catch (e) {
      console.error('  Error collecting metrics data:', e.message);
    }

    return data;
  }

  calculateMetricTrends(history) {
    const trends = {};
    const metricsToTrack = [
      'roic', 'roe', 'net_margin', 'operating_margin', 'gross_margin',
      'fcf_margin', 'revenue_growth_yoy', 'debt_to_equity'
    ];

    for (const metric of metricsToTrack) {
      const values = history.filter(h => h[metric] != null).map(h => h[metric]);
      if (values.length >= 2) {
        const latest = values[0];
        const oldest = values[values.length - 1];
        const change = latest - oldest;
        const avg = values.reduce((a, b) => a + b, 0) / values.length;
        const improving = change > 0;

        trends[metric] = {
          latest,
          oldest,
          change,
          changePercent: oldest !== 0 ? (change / Math.abs(oldest)) * 100 : null,
          average: avg,
          improving,
          stable: Math.abs(change) < (avg * 0.1), // Less than 10% change
          values
        };
      }
    }

    return trends;
  }

  // ============================================
  // MARKET DATA COLLECTION
  // ============================================

  async collectPriceData(companyId) {
    const database = await getDatabaseAsync();
    const data = {
      current: null,
      history: [],
      performance: {}
    };

    try {
      // Recent price history (1 year)
      const historyResult = await database.query(`
        SELECT * FROM daily_prices
        WHERE company_id = $1
        ORDER BY date DESC
        LIMIT 252
      `, [companyId]);
      data.history = historyResult.rows;

      if (data.history.length > 0) {
        data.current = data.history[0];

        // Calculate performance metrics
        const currentPrice = data.current.close;
        const pricesMap = {
          '1w': data.history[4]?.close,
          '1m': data.history[21]?.close,
          '3m': data.history[63]?.close,
          '6m': data.history[126]?.close,
          '1y': data.history[251]?.close
        };

        data.performance = {};
        for (const [period, price] of Object.entries(pricesMap)) {
          if (price) {
            data.performance[period] = {
              startPrice: price,
              endPrice: currentPrice,
              change: currentPrice - price,
              changePercent: ((currentPrice - price) / price) * 100
            };
          }
        }

        // Calculate volatility (30-day)
        if (data.history.length >= 30) {
          const returns = [];
          for (let i = 0; i < 29; i++) {
            const ret = (data.history[i].close - data.history[i + 1].close) / data.history[i + 1].close;
            returns.push(ret);
          }
          const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
          const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
          data.volatility30d = Math.sqrt(variance) * Math.sqrt(252) * 100; // Annualized
        }
      }

    } catch (e) {
      console.error('  Error collecting price data:', e.message);
    }

    return data;
  }

  async collectAnalystData(companyId) {
    const database = await getDatabaseAsync();
    const data = {
      estimates: null,
      ratings: null
    };

    try {
      const estimatesResult = await database.query(`
        SELECT * FROM analyst_estimates WHERE company_id = $1
      `, [companyId]);
      data.estimates = estimatesResult.rows[0];

    } catch (e) {
      console.error('  Error collecting analyst data:', e.message);
    }

    return data;
  }

  // ============================================
  // SEC FILING DATA (Qualitative Gold)
  // ============================================

  async collectSECFilingData(symbol) {
    const data = {
      latest10K: null,
      businessDescription: null,
      riskFactors: null,
      mdaDiscussion: null,
      competitionSection: null,
      keyMetrics: {},
      extractedInsights: {}
    };

    try {
      // Get cached or fresh 10-K
      const filing = await this.secParser.parseAndCache10K(symbol);

      if (filing) {
        data.latest10K = {
          filingDate: filing.filingDate || filing.filing_date,
          fiscalYear: filing.fiscalYear || filing.fiscal_year,
          accessionNumber: filing.accessionNumber || filing.accession_number
        };

        data.businessDescription = filing.businessDescription || filing.business_description;
        data.riskFactors = filing.riskFactors || filing.risk_factors;
        data.mdaDiscussion = filing.mdaDiscussion || filing.mda_discussion;
        data.competitionSection = filing.competitionSection || filing.competition_section;

        // Parse key metrics
        if (filing.keyMetrics) {
          data.keyMetrics = typeof filing.keyMetrics === 'string'
            ? JSON.parse(filing.keyMetrics)
            : filing.keyMetrics;
        } else if (filing.key_metrics) {
          data.keyMetrics = typeof filing.key_metrics === 'string'
            ? JSON.parse(filing.key_metrics)
            : filing.key_metrics;
        }

        // Extract additional insights from text
        data.extractedInsights = this.extractInsightsFromFiling(data);
      }

    } catch (e) {
      console.error('  Error collecting SEC filing data:', e.message);
    }

    return data;
  }

  extractInsightsFromFiling(secData) {
    const insights = {
      competitorMentions: [],
      growthDrivers: [],
      riskThemes: [],
      strategicPriorities: [],
      marketPositioning: null
    };

    // Extract competitor names from competition section
    if (secData.competitionSection) {
      const competitorPattern = /(?:compete|competitors?|competition)\s+(?:with|includes?|from)\s+([A-Z][A-Za-z\s,]+?)(?:\.|\band\b|;)/gi;
      let match;
      while ((match = competitorPattern.exec(secData.competitionSection)) !== null) {
        const names = match[1].split(/,|\band\b/).map(n => n.trim()).filter(n => n.length > 2);
        insights.competitorMentions.push(...names);
      }
      // Dedupe
      insights.competitorMentions = [...new Set(insights.competitorMentions)].slice(0, 10);
    }

    // Extract risk themes from risk factors
    if (secData.riskFactors) {
      const riskThemes = [
        { theme: 'Competition', pattern: /compet/i },
        { theme: 'Regulation', pattern: /regulat|compliance|government/i },
        { theme: 'Technology', pattern: /technolog|innovation|disruption/i },
        { theme: 'Macro/Economic', pattern: /economic|recession|inflation|interest rate/i },
        { theme: 'Supply Chain', pattern: /supply chain|supplier|manufacturing/i },
        { theme: 'Cybersecurity', pattern: /cyber|security breach|data breach/i },
        { theme: 'Talent', pattern: /talent|employee|workforce/i },
        { theme: 'International', pattern: /international|foreign|currency|geopolitical/i },
        { theme: 'Customer Concentration', pattern: /customer concentration|major customer/i },
        { theme: 'Litigation', pattern: /litigation|lawsuit|legal/i }
      ];

      for (const { theme, pattern } of riskThemes) {
        if (pattern.test(secData.riskFactors)) {
          insights.riskThemes.push(theme);
        }
      }
    }

    // Extract market positioning claims
    if (secData.businessDescription) {
      const positioningPatterns = [
        { position: 'Market Leader', pattern: /leading|leader|#1|number one|largest/i },
        { position: 'Innovator', pattern: /innovate|innovative|pioneer|first to/i },
        { position: 'Premium/Quality', pattern: /premium|high[- ]quality|best[- ]in[- ]class/i },
        { position: 'Cost Leader', pattern: /low[- ]cost|cost leader|efficient/i },
        { position: 'Niche Player', pattern: /specialized|niche|focused on/i }
      ];

      for (const { position, pattern } of positioningPatterns) {
        if (pattern.test(secData.businessDescription)) {
          insights.marketPositioning = position;
          break;
        }
      }
    }

    return insights;
  }

  // ============================================
  // NEWS & SENTIMENT DATA
  // ============================================

  async collectNewsData(companyId, symbol) {
    const database = await getDatabaseAsync();
    const data = {
      recent: [],
      themes: [],
      sentimentSummary: null
    };

    try {
      // Get recent news (last 30 days, quality filtered)
      const interval30days = isUsingPostgres()
        ? `CURRENT_TIMESTAMP - INTERVAL '30 days'`
        : `datetime('now', '-30 days')`;
      const recentResult = await database.query(`
        SELECT
          title, description, source, published_at, url,
          sentiment_score, sentiment_label
        FROM news_articles
        WHERE company_id = $1
          AND published_at > ${interval30days}
        ORDER BY published_at DESC
        LIMIT 50
      `, [companyId]);
      data.recent = recentResult.rows;

      // Extract themes from news
      if (data.recent.length > 0) {
        data.themes = this.extractNewsThemes(data.recent);

        // Calculate sentiment summary
        const scores = data.recent
          .filter(n => n.sentiment_score != null)
          .map(n => n.sentiment_score);

        if (scores.length > 0) {
          const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
          const positiveCount = scores.filter(s => s > 0.1).length;
          const negativeCount = scores.filter(s => s < -0.1).length;

          data.sentimentSummary = {
            averageScore: avgScore,
            positiveCount,
            negativeCount,
            neutralCount: scores.length - positiveCount - negativeCount,
            totalArticles: scores.length,
            overallSentiment: avgScore > 0.1 ? 'Positive' : avgScore < -0.1 ? 'Negative' : 'Neutral'
          };
        }
      }

    } catch (e) {
      console.error('  Error collecting news data:', e.message);
    }

    return data;
  }

  extractNewsThemes(newsArticles) {
    const themePatterns = [
      { theme: 'Earnings', pattern: /earnings|EPS|revenue|profit|beat|miss/i },
      { theme: 'Product Launch', pattern: /launch|new product|release|unveil/i },
      { theme: 'M&A', pattern: /acquire|acquisition|merger|deal|buyout/i },
      { theme: 'Management', pattern: /CEO|CFO|executive|appoint|resign/i },
      { theme: 'Analyst Activity', pattern: /upgrade|downgrade|price target|rating/i },
      { theme: 'Guidance', pattern: /guidance|outlook|forecast|expect/i },
      { theme: 'Regulatory', pattern: /regulat|FDA|SEC|antitrust|compliance/i },
      { theme: 'Partnership', pattern: /partner|alliance|collaboration|agreement/i },
      { theme: 'Layoffs/Restructuring', pattern: /layoff|restructur|cut|downsize/i },
      { theme: 'Innovation/AI', pattern: /AI|artificial intelligence|innovate|technology/i }
    ];

    const themeCounts = {};

    for (const article of newsArticles) {
      const text = `${article.title} ${article.description || ''}`;
      for (const { theme, pattern } of themePatterns) {
        if (pattern.test(text)) {
          themeCounts[theme] = (themeCounts[theme] || 0) + 1;
        }
      }
    }

    // Return themes sorted by frequency
    return Object.entries(themeCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([theme, count]) => ({ theme, count, percentage: Math.round((count / newsArticles.length) * 100) }));
  }

  async collectSentimentData(companyId, symbol) {
    const database = await getDatabaseAsync();
    const data = {
      reddit: null,
      stocktwits: null,
      combined: null,
      socialMentions: []
    };

    try {
      // Combined sentiment score
      const combinedResult = await database.query(`
        SELECT * FROM combined_sentiment
        WHERE company_id = $1
        ORDER BY calculated_at DESC
        LIMIT 1
      `, [companyId]);
      data.combined = combinedResult.rows[0];

      // Reddit mentions (quality filtered) - using company_id
      const redditInterval7days = isUsingPostgres()
        ? `CURRENT_TIMESTAMP - INTERVAL '7 days'`
        : `datetime('now', '-7 days')`;
      const redditPostsResult = await database.query(`
        SELECT
          title, selftext as body, subreddit, score, num_comments,
          sentiment_score, posted_at as created_utc
        FROM reddit_posts
        WHERE company_id = $1
          AND posted_at > ${redditInterval7days}
          AND score > 10
        ORDER BY score DESC
        LIMIT 20
      `, [companyId]);
      const redditPosts = redditPostsResult.rows;

      if (redditPosts.length > 0) {
        data.reddit = {
          postCount: redditPosts.length,
          topPosts: redditPosts.slice(0, 5),
          avgSentiment: redditPosts
            .filter(p => p.sentiment_score != null)
            .reduce((sum, p) => sum + p.sentiment_score, 0) / redditPosts.length || 0,
          topSubreddits: this.getTopSubreddits(redditPosts)
        };
      }

      // StockTwits sentiment - using company_id
      const interval7days = isUsingPostgres()
        ? `CURRENT_TIMESTAMP - INTERVAL '7 days'`
        : `datetime('now', '-7 days')`;
      const stocktwitsMessagesResult = await database.query(`
        SELECT
          body, user_sentiment as sentiment, likes_count as likes, posted_at as created_at
        FROM stocktwits_messages
        WHERE company_id = $1
          AND posted_at > ${interval7days}
        ORDER BY posted_at DESC
        LIMIT 50
      `, [companyId]);
      const stocktwitsMessages = stocktwitsMessagesResult.rows;

      if (stocktwitsMessages.length > 0) {
        const bullish = stocktwitsMessages.filter(m => m.sentiment === 'Bullish').length;
        const bearish = stocktwitsMessages.filter(m => m.sentiment === 'Bearish').length;

        data.stocktwits = {
          messageCount: stocktwitsMessages.length,
          bullishCount: bullish,
          bearishCount: bearish,
          bullishPercent: Math.round((bullish / stocktwitsMessages.length) * 100),
          sentiment: bullish > bearish * 1.5 ? 'Bullish' : bearish > bullish * 1.5 ? 'Bearish' : 'Mixed'
        };
      }

    } catch (e) {
      console.error('  Error collecting sentiment data:', e.message);
    }

    return data;
  }

  getTopSubreddits(posts) {
    const counts = {};
    for (const post of posts) {
      counts[post.subreddit] = (counts[post.subreddit] || 0) + 1;
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name, count]) => ({ name, count }));
  }

  // ============================================
  // OWNERSHIP & CAPITAL DATA
  // ============================================

  async collectInsiderData(companyId) {
    const database = await getDatabaseAsync();
    const data = {
      recentTransactions: [],
      netActivity: null,
      keyInsiders: []
    };

    try {
      // Recent insider transactions (last 12 months) - join with insiders table for name/title
      const transactionsResult = await database.query(`
        SELECT
          i.name as insider_name, i.title as insider_title,
          it.transaction_type, it.transaction_code,
          it.shares_transacted as shares, it.total_value as value,
          it.transaction_date
        FROM insider_transactions it
        JOIN insiders i ON it.insider_id = i.id
        WHERE it.company_id = $1
          AND it.transaction_date > date('now', '-12 months')
        ORDER BY it.transaction_date DESC
        LIMIT 30
      `, [companyId]);
      data.recentTransactions = transactionsResult.rows;

      if (data.recentTransactions.length > 0) {
        // Calculate net activity
        let buyValue = 0, sellValue = 0;
        for (const txn of data.recentTransactions) {
          const value = txn.value || 0;
          // P = Purchase, S = Sale (SEC Form 4 transaction codes)
          if (txn.transaction_code === 'P' || txn.transaction_type === 'Purchase') {
            buyValue += value;
          } else if (txn.transaction_code === 'S' || txn.transaction_type === 'Sale') {
            sellValue += value;
          }
        }

        data.netActivity = {
          totalBuys: buyValue,
          totalSells: sellValue,
          netValue: buyValue - sellValue,
          signal: buyValue > sellValue * 2 ? 'Strong Buying' :
                  buyValue > sellValue ? 'Net Buying' :
                  sellValue > buyValue * 2 ? 'Heavy Selling' :
                  sellValue > buyValue ? 'Net Selling' : 'Balanced'
        };

        // Identify key insiders (CEO, CFO, etc.)
        const keyTitles = ['CEO', 'CFO', 'COO', 'President', 'Chairman', 'Director'];
        data.keyInsiders = data.recentTransactions
          .filter(t => keyTitles.some(title => (t.insider_title || '').includes(title)))
          .slice(0, 5);
      }

    } catch (e) {
      console.error('  Error collecting insider data:', e.message);
    }

    return data;
  }

  async collectInstitutionalData(companyId, symbol) {
    const database = await getDatabaseAsync();
    const data = {
      topHolders: [],
      recentChanges: [],
      ownershipSummary: null
    };

    try {
      // Top institutional holders (from 13F data) - use actual schema
      const topHoldersResult = await database.query(`
        SELECT
          fi.name as investor_name, ih.shares, ih.market_value as value,
          ih.portfolio_weight as percent_of_portfolio,
          ih.filing_date as quarter_end, 1 as is_famous
        FROM investor_holdings ih
        JOIN famous_investors fi ON ih.investor_id = fi.id
        WHERE ih.company_id = $1
        ORDER BY ih.market_value DESC
        LIMIT 20
      `, [companyId]);
      data.topHolders = topHoldersResult.rows;

      // Calculate summary
      if (data.topHolders.length > 0) {
        const totalValue = data.topHolders.reduce((sum, h) => sum + (h.value || 0), 0);
        const famousHolders = data.topHolders.filter(h => h.is_famous);

        data.ownershipSummary = {
          topHoldersCount: data.topHolders.length,
          totalValueHeld: totalValue,
          famousInvestorCount: famousHolders.length,
          famousInvestors: famousHolders.map(h => h.investor_name)
        };
      }

    } catch (e) {
      console.error('  Error collecting institutional data:', e.message);
    }

    return data;
  }

  async collectCapitalAllocationData(companyId) {
    const database = await getDatabaseAsync();
    const data = {
      buybacks: [],
      dividends: [],
      summary: null
    };

    try {
      // Buyback history - use actual buyback_activity table
      const buybacksResult = await database.query(`
        SELECT fiscal_quarter, shares_repurchased, amount_spent as amount, average_price
        FROM buyback_activity
        WHERE company_id = $1
        ORDER BY fiscal_quarter DESC
        LIMIT 12
      `, [companyId]);
      data.buybacks = buybacksResult.rows;

      // Dividend history
      const dividendsResult = await database.query(`
        SELECT ex_date, payment_date, amount, frequency
        FROM dividend_history
        WHERE company_id = $1
        ORDER BY ex_date DESC
        LIMIT 16
      `, [companyId]);
      data.dividends = dividendsResult.rows;

      // Calculate summary
      const totalBuybacks = data.buybacks.reduce((sum, b) => sum + (b.amount || 0), 0);
      const totalDividends = data.dividends.reduce((sum, d) => sum + (d.amount || 0), 0);

      // Check for dividend growth
      let dividendGrowing = false;
      if (data.dividends.length >= 8) {
        const recentAvg = data.dividends.slice(0, 4).reduce((s, d) => s + (d.amount || 0), 0) / 4;
        const olderAvg = data.dividends.slice(-4).reduce((s, d) => s + (d.amount || 0), 0) / 4;
        dividendGrowing = recentAvg > olderAvg * 1.02;
      }

      data.summary = {
        hasBuybacks: data.buybacks.length > 0 && totalBuybacks > 0,
        totalBuybacks,
        hasDividends: data.dividends.length > 0,
        totalDividends,
        dividendGrowing,
        capitalReturnProfile: this.assessCapitalReturnProfile(totalBuybacks, totalDividends, dividendGrowing)
      };

    } catch (e) {
      console.error('  Error collecting capital allocation data:', e.message);
    }

    return data;
  }

  assessCapitalReturnProfile(buybacks, dividends, dividendGrowing) {
    if (buybacks > 0 && dividends > 0 && dividendGrowing) {
      return 'Aggressive Capital Return';
    } else if (buybacks > 0 && dividends > 0) {
      return 'Balanced Capital Return';
    } else if (buybacks > 0) {
      return 'Buyback Focused';
    } else if (dividends > 0 && dividendGrowing) {
      return 'Dividend Growth';
    } else if (dividends > 0) {
      return 'Dividend Payer';
    }
    return 'Reinvestment Focused';
  }

  // ============================================
  // EVENTS & PEER DATA
  // ============================================

  async collectEarningsData(companyId) {
    const database = await getDatabaseAsync();
    const data = {
      upcoming: null,
      history: [],
      beatRate: null
    };

    try {
      // Use earnings_calendar table which contains both next date and history
      const earningsResult = await database.query(`
        SELECT
          next_earnings_date, is_estimate, eps_estimate,
          revenue_estimate, beat_rate, avg_surprise,
          consecutive_beats, history_json
        FROM earnings_calendar
        WHERE company_id = $1
      `, [companyId]);
      const earnings = earningsResult.rows[0];

      if (earnings) {
        // Check if next earnings is upcoming
        if (earnings.next_earnings_date && new Date(earnings.next_earnings_date) >= new Date()) {
          data.upcoming = {
            date: earnings.next_earnings_date,
            isEstimate: earnings.is_estimate,
            epsEstimate: earnings.eps_estimate,
            revenueEstimate: earnings.revenue_estimate
          };
        }

        // Parse history from JSON
        if (earnings.history_json) {
          try {
            data.history = JSON.parse(earnings.history_json);
          } catch (e) {
            data.history = [];
          }
        }

        // Use pre-calculated beat rate
        data.beatRate = earnings.beat_rate ? Math.round(earnings.beat_rate) : null;
        data.consecutiveBeats = earnings.consecutive_beats;
        data.avgSurprise = earnings.avg_surprise;
      }

    } catch (e) {
      // Table might not exist
    }

    return data;
  }

  // ============================================
  // WIKIPEDIA DATA
  // ============================================

  async collectWikipediaData(companyName, symbol) {
    const data = {
      available: false,
      summary: null,
      founded: null,
      founders: null,
      headquarters: null,
      history: null,
      keyFacts: [],
      pageUrl: null
    };

    try {
      const wikiInfo = await this.wikipediaService.getCompanyInfo(companyName, symbol);

      if (wikiInfo.available) {
        data.available = true;
        data.summary = wikiInfo.summary;
        data.founded = wikiInfo.founded;
        data.founders = wikiInfo.founders;
        data.headquarters = wikiInfo.headquarters;
        data.history = wikiInfo.history;
        data.introduction = wikiInfo.introduction;
        data.keyFacts = wikiInfo.keyFacts;
        data.pageUrl = wikiInfo.pageUrl;
      }

    } catch (e) {
      console.error('  Error collecting Wikipedia data:', e.message);
    }

    return data;
  }

  // ============================================
  // EARNINGS TRANSCRIPTS DATA
  // ============================================

  async collectTranscriptData(symbol) {
    const data = {
      summary: null,
      keyQuotes: [],
      available: false
    };

    try {
      // Get transcript summary from service
      data.summary = this.transcriptService.getTranscriptSummary(symbol);

      if (data.summary) {
        data.available = true;

        // Get key quotes for AI synthesis
        data.keyQuotes = this.transcriptService.extractKeyQuotes(symbol, 5);

        // Also get full transcript text for detailed analysis
        const transcripts = this.transcriptService.getTranscripts(symbol, 2);

        if (transcripts.length > 0) {
          const latest = transcripts[0];

          // Include prepared remarks excerpt for AI analysis (first 3000 chars)
          if (latest.prepared_remarks) {
            data.preparedRemarksExcerpt = latest.prepared_remarks.substring(0, 3000);
          }

          // Include Q&A excerpt
          if (latest.qa_section) {
            data.qaExcerpt = latest.qa_section.substring(0, 2000);
          }

          // Extract management guidance language
          data.guidanceAnalysis = {
            direction: data.summary.guidanceDirection,
            forwardLookingStatements: latest.forward_looking_count,
            uncertaintyLevel: latest.uncertainty_phrases,
            riskMentions: latest.risk_mentions,
            tone: latest.tone,
            sentimentScore: latest.sentiment_score
          };
        }
      }

    } catch (e) {
      console.error('  Error collecting transcript data:', e.message);
    }

    return data;
  }

  async collectPeerData(companyId, sector, industry) {
    const database = await getDatabaseAsync();
    const data = {
      sectorPeers: [],
      industryPeers: [],
      comparison: null
    };

    try {
      // Get industry peers with metrics
      const industryPeersResult = await database.query(`
        SELECT
          c.id, c.symbol, c.name,
          cm.roic, cm.roe, cm.net_margin, cm.revenue_growth_yoy,
          cm.pe_ratio, cm.ev_ebitda, cm.fcf_yield
        FROM companies c
        LEFT JOIN calculated_metrics cm ON c.id = cm.company_id
        WHERE c.industry = $1 AND c.id != $2
        ORDER BY cm.roic DESC
        LIMIT 10
      `, [industry, companyId]);
      data.industryPeers = industryPeersResult.rows;

      // Get company's own metrics for comparison
      const companyMetricsResult = await database.query(`
        SELECT * FROM calculated_metrics
        WHERE company_id = $1
        ORDER BY fiscal_period DESC
        LIMIT 1
      `, [companyId]);
      const companyMetrics = companyMetricsResult.rows[0];

      if (companyMetrics && data.industryPeers.length > 0) {
        // Calculate percentile ranks
        data.comparison = {
          roicRank: this.calculatePercentileRank(companyMetrics.roic, data.industryPeers.map(p => p.roic)),
          roeRank: this.calculatePercentileRank(companyMetrics.roe, data.industryPeers.map(p => p.roe)),
          marginRank: this.calculatePercentileRank(companyMetrics.net_margin, data.industryPeers.map(p => p.net_margin)),
          growthRank: this.calculatePercentileRank(companyMetrics.revenue_growth_yoy, data.industryPeers.map(p => p.revenue_growth_yoy))
        };
      }

    } catch (e) {
      console.error('  Error collecting peer data:', e.message);
    }

    return data;
  }

  calculatePercentileRank(value, peerValues) {
    if (value == null) return null;
    const validPeers = peerValues.filter(v => v != null);
    if (validPeers.length === 0) return null;

    const below = validPeers.filter(v => v < value).length;
    return Math.round((below / validPeers.length) * 100);
  }

  // ============================================
  // DATA QUALITY ASSESSMENT
  // ============================================

  assessDataQuality(data) {
    const quality = {
      overall: 'LOW',
      scores: {},
      missingCritical: [],
      recommendations: []
    };

    // Financial data quality
    quality.scores.financials = data.financialData?.annual?.length >= 3 ? 100 :
                                data.financialData?.annual?.length >= 1 ? 60 : 0;

    // Metrics data quality
    quality.scores.metrics = data.metricsData?.latest ? 100 : 0;

    // SEC filing quality
    quality.scores.secFiling = 0;
    if (data.secFilingData?.businessDescription) quality.scores.secFiling += 40;
    if (data.secFilingData?.riskFactors) quality.scores.secFiling += 30;
    if (data.secFilingData?.mdaDiscussion) quality.scores.secFiling += 30;

    // News/sentiment quality
    quality.scores.news = data.newsData?.recent?.length >= 10 ? 100 :
                          data.newsData?.recent?.length >= 3 ? 60 : 0;

    // Calculate overall
    const avgScore = Object.values(quality.scores).reduce((a, b) => a + b, 0) / Object.keys(quality.scores).length;
    quality.overall = avgScore >= 80 ? 'HIGH' : avgScore >= 50 ? 'MEDIUM' : 'LOW';

    // Identify missing critical data
    if (quality.scores.financials < 60) quality.missingCritical.push('Financial Statements');
    if (quality.scores.metrics === 0) quality.missingCritical.push('Calculated Metrics');
    if (quality.scores.secFiling < 40) quality.missingCritical.push('SEC 10-K Filing');

    return quality;
  }

  // ============================================
  // LOGGING & UTILITIES
  // ============================================

  logDataSummary(dataPackage) {
    console.log(`\n📋 Data Summary for ${dataPackage.symbol}:`);
    console.log(`  Company: ${dataPackage.company.name}`);
    console.log(`  Sector: ${dataPackage.company.sector} / ${dataPackage.company.industry}`);
    console.log(`  Data Quality: ${dataPackage.dataQuality.overall}`);
    console.log('  ---');
    console.log(`  Financials: ${dataPackage.financials.annual?.length || 0} annual, ${dataPackage.financials.quarterly?.length || 0} quarterly`);
    console.log(`  Metrics: ${dataPackage.metrics.latest ? 'Yes' : 'No'}`);
    console.log(`  SEC Filing: ${dataPackage.secFiling.latest10K ? 'Yes' : 'No'}`);
    console.log(`  Transcripts: ${dataPackage.transcripts?.available ? `Yes (${dataPackage.transcripts.summary?.transcriptsAvailable || 0} quarters)` : 'No'}`);
    console.log(`  Wikipedia: ${dataPackage.wikipedia?.available ? 'Yes' : 'No'}`);
    console.log(`  News: ${dataPackage.news.recent?.length || 0} articles (30 days)`);
    console.log(`  Sentiment: ${dataPackage.sentiment.combined ? 'Available' : 'None'}`);
    console.log(`  Insiders: ${dataPackage.insiders.recentTransactions?.length || 0} transactions`);
    console.log(`  Peers: ${dataPackage.peers.industryPeers?.length || 0} industry peers`);

    if (dataPackage.dataQuality.missingCritical.length > 0) {
      console.log(`  ⚠️ Missing: ${dataPackage.dataQuality.missingCritical.join(', ')}`);
    }
  }
}

module.exports = PRISMDataCollector;

// Test if run directly
if (require.main === module) {
  const collector = new PRISMDataCollector();

  (async () => {
    try {
      const data = await collector.collectComprehensiveData('AAPL');
      console.log('\n✅ Data collection test complete');
      console.log('Keys collected:', Object.keys(data));
    } catch (error) {
      console.error('Error:', error.message);
    }
  })();
}

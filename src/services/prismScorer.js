// src/services/prismScorer.js
// PRISM Factor Scoring Engine - calculates the 12-factor Business Scorecard

const db = require('../database');

const database = db.getDatabase();

/**
 * PRISM Scoring Engine
 * Calculates scores for the 12-factor Business Scorecard
 *
 * High Confidence (data-driven):
 * - Growth Momentum, Profitability, Cash Generation, Balance Sheet, Capital Allocation
 *
 * Medium Confidence (data + inference):
 * - Competitive Strength, Competitive Direction, Moat Durability, Leadership Quality
 *
 * Lower Confidence (limited data):
 * - Market Need, Market Direction, Market Size
 */

class PRISMScorer {
  constructor() {
    this.db = database;
  }

  /**
   * Calculate all factor scores for a company
   * @param {string} symbol - Stock ticker
   * @returns {Object} Complete scorecard with all factors
   */
  async calculateScorecard(symbol) {
    const symbolUpper = symbol.toUpperCase();

    // Get company data
    const company = db.getCompany(symbolUpper);
    if (!company) {
      throw new Error(`Company ${symbolUpper} not found`);
    }

    // Gather all required data
    const data = await this.gatherCompanyData(company.id, symbolUpper);

    // Calculate each factor
    const scorecard = {
      overallScore: 0,
      scoredAt: new Date().toISOString(),
      factors: {
        market: {
          marketNeed: this.scoreMarketNeed(data),
          marketDirection: this.scoreMarketDirection(data),
          marketSize: this.scoreMarketSize(data)
        },
        competitive: {
          competitiveStrength: this.scoreCompetitiveStrength(data),
          competitiveDirection: this.scoreCompetitiveDirection(data),
          moatDurability: this.scoreMoatDurability(data)
        },
        financial: {
          growthMomentum: this.scoreGrowthMomentum(data),
          profitability: this.scoreProfitability(data),
          cashGeneration: this.scoreCashGeneration(data),
          balanceSheet: this.scoreBalanceSheet(data)
        },
        management: {
          capitalAllocation: this.scoreCapitalAllocation(data),
          leadershipQuality: this.scoreLeadershipQuality(data)
        }
      }
    };

    // Calculate overall score (weighted average)
    scorecard.overallScore = this.calculateOverallScore(scorecard.factors);

    return scorecard;
  }

  /**
   * Gather all company data needed for scoring
   */
  async gatherCompanyData(companyId, symbol) {
    const data = {
      companyId,
      symbol,
      financials: {},
      metrics: {},
      prices: {},
      analyst: {},
      peers: [],
      secFiling: null,
      insiders: [],
      capital: {}
    };

    // Get latest financial data (annual)
    try {
      const financials = this.db.prepare(`
        SELECT * FROM financial_data
        WHERE company_id = ? AND period_type = 'annual'
        ORDER BY fiscal_date_ending DESC
        LIMIT 5
      `).all(companyId);

      if (financials.length > 0) {
        data.financials.annual = financials;
        data.financials.latest = financials[0];
        data.financials.latestData = financials[0].data ? JSON.parse(financials[0].data) : {};
      }
    } catch (e) { console.error('Error getting financials:', e.message); }

    // Get quarterly data for growth trends
    try {
      const quarterly = this.db.prepare(`
        SELECT * FROM financial_data
        WHERE company_id = ? AND period_type = 'quarterly'
        ORDER BY fiscal_date_ending DESC
        LIMIT 8
      `).all(companyId);
      data.financials.quarterly = quarterly;
    } catch (e) { console.error('Error getting quarterly:', e.message); }

    // Get calculated metrics
    try {
      const metrics = this.db.prepare(`
        SELECT * FROM calculated_metrics
        WHERE company_id = ?
        ORDER BY fiscal_period DESC
        LIMIT 5
      `).all(companyId);

      if (metrics.length > 0) {
        data.metrics.history = metrics;
        data.metrics.latest = metrics[0];
      }
    } catch (e) { console.error('Error getting metrics:', e.message); }

    // Get price data
    try {
      const prices = this.db.prepare(`
        SELECT * FROM daily_prices
        WHERE company_id = ?
        ORDER BY date DESC
        LIMIT 252
      `).all(companyId);

      if (prices.length > 0) {
        data.prices.history = prices;
        data.prices.latest = prices[0];
        data.prices.yearAgo = prices[Math.min(251, prices.length - 1)];
      }
    } catch (e) { console.error('Error getting prices:', e.message); }

    // Get analyst estimates
    try {
      const analyst = this.db.prepare(`
        SELECT * FROM analyst_estimates WHERE company_id = ?
      `).get(companyId);
      if (analyst) {
        data.analyst = analyst;
      }
    } catch (e) { console.error('Error getting analyst data:', e.message); }

    // Get SEC filing data
    try {
      const secFiling = this.db.prepare(`
        SELECT * FROM sec_filings
        WHERE symbol = ? AND form_type = '10-K'
        ORDER BY filing_date DESC
        LIMIT 1
      `).get(symbol);
      if (secFiling) {
        data.secFiling = {
          ...secFiling,
          keyMetrics: secFiling.key_metrics ? JSON.parse(secFiling.key_metrics) : {}
        };
      }
    } catch (e) { console.error('Error getting SEC filing:', e.message); }

    // Get insider transactions
    try {
      const insiders = this.db.prepare(`
        SELECT * FROM insider_transactions
        WHERE company_id = ?
        AND transaction_date > date('now', '-12 months')
        ORDER BY transaction_date DESC
        LIMIT 50
      `).all(companyId);
      data.insiders = insiders;
    } catch (e) { /* Table may not exist */ }

    // Get capital allocation data (buybacks, dividends)
    try {
      const buybacks = this.db.prepare(`
        SELECT * FROM buyback_history
        WHERE company_id = ?
        ORDER BY quarter_end DESC
        LIMIT 8
      `).all(companyId);
      data.capital.buybacks = buybacks;
    } catch (e) { /* Table may not exist */ }

    try {
      const dividends = this.db.prepare(`
        SELECT * FROM dividend_history
        WHERE company_id = ?
        ORDER BY ex_date DESC
        LIMIT 12
      `).all(companyId);
      data.capital.dividends = dividends;
    } catch (e) { /* Table may not exist */ }

    return data;
  }

  // ============================================
  // HIGH CONFIDENCE FACTORS (Data-Driven)
  // ============================================

  /**
   * Growth Momentum (1-5)
   * Based on: Revenue growth, EPS growth, estimate revisions
   */
  scoreGrowthMomentum(data) {
    const result = { score: null, confidence: 'HIGH', justification: '', dataPoints: [] };

    const metrics = data.metrics.latest;
    const financials = data.financials.annual || [];

    if (!metrics && financials.length < 2) {
      result.confidence = 'LOW';
      result.justification = 'Insufficient data for growth analysis';
      return result;
    }

    let growthScore = 0;
    let factors = 0;

    // Revenue growth YoY (already stored as percentage, e.g., 3.95 = 3.95%)
    if (metrics?.revenue_growth_yoy != null) {
      const revGrowth = metrics.revenue_growth_yoy;
      result.dataPoints.push(`Revenue growth: ${revGrowth.toFixed(1)}%`);

      if (revGrowth >= 20) growthScore += 5;
      else if (revGrowth >= 10) growthScore += 4;
      else if (revGrowth >= 5) growthScore += 3;
      else if (revGrowth >= 0) growthScore += 2;
      else growthScore += 1;
      factors++;
    } else if (financials.length >= 2) {
      // Calculate from raw data
      const latestRev = financials[0].total_revenue;
      const priorRev = financials[1].total_revenue;
      if (latestRev && priorRev) {
        const revGrowth = ((latestRev - priorRev) / priorRev) * 100;
        result.dataPoints.push(`Revenue growth: ${revGrowth.toFixed(1)}%`);

        if (revGrowth >= 20) growthScore += 5;
        else if (revGrowth >= 10) growthScore += 4;
        else if (revGrowth >= 5) growthScore += 3;
        else if (revGrowth >= 0) growthScore += 2;
        else growthScore += 1;
        factors++;
      }
    }

    // Earnings growth YoY (already stored as percentage)
    if (metrics?.earnings_growth_yoy != null) {
      const epsGrowth = metrics.earnings_growth_yoy;
      result.dataPoints.push(`Earnings growth: ${epsGrowth.toFixed(1)}%`);

      if (epsGrowth >= 25) growthScore += 5;
      else if (epsGrowth >= 15) growthScore += 4;
      else if (epsGrowth >= 5) growthScore += 3;
      else if (epsGrowth >= 0) growthScore += 2;
      else growthScore += 1;
      factors++;
    }

    // Analyst estimate momentum
    if (data.analyst?.upside_potential != null) {
      const upside = data.analyst.upside_potential;
      result.dataPoints.push(`Analyst upside: ${upside.toFixed(1)}%`);

      if (upside >= 30) growthScore += 5;
      else if (upside >= 15) growthScore += 4;
      else if (upside >= 5) growthScore += 3;
      else if (upside >= -5) growthScore += 2;
      else growthScore += 1;
      factors++;
    }

    if (factors > 0) {
      result.score = Math.round(growthScore / factors);
      result.justification = this.getGrowthJustification(result.score, result.dataPoints);
    }

    return result;
  }

  /**
   * Profitability (1-5)
   * Based on: ROIC, ROE, margins
   */
  scoreProfitability(data) {
    const result = { score: null, confidence: 'HIGH', justification: '', dataPoints: [] };

    const metrics = data.metrics.latest;
    if (!metrics) {
      result.confidence = 'LOW';
      result.justification = 'No profitability metrics available';
      return result;
    }

    let profitScore = 0;
    let factors = 0;

    // ROIC (already stored as percentage, e.g., 111.28 = 111.28%)
    if (metrics.roic != null) {
      const roic = metrics.roic;
      result.dataPoints.push(`ROIC: ${roic.toFixed(1)}%`);

      if (roic >= 20) profitScore += 5;
      else if (roic >= 15) profitScore += 4;
      else if (roic >= 10) profitScore += 3;
      else if (roic >= 5) profitScore += 2;
      else profitScore += 1;
      factors++;
    }

    // ROE (already stored as percentage)
    if (metrics.roe != null) {
      const roe = metrics.roe;
      result.dataPoints.push(`ROE: ${roe.toFixed(1)}%`);

      if (roe >= 25) profitScore += 5;
      else if (roe >= 18) profitScore += 4;
      else if (roe >= 12) profitScore += 3;
      else if (roe >= 6) profitScore += 2;
      else profitScore += 1;
      factors++;
    }

    // Net margin (already stored as percentage)
    if (metrics.net_margin != null) {
      const margin = metrics.net_margin;
      result.dataPoints.push(`Net margin: ${margin.toFixed(1)}%`);

      if (margin >= 20) profitScore += 5;
      else if (margin >= 12) profitScore += 4;
      else if (margin >= 6) profitScore += 3;
      else if (margin >= 2) profitScore += 2;
      else profitScore += 1;
      factors++;
    }

    // Operating margin (already stored as percentage)
    if (metrics.operating_margin != null) {
      const opMargin = metrics.operating_margin;
      result.dataPoints.push(`Operating margin: ${opMargin.toFixed(1)}%`);

      if (opMargin >= 25) profitScore += 5;
      else if (opMargin >= 18) profitScore += 4;
      else if (opMargin >= 12) profitScore += 3;
      else if (opMargin >= 5) profitScore += 2;
      else profitScore += 1;
      factors++;
    }

    if (factors > 0) {
      result.score = Math.round(profitScore / factors);
      result.justification = this.getProfitabilityJustification(result.score, result.dataPoints);
    }

    return result;
  }

  /**
   * Cash Generation (1-5)
   * Based on: FCF yield, FCF margin, FCF growth
   */
  scoreCashGeneration(data) {
    const result = { score: null, confidence: 'HIGH', justification: '', dataPoints: [] };

    const metrics = data.metrics.latest;
    if (!metrics) {
      result.confidence = 'LOW';
      result.justification = 'No cash flow metrics available';
      return result;
    }

    let cashScore = 0;
    let factors = 0;

    // FCF Yield
    if (metrics.fcf_yield != null) {
      const fcfYield = metrics.fcf_yield; // Already in percentage
      result.dataPoints.push(`FCF yield: ${fcfYield.toFixed(1)}%`);

      if (fcfYield >= 8) cashScore += 5;
      else if (fcfYield >= 5) cashScore += 4;
      else if (fcfYield >= 3) cashScore += 3;
      else if (fcfYield >= 1) cashScore += 2;
      else cashScore += 1;
      factors++;
    }

    // FCF Margin (already stored as percentage)
    if (metrics.fcf_margin != null) {
      const fcfMargin = metrics.fcf_margin;
      result.dataPoints.push(`FCF margin: ${fcfMargin.toFixed(1)}%`);

      if (fcfMargin >= 20) cashScore += 5;
      else if (fcfMargin >= 12) cashScore += 4;
      else if (fcfMargin >= 6) cashScore += 3;
      else if (fcfMargin >= 2) cashScore += 2;
      else cashScore += 1;
      factors++;
    }

    // FCF Growth (already stored as percentage)
    if (metrics.fcf_growth_yoy != null) {
      const fcfGrowth = metrics.fcf_growth_yoy;
      result.dataPoints.push(`FCF growth: ${fcfGrowth.toFixed(1)}%`);

      if (fcfGrowth >= 20) cashScore += 5;
      else if (fcfGrowth >= 10) cashScore += 4;
      else if (fcfGrowth >= 0) cashScore += 3;
      else if (fcfGrowth >= -10) cashScore += 2;
      else cashScore += 1;
      factors++;
    }

    if (factors > 0) {
      result.score = Math.round(cashScore / factors);
      result.justification = `${result.score >= 4 ? 'Strong' : result.score >= 3 ? 'Good' : 'Modest'} cash generation with ${result.dataPoints.join(', ')}`;
    }

    return result;
  }

  /**
   * Balance Sheet (1-5)
   * Based on: Debt/Equity, Current ratio, Net cash position
   */
  scoreBalanceSheet(data) {
    const result = { score: null, confidence: 'HIGH', justification: '', dataPoints: [] };

    const metrics = data.metrics.latest;
    const financials = data.financials.latest;

    if (!metrics && !financials) {
      result.confidence = 'LOW';
      result.justification = 'No balance sheet data available';
      return result;
    }

    let bsScore = 0;
    let factors = 0;

    // Debt to Equity
    if (metrics?.debt_to_equity != null) {
      const debtEquity = metrics.debt_to_equity;
      result.dataPoints.push(`D/E: ${debtEquity.toFixed(2)}x`);

      if (debtEquity <= 0.3) bsScore += 5;
      else if (debtEquity <= 0.7) bsScore += 4;
      else if (debtEquity <= 1.2) bsScore += 3;
      else if (debtEquity <= 2.0) bsScore += 2;
      else bsScore += 1;
      factors++;
    }

    // Current Ratio
    if (metrics?.current_ratio != null) {
      const currentRatio = metrics.current_ratio;
      result.dataPoints.push(`Current ratio: ${currentRatio.toFixed(2)}x`);

      if (currentRatio >= 2.0) bsScore += 5;
      else if (currentRatio >= 1.5) bsScore += 4;
      else if (currentRatio >= 1.2) bsScore += 3;
      else if (currentRatio >= 1.0) bsScore += 2;
      else bsScore += 1;
      factors++;
    }

    // Net cash/debt position
    if (financials) {
      const cash = financials.cash_and_equivalents || 0;
      const debt = (financials.long_term_debt || 0) + (financials.short_term_debt || 0);
      const netCash = cash - debt;

      if (netCash > 0) {
        result.dataPoints.push('Net cash position');
        bsScore += 5;
      } else {
        const netDebtRatio = debt > 0 ? (-netCash / (financials.shareholder_equity || 1)) : 0;
        if (netDebtRatio <= 0.5) bsScore += 4;
        else if (netDebtRatio <= 1.0) bsScore += 3;
        else bsScore += 2;
        result.dataPoints.push(`Net debt/equity: ${netDebtRatio.toFixed(2)}x`);
      }
      factors++;
    }

    if (factors > 0) {
      result.score = Math.round(bsScore / factors);
      result.justification = `${result.score >= 4 ? 'Strong' : result.score >= 3 ? 'Healthy' : 'Leveraged'} balance sheet: ${result.dataPoints.join(', ')}`;
    }

    return result;
  }

  /**
   * Capital Allocation (1-5)
   * Based on: Buyback history, dividend policy, M&A track record
   */
  scoreCapitalAllocation(data) {
    const result = { score: null, confidence: 'HIGH', justification: '', dataPoints: [] };

    let capScore = 0;
    let factors = 0;

    // Buyback analysis
    const buybacks = data.capital.buybacks || [];
    if (buybacks.length > 0) {
      const totalBuybacks = buybacks.reduce((sum, b) => sum + (b.amount || 0), 0);
      if (totalBuybacks > 0) {
        result.dataPoints.push('Active buyback program');
        capScore += 4;
        factors++;
      }
    }

    // Dividend analysis
    const dividends = data.capital.dividends || [];
    if (dividends.length > 0) {
      // Check for dividend growth
      const amounts = dividends.map(d => d.amount || 0).filter(a => a > 0);
      if (amounts.length >= 4) {
        const recent = amounts.slice(0, 4).reduce((a, b) => a + b, 0) / 4;
        const older = amounts.slice(-4).reduce((a, b) => a + b, 0) / Math.min(4, amounts.slice(-4).length);
        if (recent > older) {
          result.dataPoints.push('Growing dividends');
          capScore += 5;
        } else {
          result.dataPoints.push('Stable dividends');
          capScore += 4;
        }
        factors++;
      }
    }

    // If no buyback/dividend data, use FCF allocation inference
    if (factors === 0 && data.metrics.latest) {
      const fcfYield = data.metrics.latest.fcf_yield || 0;
      if (fcfYield > 5) {
        result.dataPoints.push('High FCF generation enables capital return');
        capScore += 4;
        factors++;
        result.confidence = 'MEDIUM';
      }
    }

    if (factors > 0) {
      result.score = Math.round(capScore / factors);
      result.justification = result.dataPoints.join('; ');
    } else {
      result.confidence = 'LOW';
      result.justification = 'Limited capital allocation data available';
    }

    return result;
  }

  // ============================================
  // MEDIUM CONFIDENCE FACTORS (Data + Inference)
  // ============================================

  /**
   * Competitive Strength (1-5)
   * Based on: Margins vs peers, market share claims, revenue scale
   */
  scoreCompetitiveStrength(data) {
    const result = { score: null, confidence: 'MEDIUM', justification: '', dataPoints: [] };

    let compScore = 0;
    let factors = 0;

    // Margin analysis (higher margins = stronger competitive position)
    // gross_margin is already stored as percentage
    if (data.metrics.latest?.gross_margin != null) {
      const grossMargin = data.metrics.latest.gross_margin;
      result.dataPoints.push(`Gross margin: ${grossMargin.toFixed(1)}%`);

      // Tech/premium margins
      if (grossMargin >= 60) compScore += 5;
      else if (grossMargin >= 45) compScore += 4;
      else if (grossMargin >= 30) compScore += 3;
      else if (grossMargin >= 20) compScore += 2;
      else compScore += 1;
      factors++;
    }

    // Market leadership claim from SEC filing
    if (data.secFiling?.keyMetrics?.hasLeadershipClaim) {
      result.dataPoints.push('Market leadership position claimed');
      compScore += 4;
      factors++;
    }

    // Revenue scale (larger = typically stronger position)
    if (data.financials.latest?.total_revenue) {
      const revenue = data.financials.latest.total_revenue;
      if (revenue >= 100e9) {
        result.dataPoints.push('$100B+ revenue leader');
        compScore += 5;
      } else if (revenue >= 20e9) {
        result.dataPoints.push('Major industry player');
        compScore += 4;
      } else if (revenue >= 5e9) {
        result.dataPoints.push('Significant market presence');
        compScore += 3;
      } else {
        compScore += 2;
      }
      factors++;
    }

    if (factors > 0) {
      result.score = Math.round(compScore / factors);
      result.justification = result.dataPoints.join('; ');
    } else {
      result.confidence = 'LOW';
      result.justification = 'Limited competitive data available';
    }

    return result;
  }

  /**
   * Competitive Direction (1-5)
   * Based on: Revenue growth vs industry, margin trends
   */
  scoreCompetitiveDirection(data) {
    const result = { score: null, confidence: 'MEDIUM', justification: '', dataPoints: [] };

    let dirScore = 0;
    let factors = 0;

    // Revenue growth trend (already stored as percentage)
    if (data.metrics.latest?.revenue_growth_yoy != null) {
      const growth = data.metrics.latest.revenue_growth_yoy;
      // Above-market growth suggests gaining share
      if (growth >= 15) {
        result.dataPoints.push('Strong growth suggests share gains');
        dirScore += 5;
      } else if (growth >= 8) {
        result.dataPoints.push('Above-market growth');
        dirScore += 4;
      } else if (growth >= 3) {
        result.dataPoints.push('In-line growth');
        dirScore += 3;
      } else if (growth >= 0) {
        result.dataPoints.push('Slow growth');
        dirScore += 2;
      } else {
        result.dataPoints.push('Declining revenue');
        dirScore += 1;
      }
      factors++;
    }

    // Margin trend
    const metricsHistory = data.metrics.history || [];
    if (metricsHistory.length >= 2) {
      const currentMargin = metricsHistory[0].operating_margin;
      const priorMargin = metricsHistory[1].operating_margin;
      if (currentMargin != null && priorMargin != null) {
        if (currentMargin > priorMargin * 1.05) {
          result.dataPoints.push('Improving margins');
          dirScore += 5;
          factors++;
        } else if (currentMargin >= priorMargin * 0.95) {
          result.dataPoints.push('Stable margins');
          dirScore += 3;
          factors++;
        } else {
          result.dataPoints.push('Declining margins');
          dirScore += 2;
          factors++;
        }
      }
    }

    if (factors > 0) {
      result.score = Math.round(dirScore / factors);
      result.justification = result.dataPoints.join('; ');
    } else {
      result.confidence = 'LOW';
      result.justification = 'Insufficient trend data';
    }

    return result;
  }

  /**
   * Moat Durability (1-5)
   * Based on: Margin stability, ROIC consistency, business description
   */
  scoreMoatDurability(data) {
    const result = { score: null, confidence: 'MEDIUM', justification: '', dataPoints: [] };

    let moatScore = 0;
    let factors = 0;

    // ROIC consistency over time (already stored as percentage)
    const metricsHistory = data.metrics.history || [];
    if (metricsHistory.length >= 3) {
      const roics = metricsHistory.filter(m => m.roic != null).map(m => m.roic);
      if (roics.length >= 3) {
        const avgRoic = roics.reduce((a, b) => a + b, 0) / roics.length;
        const minRoic = Math.min(...roics);

        if (avgRoic >= 15 && minRoic >= 10) {
          result.dataPoints.push('Consistently high ROIC');
          moatScore += 5;
        } else if (avgRoic >= 10 && minRoic >= 5) {
          result.dataPoints.push('Stable above-average returns');
          moatScore += 4;
        } else if (avgRoic >= 5) {
          result.dataPoints.push('Moderate return consistency');
          moatScore += 3;
        } else {
          moatScore += 2;
        }
        factors++;
      }
    }

    // Gross margin stability (high stable margins = pricing power = moat)
    // gross_margin already stored as percentage
    if (metricsHistory.length >= 3) {
      const margins = metricsHistory.filter(m => m.gross_margin != null).map(m => m.gross_margin);
      if (margins.length >= 3) {
        const avgMargin = margins.reduce((a, b) => a + b, 0) / margins.length;
        const variance = margins.map(m => Math.abs(m - avgMargin)).reduce((a, b) => a + b, 0) / margins.length;

        if (avgMargin >= 50 && variance < 3) {
          result.dataPoints.push('Strong pricing power');
          moatScore += 5;
        } else if (avgMargin >= 35 && variance < 5) {
          result.dataPoints.push('Good pricing stability');
          moatScore += 4;
        } else {
          moatScore += 3;
        }
        factors++;
      }
    }

    if (factors > 0) {
      result.score = Math.round(moatScore / factors);
      result.justification = result.dataPoints.join('; ');
    } else {
      result.confidence = 'LOW';
      result.justification = 'Insufficient historical data for moat analysis';
    }

    return result;
  }

  /**
   * Leadership Quality (1-5)
   * Based on: Insider activity, executive tenure, capital allocation track record
   */
  scoreLeadershipQuality(data) {
    const result = { score: null, confidence: 'MEDIUM', justification: '', dataPoints: [] };

    let leadScore = 0;
    let factors = 0;

    // Insider activity
    const insiders = data.insiders || [];
    if (insiders.length > 0) {
      const buys = insiders.filter(t => t.transaction_type === 'Purchase' || t.transaction_type === 'P');
      const sells = insiders.filter(t => t.transaction_type === 'Sale' || t.transaction_type === 'S');

      const buyValue = buys.reduce((sum, t) => sum + (t.value || 0), 0);
      const sellValue = sells.reduce((sum, t) => sum + (t.value || 0), 0);

      if (buyValue > sellValue * 2) {
        result.dataPoints.push('Strong insider buying');
        leadScore += 5;
      } else if (buyValue > sellValue) {
        result.dataPoints.push('Net insider buying');
        leadScore += 4;
      } else if (sellValue < buyValue * 3) {
        result.dataPoints.push('Modest insider selling');
        leadScore += 3;
      } else {
        result.dataPoints.push('Significant insider selling');
        leadScore += 2;
      }
      factors++;
    }

    // Capital allocation track record (use ROIC trend as proxy)
    const metricsHistory = data.metrics.history || [];
    if (metricsHistory.length >= 3) {
      const roics = metricsHistory.filter(m => m.roic != null).map(m => m.roic);
      if (roics.length >= 3 && roics[0] > roics[roics.length - 1]) {
        result.dataPoints.push('Improving returns on capital');
        leadScore += 4;
        factors++;
      }
    }

    if (factors > 0) {
      result.score = Math.round(leadScore / factors);
      result.justification = result.dataPoints.join('; ');
    } else {
      result.score = 3; // Default to neutral
      result.confidence = 'LOW';
      result.justification = 'Limited leadership data; defaulting to neutral';
    }

    return result;
  }

  // ============================================
  // LOWER CONFIDENCE FACTORS (Limited Data)
  // ============================================

  /**
   * Market Need (1-5)
   * Based on: Industry growth, demand indicators from SEC filings
   */
  scoreMarketNeed(data) {
    const result = { score: null, confidence: 'LOW', justification: '', dataPoints: [] };

    // Use SEC filing mentions as proxy
    if (data.secFiling?.business_description) {
      const desc = data.secFiling.business_description.toLowerCase();

      // Look for demand indicators
      const strongDemand = ['essential', 'mission-critical', 'growing demand', 'strong demand', 'increasing adoption'];
      const moderateDemand = ['stable demand', 'consistent', 'recurring'];

      if (strongDemand.some(term => desc.includes(term))) {
        result.score = 4;
        result.dataPoints.push('Strong demand indicators in filings');
      } else if (moderateDemand.some(term => desc.includes(term))) {
        result.score = 3;
        result.dataPoints.push('Stable demand indicators');
      } else {
        result.score = 3; // Default neutral
        result.dataPoints.push('Market need inferred from business model');
      }
    } else {
      result.score = 3;
      result.dataPoints.push('Limited market data; assumed stable demand');
    }

    result.justification = result.dataPoints.join('; ');
    return result;
  }

  /**
   * Market Direction (1-5)
   * Based on: Industry trends, TAM growth
   */
  scoreMarketDirection(data) {
    const result = { score: null, confidence: 'LOW', justification: '', dataPoints: [] };

    // Use company growth as proxy for market growth (already stored as percentage)
    if (data.metrics.latest?.revenue_growth_yoy != null) {
      const growth = data.metrics.latest.revenue_growth_yoy;

      if (growth >= 20) {
        result.score = 5;
        result.dataPoints.push('Rapid growth suggests expanding market');
      } else if (growth >= 10) {
        result.score = 4;
        result.dataPoints.push('Strong growth indicates healthy market');
      } else if (growth >= 3) {
        result.score = 3;
        result.dataPoints.push('Moderate market growth');
      } else if (growth >= 0) {
        result.score = 2;
        result.dataPoints.push('Mature/slow-growth market');
      } else {
        result.score = 1;
        result.dataPoints.push('Declining market');
      }
    } else {
      result.score = 3;
      result.dataPoints.push('Market direction unclear');
    }

    result.justification = result.dataPoints.join('; ');
    return result;
  }

  /**
   * Market Size (1-5)
   * Based on: TAM mentions in filings, company revenue scale
   */
  scoreMarketSize(data) {
    const result = { score: null, confidence: 'LOW', justification: '', dataPoints: [] };

    // Check SEC filing for TAM
    if (data.secFiling?.keyMetrics?.tam) {
      const tam = data.secFiling.keyMetrics.tam;
      if (tam >= 500e9) {
        result.score = 5;
        result.dataPoints.push(`TAM: $${(tam / 1e9).toFixed(0)}B+`);
      } else if (tam >= 100e9) {
        result.score = 4;
        result.dataPoints.push(`TAM: $${(tam / 1e9).toFixed(0)}B`);
      } else if (tam >= 20e9) {
        result.score = 3;
        result.dataPoints.push(`TAM: $${(tam / 1e9).toFixed(0)}B`);
      } else {
        result.score = 2;
        result.dataPoints.push('Niche market');
      }
    } else {
      // Use company revenue as rough proxy
      const revenue = data.financials.latest?.total_revenue;
      if (revenue) {
        // Assume company has 5-20% market share
        const impliedTam = revenue * 10; // Rough 10% share assumption
        if (impliedTam >= 500e9) result.score = 5;
        else if (impliedTam >= 100e9) result.score = 4;
        else if (impliedTam >= 20e9) result.score = 3;
        else result.score = 2;
        result.dataPoints.push('Market size inferred from company scale');
      } else {
        result.score = 3;
        result.dataPoints.push('Market size unknown');
      }
    }

    result.justification = result.dataPoints.join('; ');
    return result;
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  calculateOverallScore(factors) {
    // Weight factors by confidence and importance
    const weights = {
      // Financial (40% weight) - HIGH confidence
      growthMomentum: 0.12,
      profitability: 0.12,
      cashGeneration: 0.10,
      balanceSheet: 0.06,

      // Competitive (25% weight) - MEDIUM confidence
      competitiveStrength: 0.10,
      competitiveDirection: 0.08,
      moatDurability: 0.07,

      // Management (15% weight) - MEDIUM confidence
      capitalAllocation: 0.10,
      leadershipQuality: 0.05,

      // Market (20% weight) - LOW confidence
      marketNeed: 0.07,
      marketDirection: 0.07,
      marketSize: 0.06
    };

    let weightedSum = 0;
    let totalWeight = 0;

    const allFactors = {
      ...factors.financial,
      ...factors.competitive,
      ...factors.management,
      ...factors.market
    };

    for (const [key, factor] of Object.entries(allFactors)) {
      if (factor.score != null && weights[key]) {
        weightedSum += factor.score * weights[key];
        totalWeight += weights[key];
      }
    }

    // Convert 1-5 scale to 1-10 scale
    const rawScore = totalWeight > 0 ? (weightedSum / totalWeight) : 3;
    return Math.round(rawScore * 2 * 10) / 10; // Scale to 1-10 with one decimal
  }

  getGrowthJustification(score, dataPoints) {
    const levels = {
      5: 'Exceptional growth momentum',
      4: 'Strong growth trajectory',
      3: 'Moderate growth',
      2: 'Below-average growth',
      1: 'Weak or declining growth'
    };
    return `${levels[score] || 'Growth assessed'}: ${dataPoints.join(', ')}`;
  }

  getProfitabilityJustification(score, dataPoints) {
    const levels = {
      5: 'Elite profitability',
      4: 'Strong profitability',
      3: 'Average profitability',
      2: 'Below-average profitability',
      1: 'Weak profitability'
    };
    return `${levels[score] || 'Profitability assessed'}: ${dataPoints.join(', ')}`;
  }

  /**
   * Save scorecard to database
   */
  async saveScorecard(symbol, scorecard) {
    const company = db.getCompany(symbol);
    const companyId = company ? company.id : null;

    const factors = scorecard.factors;

    const stmt = this.db.prepare(`
      INSERT INTO prism_scores (
        company_id, symbol, scored_at, overall_score,
        market_need_score, market_need_confidence,
        market_direction_score, market_direction_confidence,
        market_size_score, market_size_confidence,
        competitive_strength_score, competitive_strength_confidence,
        competitive_direction_score, competitive_direction_confidence,
        moat_durability_score, moat_durability_confidence,
        growth_momentum_score, growth_momentum_confidence,
        profitability_score, profitability_confidence,
        cash_generation_score, cash_generation_confidence,
        balance_sheet_score, balance_sheet_confidence,
        capital_allocation_score, capital_allocation_confidence,
        leadership_quality_score, leadership_quality_confidence,
        scorecard
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    return stmt.run(
      companyId,
      symbol,
      scorecard.scoredAt,
      scorecard.overallScore,
      factors.market.marketNeed.score,
      factors.market.marketNeed.confidence,
      factors.market.marketDirection.score,
      factors.market.marketDirection.confidence,
      factors.market.marketSize.score,
      factors.market.marketSize.confidence,
      factors.competitive.competitiveStrength.score,
      factors.competitive.competitiveStrength.confidence,
      factors.competitive.competitiveDirection.score,
      factors.competitive.competitiveDirection.confidence,
      factors.competitive.moatDurability.score,
      factors.competitive.moatDurability.confidence,
      factors.financial.growthMomentum.score,
      factors.financial.growthMomentum.confidence,
      factors.financial.profitability.score,
      factors.financial.profitability.confidence,
      factors.financial.cashGeneration.score,
      factors.financial.cashGeneration.confidence,
      factors.financial.balanceSheet.score,
      factors.financial.balanceSheet.confidence,
      factors.management.capitalAllocation.score,
      factors.management.capitalAllocation.confidence,
      factors.management.leadershipQuality.score,
      factors.management.leadershipQuality.confidence,
      JSON.stringify(scorecard)
    );
  }
}

module.exports = PRISMScorer;

// Test if run directly
if (require.main === module) {
  const scorer = new PRISMScorer();

  (async () => {
    try {
      console.log('Testing PRISM Scorer with AAPL...\n');
      const scorecard = await scorer.calculateScorecard('AAPL');

      console.log('='.repeat(60));
      console.log('PRISM SCORECARD - AAPL');
      console.log('='.repeat(60));
      console.log(`Overall Score: ${scorecard.overallScore}/10\n`);

      for (const [category, factors] of Object.entries(scorecard.factors)) {
        console.log(`\n${category.toUpperCase()}`);
        console.log('-'.repeat(40));
        for (const [factor, data] of Object.entries(factors)) {
          console.log(`  ${factor}: ${data.score || '—'}/5 [${data.confidence}]`);
          console.log(`    ${data.justification}`);
        }
      }

      // Save to database
      await scorer.saveScorecard('AAPL', scorecard);
      console.log('\n✓ Scorecard saved to database');
    } catch (error) {
      console.error('Error:', error.message);
    }
  })();
}

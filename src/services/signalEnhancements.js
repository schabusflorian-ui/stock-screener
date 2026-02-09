// src/services/signalEnhancements.js
// Additional signal generators using existing data:
// 1. 13F Delta Detection - What are super-investors changing?
// 2. Insider Trade Classification - Open market buys vs option exercises
// 3. Earnings Surprise Momentum - Consecutive beats/misses with magnitude

const { getDatabaseAsync } = require('../lib/db');

class SignalEnhancements {
  constructor() {
    // No database parameter needed - using getDatabaseAsync()
  }


  // ========================================
  // 13F DELTA DETECTION
  // ========================================

  /**
   * Get 13F change signal for a specific company
   * Returns aggregated signal from super-investor activity
   */
  async get13FSignal(companyId) {
    const database = await getDatabaseAsync();

    const result = await database.query(`
      SELECT
        ih.change_type,
        ih.shares_change,
        ih.shares_change_pct,
        ih.shares,
        ih.market_value,
        ih.portfolio_weight,
        ih.filing_date,
        fi.name as investor_name,
        fi.fund_name,
        fi.investment_style as style,
        fi.latest_portfolio_value as aum
      FROM investor_holdings ih
      JOIN famous_investors fi ON ih.investor_id = fi.id
      WHERE ih.company_id = $1
        AND ih.filing_date >= CURRENT_DATE - INTERVAL '120 days'
      ORDER BY ih.filing_date DESC
    `, [companyId]);

    const changes = result.rows;

    if (!changes || changes.length === 0) {
      return { score: 0, confidence: 0, details: { noData: true } };
    }

    let score = 0;
    let totalWeight = 0;
    const details = {
      newPositions: [],
      increases: [],
      decreases: [],
      exits: [],
      investorCount: 0,
    };

    const investors = new Set();

    for (const change of changes) {
      investors.add(change.investor_name);

      // Weight by investor AUM (larger = more signal)
      const aumWeight = change.aum ? Math.min(1, change.aum / 50000000000) : 0.5;

      // Weight by position significance
      const positionWeight = change.portfolio_weight ? Math.min(1, change.portfolio_weight / 5) : 0.3;

      const weight = (aumWeight + positionWeight) / 2;

      switch (change.change_type) {
        case 'new':
          score += 1.0 * weight;  // New position = strong bullish
          totalWeight += weight;
          details.newPositions.push({
            investor: change.investor_name,
            firm: change.fund_name,
            value: change.market_value,
            weight: change.portfolio_weight,
            date: change.filing_date,
          });
          break;

        case 'increased':
          const increasePct = change.shares_change_pct || 0;
          // >50% increase = strong signal, >25% = moderate
          const increaseScore = increasePct > 50 ? 0.8 : increasePct > 25 ? 0.5 : 0.3;
          score += increaseScore * weight;
          totalWeight += weight;
          details.increases.push({
            investor: change.investor_name,
            changePct: increasePct,
            date: change.filing_date,
          });
          break;

        case 'decreased':
          const decreasePct = Math.abs(change.shares_change_pct || 0);
          const decreaseScore = decreasePct > 50 ? -0.6 : decreasePct > 25 ? -0.4 : -0.2;
          score += decreaseScore * weight;
          totalWeight += weight;
          details.decreases.push({
            investor: change.investor_name,
            changePct: -decreasePct,
            date: change.filing_date,
          });
          break;

        case 'sold':
          score += -0.8 * weight;  // Exit = bearish
          totalWeight += weight;
          details.exits.push({
            investor: change.investor_name,
            date: change.filing_date,
          });
          break;
      }
    }

    details.investorCount = investors.size;

    // Normalize score
    const normalizedScore = totalWeight > 0 ? Math.max(-1, Math.min(1, score / totalWeight)) : 0;

    // Confidence based on investor count and data freshness
    const confidence = Math.min(0.9, 0.3 + (investors.size * 0.15));

    return {
      score: Math.round(normalizedScore * 1000) / 1000,
      confidence: Math.round(confidence * 100) / 100,
      signal: this._getSignalLabel(normalizedScore),
      interpretation: this._get13FInterpretation(normalizedScore, details),
      details,
    };
  }

  /**
   * Get all recent 13F opportunities (new positions from super-investors)
   */
  async getTop13FOpportunities(limit = 30) {
    const database = await getDatabaseAsync();

    const newPositionsResult = await database.query(`
      SELECT
        c.symbol,
        c.name as company_name,
        ih.market_value,
        ih.shares,
        ih.portfolio_weight,
        ih.filing_date,
        fi.name as investor_name,
        fi.fund_name,
        fi.latest_portfolio_value as aum
      FROM investor_holdings ih
      JOIN companies c ON ih.company_id = c.id
      JOIN famous_investors fi ON ih.investor_id = fi.id
      WHERE ih.change_type = 'new'
        AND ih.filing_date >= CURRENT_DATE - INTERVAL '90 days'
      ORDER BY ih.market_value DESC
      LIMIT $1
    `, [limit]);

    const increasesResult = await database.query(`
      SELECT
        c.symbol,
        c.name as company_name,
        ih.shares_change_pct,
        ih.market_value,
        ih.shares,
        ih.filing_date,
        fi.name as investor_name,
        fi.fund_name
      FROM investor_holdings ih
      JOIN companies c ON ih.company_id = c.id
      JOIN famous_investors fi ON ih.investor_id = fi.id
      WHERE ih.change_type = 'increased'
        AND ih.shares_change_pct > 25
        AND ih.filing_date >= CURRENT_DATE - INTERVAL '90 days'
      ORDER BY ih.shares_change_pct DESC
      LIMIT $1
    `, [limit]);

    const exitsResult = await database.query(`
      SELECT
        c.symbol,
        c.name as company_name,
        ih.market_value,
        ih.filing_date,
        fi.name as investor_name,
        fi.fund_name
      FROM investor_holdings ih
      JOIN companies c ON ih.company_id = c.id
      JOIN famous_investors fi ON ih.investor_id = fi.id
      WHERE ih.change_type = 'sold'
        AND ih.filing_date >= CURRENT_DATE - INTERVAL '90 days'
      ORDER BY ih.market_value DESC
      LIMIT $1
    `, [limit]);

    return {
      newPositions: newPositionsResult.rows.map(p => ({
        ...p,
        signalType: 'new_position',
        bullish: true,
      })),
      significantIncreases: increasesResult.rows.map(i => ({
        ...i,
        signalType: 'increase',
        bullish: true,
      })),
      exits: exitsResult.rows.map(e => ({
        ...e,
        signalType: 'exit',
        bullish: false,
      })),
    };
  }

  // ========================================
  // INSIDER TRADE CLASSIFICATION
  // ========================================

  /**
   * Get classified insider signal for a company
   * Distinguishes open market buys (most bullish) from option exercises
   */
  async getInsiderSignal(companyId) {
    const database = await getDatabaseAsync();

    const result = await database.query(`
      SELECT
        it.transaction_code,
        it.acquisition_disposition,
        it.shares_transacted,
        it.price_per_share,
        it.total_value,
        it.transaction_date,
        it.insider_name,
        it.insider_title,
        it.is_director,
        it.is_officer,
        it.is_ten_pct_owner,
        it.title
      FROM insider_transactions it
      WHERE it.company_id = $1
        AND it.transaction_date >= CURRENT_DATE - INTERVAL '180 days'
      ORDER BY it.transaction_date DESC
    `, [companyId]);

    const transactions = result.rows;

    if (!transactions || transactions.length === 0) {
      return { score: 0, confidence: 0, details: { noData: true } };
    }

    let score = 0;
    let totalWeight = 0;
    const details = {
      openMarketBuys: [],
      optionExercises: [],
      sells: [],
      netBuyValue: 0,
      netSellValue: 0,
    };

    for (const tx of transactions) {
      // Weight by insider seniority
      let seniorityWeight = 0.5;
      if (tx.is_ten_pct_owner) seniorityWeight = 1.0;
      else if (tx.is_officer && tx.title?.toLowerCase().includes('ceo')) seniorityWeight = 0.95;
      else if (tx.is_officer && tx.title?.toLowerCase().includes('cfo')) seniorityWeight = 0.85;
      else if (tx.is_officer) seniorityWeight = 0.7;
      else if (tx.is_director) seniorityWeight = 0.6;

      // Weight by value
      const value = tx.total_value || (tx.shares_transacted * tx.price_per_share) || 0;
      const valueWeight = Math.min(1, value / 500000); // $500K+ = max weight

      const weight = (seniorityWeight + valueWeight) / 2;

      const code = tx.transaction_code;
      const isAcquisition = tx.acquisition_disposition === 'A';

      if (code === 'P' && isAcquisition) {
        // Open market buy - MOST BULLISH
        score += 1.0 * weight;
        totalWeight += weight;
        details.openMarketBuys.push({
          insider: tx.insider_name,
          title: tx.insider_title,
          value: value,
          date: tx.transaction_date,
        });
        details.netBuyValue += value;

      } else if (code === 'M' && isAcquisition) {
        // Option exercise - neutral to slightly bullish (depends on if held)
        score += 0.1 * weight;
        totalWeight += weight;
        details.optionExercises.push({
          insider: tx.insider_name,
          title: tx.insider_title,
          shares: tx.shares_transacted,
          date: tx.transaction_date,
        });

      } else if (code === 'S' || (code === 'M' && !isAcquisition)) {
        // Sell - bearish (but less so if post-exercise)
        const sellWeight = code === 'S' ? weight : weight * 0.5;
        score -= 0.6 * sellWeight;
        totalWeight += sellWeight;
        details.sells.push({
          insider: tx.insider_name,
          title: tx.insider_title,
          value: value,
          date: tx.transaction_date,
        });
        details.netSellValue += value;

      } else if (code === 'A') {
        // Award/grant - neutral (compensation, not discretionary)
        // Don't count toward score
      }
    }

    const normalizedScore = totalWeight > 0 ? Math.max(-1, Math.min(1, score / totalWeight)) : 0;

    // Higher confidence if we have open market buys (cleaner signal)
    let confidence = 0.4;
    if (details.openMarketBuys.length > 0) confidence = 0.75;
    else if (transactions.length >= 5) confidence = 0.55;

    return {
      score: Math.round(normalizedScore * 1000) / 1000,
      confidence: Math.round(confidence * 100) / 100,
      signal: this._getSignalLabel(normalizedScore),
      interpretation: this._getInsiderInterpretation(normalizedScore, details),
      details,
    };
  }

  /**
   * Get top open market buys across all companies
   */
  async getTopOpenMarketBuys(limit = 30) {
    const database = await getDatabaseAsync();

    const result = await database.query(`
      SELECT
        c.symbol,
        c.name as company_name,
        it.insider_name,
        it.insider_title,
        it.total_value,
        it.shares_transacted,
        it.price_per_share,
        it.transaction_date
      FROM insider_transactions it
      JOIN companies c ON it.company_id = c.id
      WHERE it.transaction_code = 'P'
        AND it.acquisition_disposition = 'A'
        AND it.transaction_date >= CURRENT_DATE - INTERVAL '90 days'
      ORDER BY it.total_value DESC
      LIMIT $1
    `, [limit]);

    return result.rows;
  }

  // ========================================
  // EARNINGS SURPRISE MOMENTUM
  // ========================================

  /**
   * Get earnings momentum signal for a company
   * Based on consecutive beats, surprise magnitude, and trend
   */
  async getEarningsMomentumSignal(companyId) {
    const database = await getDatabaseAsync();

    const result = await database.query(`
      SELECT
        consecutive_beats,
        beat_rate,
        avg_surprise,
        history_json
      FROM earnings_momentum
      WHERE company_id = $1
    `, [companyId]);

    const earnings = result.rows[0];

    if (!earnings) {
      return { score: 0, confidence: 0, details: { noData: true } };
    }

    let score = 0;
    const details = {
      consecutiveBeats: earnings.consecutive_beats || 0,
      beatRate: earnings.beat_rate,
      avgSurprise: earnings.avg_surprise,
      recentQuarters: [],
    };

    // Parse history for trend analysis
    let history = [];
    try {
      if (earnings.history_json) {
        history = JSON.parse(earnings.history_json);
        details.recentQuarters = history.slice(0, 4).map(q => ({
          quarter: q.quarter,
          beat: q.beat,
          surprisePct: q.surprisePercent,
        }));
      }
    } catch (e) {
      // JSON parse error - continue without history
    }

    // Score based on consecutive beats
    const beats = details.consecutiveBeats;
    if (beats >= 4) {
      score = 0.8;  // 4+ consecutive beats = strong signal
    } else if (beats >= 3) {
      score = 0.6;
    } else if (beats >= 2) {
      score = 0.4;
    } else if (beats === 1) {
      score = 0.2;
    } else if (beats === 0 && history.length > 0) {
      // Check for consecutive misses
      const recentMisses = history.filter(q => !q.beat).length;
      if (recentMisses >= 3) score = -0.6;
      else if (recentMisses >= 2) score = -0.3;
    }

    // Adjust by surprise magnitude
    const avgSurprise = earnings.avg_surprise || 0;
    if (avgSurprise > 10) score *= 1.2;      // >10% avg surprise = amplify
    else if (avgSurprise > 5) score *= 1.1;
    else if (avgSurprise < -5) score *= 1.2; // Big misses = amplify negative

    // Check for improving/deteriorating trend
    if (history.length >= 4) {
      const recent2 = history.slice(0, 2);
      const older2 = history.slice(2, 4);
      const recentAvg = recent2.reduce((a, b) => a + (b.surprisePercent || 0), 0) / 2;
      const olderAvg = older2.reduce((a, b) => a + (b.surprisePercent || 0), 0) / 2;

      if (recentAvg > olderAvg + 2) {
        score += 0.15;  // Improving trend
        details.trend = 'improving';
      } else if (recentAvg < olderAvg - 2) {
        score -= 0.15;  // Deteriorating trend
        details.trend = 'deteriorating';
      } else {
        details.trend = 'stable';
      }
    }

    // Clamp score
    score = Math.max(-1, Math.min(1, score));

    // Confidence based on data availability
    const confidence = history.length >= 4 ? 0.75 : history.length >= 2 ? 0.5 : 0.3;

    return {
      score: Math.round(score * 1000) / 1000,
      confidence: Math.round(confidence * 100) / 100,
      signal: this._getSignalLabel(score),
      interpretation: this._getEarningsInterpretation(score, details),
      details,
    };
  }

  /**
   * Get companies with strong earnings momentum
   */
  async getEarningsMomentumOpportunities(minBeats = 3, limit = 30) {
    const database = await getDatabaseAsync();

    const result = await database.query(`
      SELECT
        c.symbol,
        c.name as company_name,
        em.consecutive_beats,
        em.beat_rate,
        em.avg_surprise,
        em.last_earnings_date
      FROM earnings_momentum em
      JOIN companies c ON em.company_id = c.id
      WHERE em.consecutive_beats >= $1
      ORDER BY em.consecutive_beats DESC, em.avg_surprise DESC
      LIMIT $2
    `, [minBeats, limit]);

    return result.rows;
  }

  // ========================================
  // COMBINED SIGNAL FOR TRADING AGENT
  // ========================================

  /**
   * Get all enhanced signals for a symbol
   * Used by TradingAgent
   */
  async getAllSignals(symbol) {
    const database = await getDatabaseAsync();

    const result = await database.query(`
      SELECT id FROM companies WHERE LOWER(symbol) = LOWER($1)
    `, [symbol]);

    const company = result.rows[0];
    if (!company) {
      return null;
    }

    return {
      thirteenF: await this.get13FSignal(company.id),
      insiderClassified: await this.getInsiderSignal(company.id),
      earningsMomentum: await this.getEarningsMomentumSignal(company.id),
    };
  }

  // ========================================
  // HELPERS
  // ========================================

  _getSignalLabel(score) {
    if (score >= 0.5) return 'strong_buy';
    if (score >= 0.2) return 'buy';
    if (score <= -0.5) return 'strong_sell';
    if (score <= -0.2) return 'sell';
    return 'neutral';
  }

  _get13FInterpretation(score, details) {
    const parts = [];

    if (details.newPositions.length > 0) {
      parts.push(`${details.newPositions.length} super-investor(s) initiated new positions`);
    }
    if (details.increases.length > 0) {
      parts.push(`${details.increases.length} increased holdings`);
    }
    if (details.exits.length > 0) {
      parts.push(`${details.exits.length} exited`);
    }
    if (details.decreases.length > 0) {
      parts.push(`${details.decreases.length} trimmed`);
    }

    return parts.length > 0
      ? parts.join('; ')
      : `13F signal: ${score >= 0 ? 'bullish' : 'bearish'}`;
  }

  _getInsiderInterpretation(score, details) {
    const parts = [];

    if (details.openMarketBuys.length > 0) {
      const totalBuy = details.netBuyValue;
      parts.push(`${details.openMarketBuys.length} open market buy(s) ($${(totalBuy/1000).toFixed(0)}K)`);
    }
    if (details.sells.length > 0) {
      parts.push(`${details.sells.length} sale(s)`);
    }
    if (details.optionExercises.length > 0) {
      parts.push(`${details.optionExercises.length} option exercise(s)`);
    }

    return parts.length > 0
      ? parts.join('; ')
      : 'No significant insider activity';
  }

  _getEarningsInterpretation(score, details) {
    if (details.noData) return 'No earnings data';

    const beats = details.consecutiveBeats;
    const surprise = details.avgSurprise?.toFixed(1) || '0';

    if (beats >= 4) {
      return `${beats} consecutive beats (avg ${surprise}% surprise) - strong momentum`;
    } else if (beats >= 2) {
      return `${beats} consecutive beats (avg ${surprise}% surprise)`;
    } else if (beats === 0 && score < 0) {
      return 'Missed expectations recently - negative momentum';
    }

    return `Beat rate: ${details.beatRate?.toFixed(0) || 0}%`;
  }
}

module.exports = { SignalEnhancements };

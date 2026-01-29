/**
 * FINRA Short Interest Service
 *
 * Fetches and processes short interest data from FINRA (bi-monthly releases).
 * Calculates short squeeze potential and bearish/bullish signals.
 *
 * Data Sources:
 * - FINRA Short Interest Files (public)
 * - Yahoo Finance (for float/outstanding shares)
 *
 * Signals:
 * - High short interest (>20%) = bearish sentiment
 * - Very high (>30%) + high days to cover = squeeze candidate
 * - Rising short interest = increasing conviction
 */

const https = require('https');

class FinraShortInterestService {
  constructor(db) {
    this.db = db;

    // Short interest thresholds
    this.THRESHOLDS = {
      HIGH_SHORT_PCT: 0.20,      // 20% of float is high
      VERY_HIGH_SHORT_PCT: 0.30, // 30% is very high
      HIGH_DAYS_TO_COVER: 5,     // 5 days is elevated
      VERY_HIGH_DAYS_TO_COVER: 10,
      SQUEEZE_THRESHOLD: {
        minShortPct: 0.25,
        minDaysToCover: 4
      }
    };

    // Prepare statements
    this.prepareStatements();
  }

  prepareStatements() {
    this.insertShortInterest = this.db.prepare(`
      INSERT INTO short_interest (
        company_id, symbol, settlement_date, short_interest,
        avg_daily_volume, days_to_cover, shares_outstanding, float_shares,
        short_pct_outstanding, short_pct_float, prior_short_interest,
        change_pct, squeeze_score, signal_score, source
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(symbol, settlement_date) DO UPDATE SET
        short_interest = excluded.short_interest,
        avg_daily_volume = excluded.avg_daily_volume,
        days_to_cover = excluded.days_to_cover,
        short_pct_float = excluded.short_pct_float,
        squeeze_score = excluded.squeeze_score,
        signal_score = excluded.signal_score
    `);

    this.getLatestShortInterest = this.db.prepare(`
      SELECT * FROM short_interest
      WHERE symbol = ?
      ORDER BY settlement_date DESC
      LIMIT 1
    `);

    this.getShortInterestHistory = this.db.prepare(`
      SELECT * FROM short_interest
      WHERE symbol = ?
        AND settlement_date >= date('now', ?)
      ORDER BY settlement_date DESC
    `);

    this.getPriorShortInterest = this.db.prepare(`
      SELECT short_interest FROM short_interest
      WHERE symbol = ?
        AND settlement_date < ?
      ORDER BY settlement_date DESC
      LIMIT 1
    `);

    this.getCompanyData = this.db.prepare(`
      SELECT
        c.id as company_id,
        c.symbol,
        pm.market_cap,
        pm.shares_outstanding,
        pm.avg_volume_30d as avg_volume_10d,
        pm.last_price
      FROM companies c
      LEFT JOIN price_metrics pm ON pm.company_id = c.id
      WHERE c.symbol = ?
    `);

    this.getSqueezeCandiates = this.db.prepare(`
      SELECT
        si.symbol,
        c.name as company_name,
        si.short_pct_float,
        si.days_to_cover,
        si.squeeze_score,
        si.signal_score,
        si.change_pct,
        si.settlement_date,
        pm.last_price,
        pm.market_cap
      FROM short_interest si
      JOIN companies c ON si.company_id = c.id
      LEFT JOIN price_metrics pm ON pm.company_id = c.id
      WHERE si.settlement_date = (
        SELECT MAX(settlement_date) FROM short_interest WHERE symbol = si.symbol
      )
        AND si.squeeze_score >= 0.4
      ORDER BY si.squeeze_score DESC
      LIMIT ?
    `);

    this.getMostShorted = this.db.prepare(`
      SELECT
        si.symbol,
        c.name as company_name,
        si.short_pct_float,
        si.short_interest,
        si.days_to_cover,
        si.change_pct,
        si.settlement_date,
        pm.last_price,
        pm.market_cap
      FROM short_interest si
      JOIN companies c ON si.company_id = c.id
      LEFT JOIN price_metrics pm ON pm.company_id = c.id
      WHERE si.settlement_date = (
        SELECT MAX(settlement_date) FROM short_interest WHERE symbol = si.symbol
      )
      ORDER BY si.short_pct_float DESC
      LIMIT ?
    `);
  }

  /**
   * Fetch short interest from Yahoo Finance API
   * (FINRA data is often delayed, Yahoo provides estimates)
   */
  async fetchShortInterest(symbol) {
    return new Promise((resolve, reject) => {
      const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${symbol}?modules=defaultKeyStatistics`;

      https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            const stats = json?.quoteSummary?.result?.[0]?.defaultKeyStatistics;

            if (!stats) {
              resolve(null);
              return;
            }

            resolve({
              shortInterest: stats.sharesShort?.raw || 0,
              shortPctFloat: stats.shortPercentOfFloat?.raw || 0,
              shortPctOutstanding: stats.sharesPercentSharesOut?.raw || 0,
              sharesOutstanding: stats.sharesOutstanding?.raw || 0,
              floatShares: stats.floatShares?.raw || 0,
              shortRatio: stats.shortRatio?.raw || 0, // days to cover
              priorShortInterest: stats.sharesShortPriorMonth?.raw || 0,
              shortInterestDate: stats.dateShortInterest?.fmt || null
            });
          } catch (e) {
            resolve(null);
          }
        });
      }).on('error', () => resolve(null));
    });
  }

  /**
   * Calculate squeeze score based on short interest metrics
   */
  calculateSqueezeScore(shortPctFloat, daysToCover, changeFromPrior) {
    if (!shortPctFloat || shortPctFloat < 0.15) return 0;

    let score = 0;

    // Base score from short % of float
    if (shortPctFloat >= 0.50) score += 0.4;
    else if (shortPctFloat >= 0.40) score += 0.35;
    else if (shortPctFloat >= 0.30) score += 0.3;
    else if (shortPctFloat >= 0.25) score += 0.25;
    else if (shortPctFloat >= 0.20) score += 0.2;
    else if (shortPctFloat >= 0.15) score += 0.1;

    // Days to cover component
    if (daysToCover >= 10) score += 0.3;
    else if (daysToCover >= 7) score += 0.25;
    else if (daysToCover >= 5) score += 0.2;
    else if (daysToCover >= 3) score += 0.1;

    // Momentum (increasing shorts = more conviction, could squeeze harder)
    if (changeFromPrior > 0.20) score += 0.15;
    else if (changeFromPrior > 0.10) score += 0.1;
    else if (changeFromPrior > 0) score += 0.05;

    // Decreasing shorts might indicate covering already started
    if (changeFromPrior < -0.10) score -= 0.1;

    return Math.min(1, Math.max(0, score));
  }

  /**
   * Calculate signal score for short interest
   * Negative = bearish sentiment (shorts expect decline)
   * Positive = squeeze opportunity (contrarian)
   */
  calculateSignalScore(shortPctFloat, daysToCover, squeezeScore) {
    if (!shortPctFloat) return null;

    // Base bearish signal from short interest level
    let bearishSignal = 0;
    if (shortPctFloat >= 0.30) bearishSignal = -0.8;
    else if (shortPctFloat >= 0.20) bearishSignal = -0.5;
    else if (shortPctFloat >= 0.10) bearishSignal = -0.3;
    else if (shortPctFloat >= 0.05) bearishSignal = -0.1;

    // If squeeze potential is high, flip to bullish (contrarian)
    if (squeezeScore >= 0.6) {
      // Strong squeeze candidate - contrarian bullish
      return squeezeScore * 0.5; // Up to +0.5
    } else if (squeezeScore >= 0.4) {
      // Moderate squeeze potential - reduce bearish signal
      return bearishSignal * 0.5;
    }

    // No squeeze potential - just bearish signal
    return bearishSignal;
  }

  /**
   * Update short interest for a symbol
   */
  async updateShortInterest(symbol) {
    console.log(`  Fetching short interest for ${symbol}...`);

    try {
      // Get company data
      const company = this.getCompanyData.get(symbol);
      if (!company) {
        console.log(`    Company not found: ${symbol}`);
        return null;
      }

      // Fetch short interest data
      const siData = await this.fetchShortInterest(symbol);
      if (!siData || !siData.shortInterest) {
        console.log(`    No short interest data available for ${symbol}`);
        return null;
      }

      // Use Yahoo data or fall back to calculated values
      const shortInterest = siData.shortInterest;
      // float_shares not in DB schema, estimate as 80% of shares outstanding or use Yahoo data
      const floatShares = siData.floatShares || (company.shares_outstanding ? company.shares_outstanding * 0.8 : null);
      const sharesOutstanding = siData.sharesOutstanding || company.shares_outstanding;
      const avgVolume = company.avg_volume_10d || 1;

      const shortPctFloat = floatShares > 0
        ? shortInterest / floatShares
        : siData.shortPctFloat || 0;

      const shortPctOutstanding = sharesOutstanding > 0
        ? shortInterest / sharesOutstanding
        : siData.shortPctOutstanding || 0;

      const daysToCover = siData.shortRatio || (avgVolume > 0
        ? shortInterest / avgVolume
        : 0);

      // Get prior short interest for change calculation
      const settlementDate = siData.shortInterestDate || new Date().toISOString().split('T')[0];
      const priorRow = this.getPriorShortInterest.get(symbol, settlementDate);
      const priorShortInterest = siData.priorShortInterest || priorRow?.short_interest || 0;

      const changePct = priorShortInterest > 0
        ? (shortInterest - priorShortInterest) / priorShortInterest
        : 0;

      // Calculate scores
      const squeezeScore = this.calculateSqueezeScore(shortPctFloat, daysToCover, changePct);
      const signalScore = this.calculateSignalScore(shortPctFloat, daysToCover, squeezeScore);

      // Store in database
      this.insertShortInterest.run(
        company.company_id,
        symbol,
        settlementDate,
        shortInterest,
        avgVolume,
        daysToCover,
        sharesOutstanding,
        floatShares,
        shortPctOutstanding,
        shortPctFloat,
        priorShortInterest,
        changePct,
        squeezeScore,
        signalScore,
        'yahoo'
      );

      // Note: is_squeeze_candidate is derived from squeeze_score >= 0.4
      const isSqueezeCandidate = squeezeScore >= 0.4 ? 1 : 0;

      console.log(`    Short: ${(shortPctFloat * 100).toFixed(1)}%, DTC: ${daysToCover.toFixed(1)}, ` +
                  `Squeeze: ${(squeezeScore * 100).toFixed(0)}%, Signal: ${signalScore?.toFixed(2) || 'N/A'}`);

      return {
        symbol,
        shortInterest,
        shortPctFloat,
        daysToCover,
        squeezeScore,
        signalScore,
        isSqueezeCandidate: isSqueezeCandidate === 1
      };

    } catch (error) {
      console.error(`    Error updating short interest for ${symbol}: ${error.message}`);
      return null;
    }
  }

  /**
   * Get short interest signal for a symbol
   */
  getShortInterestSignal(symbol) {
    const latest = this.getLatestShortInterest.get(symbol);

    if (!latest) {
      return {
        signal: null,
        shortPctFloat: null,
        daysToCover: null,
        isSqueezeCandidate: false,
        confidence: 0
      };
    }

    return {
      signal: latest.signal_score,
      shortPctFloat: latest.short_pct_float,
      shortPctOutstanding: latest.short_pct_outstanding,
      daysToCover: latest.days_to_cover,
      shortInterest: latest.short_interest,
      changePct: latest.change_pct,
      squeezeScore: latest.squeeze_score,
      isSqueezeCandidate: latest.squeeze_score >= 0.4,
      settlementDate: latest.settlement_date,
      confidence: latest.short_pct_float ? 0.8 : 0
    };
  }

  /**
   * Get squeeze candidates
   */
  getSqueezeCandidates(limit = 20) {
    return this.getSqueezeCandiates.all(limit);
  }

  /**
   * Get most shorted stocks
   */
  getMostShorted(limit = 20) {
    return this.getMostShorted.all(limit);
  }

  /**
   * Get short interest history for a symbol
   */
  getHistory(symbol, lookbackDays = '-365 days') {
    return this.getShortInterestHistory.all(symbol, lookbackDays);
  }

  /**
   * Batch update short interest for multiple symbols
   */
  async batchUpdate(symbols, delayMs = 500) {
    console.log(`\n📊 Batch updating short interest for ${symbols.length} symbols...\n`);

    const results = [];

    for (const symbol of symbols) {
      const result = await this.updateShortInterest(symbol);
      if (result) results.push(result);
      await new Promise(r => setTimeout(r, delayMs));
    }

    console.log(`\n✅ Updated ${results.length} symbols\n`);

    // Return summary
    const squeezeCandidates = results.filter(r => r.isSqueezeCandidate);
    const highShorts = results.filter(r => r.shortPctFloat >= this.THRESHOLDS.HIGH_SHORT_PCT);

    return {
      updated: results.length,
      squeezeCandidates: squeezeCandidates.length,
      highShorts: highShorts.length,
      results
    };
  }

  /**
   * Analyze short interest trends
   */
  analyzeShortTrends(symbol) {
    const history = this.getHistory(symbol, '-180 days');

    if (history.length < 2) {
      return { trend: 'unknown', confidence: 0 };
    }

    // Calculate trend
    const recent = history.slice(0, Math.min(3, history.length));
    const older = history.slice(-Math.min(3, history.length));

    const recentAvg = recent.reduce((s, r) => s + (r.short_pct_float || 0), 0) / recent.length;
    const olderAvg = older.reduce((s, r) => s + (r.short_pct_float || 0), 0) / older.length;

    let trend = 'stable';
    let momentum = 0;

    if (recentAvg > olderAvg * 1.20) {
      trend = 'increasing';
      momentum = (recentAvg - olderAvg) / olderAvg;
    } else if (recentAvg < olderAvg * 0.80) {
      trend = 'decreasing';
      momentum = (recentAvg - olderAvg) / olderAvg;
    }

    return {
      trend,
      momentum,
      recentPctFloat: recentAvg,
      historicalPctFloat: olderAvg,
      dataPoints: history.length,
      confidence: Math.min(history.length / 6, 1)
    };
  }
}

module.exports = { FinraShortInterestService };

/**
 * Market Indicators Service
 *
 * Provides market-level valuation metrics:
 * - Buffett Indicator (Market Cap / GDP)
 * - Aggregate Tobin's Q
 * - Market valuation percentiles (median P/E, % undervalued)
 * - Safe haven stocks
 * - Treasury yields and yield curve
 */

const db = require('../database');

class MarketIndicatorsService {
  constructor() {
    this.db = db.getDatabase();
  }

  /**
   * Helper to get latest annual metrics for a company
   * Uses a subquery to get the most recent annual period
   */
  getLatestAnnualMetricsQuery() {
    return `
      SELECT cm.*, c.symbol, c.name, c.sector, c.market_cap
      FROM calculated_metrics cm
      JOIN companies c ON cm.company_id = c.id
      WHERE cm.period_type = 'annual'
        AND cm.fiscal_period = (
          SELECT MAX(cm2.fiscal_period)
          FROM calculated_metrics cm2
          WHERE cm2.company_id = cm.company_id
            AND cm2.period_type = 'annual'
        )
    `;
  }

  /**
   * Get Buffett Indicator (Total Market Cap / GDP)
   * Uses Wilshire 5000 from FRED if available, otherwise sums our tracked stocks
   */
  async getBuffettIndicator() {
    // Try to get Wilshire 5000 from FRED cache
    const wilshire = this.db.prepare(`
      SELECT value, observation_date
      FROM economic_indicators
      WHERE series_id = 'WILL5000IND'
      ORDER BY observation_date DESC
      LIMIT 1
    `).get();

    const gdp = this.db.prepare(`
      SELECT value, observation_date
      FROM economic_indicators
      WHERE series_id = 'GDP'
      ORDER BY observation_date DESC
      LIMIT 1
    `).get();

    // If we don't have FRED data, calculate from our companies table
    if (!wilshire || !gdp) {
      return this.calculateBuffettFromCompanies();
    }

    // Wilshire 5000 is in index points representing billions
    // GDP is in billions
    const ratio = (wilshire.value / gdp.value) * 100;

    return {
      value: ratio,
      rawMarketCap: wilshire.value,
      rawGDP: gdp.value,
      marketCapDate: wilshire.observation_date,
      gdpDate: gdp.observation_date,
      assessment: this.assessBuffett(ratio),
      percentile: this.getBuffettPercentile(ratio)
    };
  }

  /**
   * Calculate Buffett Indicator from our companies table
   */
  calculateBuffettFromCompanies() {
    // Sum market caps from our tracked companies
    const marketCap = this.db.prepare(`
      SELECT SUM(market_cap) as total_market_cap,
             COUNT(*) as stock_count
      FROM companies
      WHERE market_cap > 0 AND is_active = 1
    `).get();

    // Get latest GDP from FRED
    const gdp = this.db.prepare(`
      SELECT value FROM economic_indicators
      WHERE series_id = 'GDP'
      ORDER BY observation_date DESC
      LIMIT 1
    `).get();

    if (!marketCap?.total_market_cap || !gdp?.value) {
      return {
        value: null,
        assessment: 'Insufficient data',
        note: 'Missing market cap or GDP data'
      };
    }

    // Convert market cap from dollars to billions to match GDP
    const marketCapBillions = marketCap.total_market_cap / 1e9;
    const ratio = (marketCapBillions / gdp.value) * 100;

    return {
      value: ratio,
      rawMarketCap: marketCapBillions,
      rawGDP: gdp.value,
      stockCount: marketCap.stock_count,
      assessment: this.assessBuffett(ratio),
      percentile: this.getBuffettPercentile(ratio),
      note: 'Calculated from tracked stocks (partial market)'
    };
  }

  assessBuffett(ratio) {
    if (ratio >= 200) return 'Extremely Overvalued';
    if (ratio >= 150) return 'Significantly Overvalued';
    if (ratio >= 120) return 'Modestly Overvalued';
    if (ratio >= 80) return 'Fair Value';
    if (ratio >= 60) return 'Modestly Undervalued';
    return 'Significantly Undervalued';
  }

  getBuffettPercentile(ratio) {
    // Historical percentiles (approximate)
    if (ratio >= 200) return 99;
    if (ratio >= 180) return 95;
    if (ratio >= 160) return 90;
    if (ratio >= 140) return 80;
    if (ratio >= 120) return 70;
    if (ratio >= 100) return 50;
    if (ratio >= 80) return 30;
    if (ratio >= 60) return 15;
    return 5;
  }

  /**
   * Get aggregate Tobin's Q from stock data
   * Tobin's Q = Market Value / Book Value
   */
  getMarketTobinQ() {
    try {
      const result = this.db.prepare(`
        SELECT
          SUM(c.market_cap) as total_market_cap,
          COUNT(*) as stock_count
        FROM companies c
        JOIN calculated_metrics cm ON c.id = cm.company_id
        WHERE c.market_cap > 0
          AND c.is_active = 1
          AND cm.period_type = 'annual'
          AND cm.tobins_q IS NOT NULL
          AND cm.fiscal_period = (
            SELECT MAX(cm2.fiscal_period)
            FROM calculated_metrics cm2
            WHERE cm2.company_id = cm.company_id
              AND cm2.period_type = 'annual'
          )
      `).get();

      // Calculate weighted average Tobin's Q
      const tobinData = this.db.prepare(`
        SELECT
          c.market_cap,
          cm.tobins_q
        FROM companies c
        JOIN calculated_metrics cm ON c.id = cm.company_id
        WHERE c.market_cap > 0
          AND c.is_active = 1
          AND cm.period_type = 'annual'
          AND cm.tobins_q > 0
          AND cm.tobins_q < 50
          AND cm.fiscal_period = (
            SELECT MAX(cm2.fiscal_period)
            FROM calculated_metrics cm2
            WHERE cm2.company_id = cm.company_id
              AND cm2.period_type = 'annual'
          )
      `).all();

      if (tobinData.length === 0) {
        return {
          value: null,
          assessment: 'Insufficient data'
        };
      }

      // Calculate market-cap weighted average Tobin's Q
      const totalMarketCap = tobinData.reduce((sum, row) => sum + row.market_cap, 0);
      const weightedTobinQ = tobinData.reduce((sum, row) =>
        sum + (row.tobins_q * row.market_cap / totalMarketCap), 0);

      return {
        value: weightedTobinQ,
        stockCount: tobinData.length,
        historicalAvg: 1.0,
        deviation: ((weightedTobinQ - 1.0) / 1.0) * 100,
        assessment: this.assessTobinQ(weightedTobinQ)
      };
    } catch (err) {
      console.error('Error calculating Tobin Q:', err.message);
      return {
        value: null,
        assessment: 'Insufficient data',
        note: err.message
      };
    }
  }

  assessTobinQ(q) {
    if (q >= 2.0) return 'Significantly Overvalued';
    if (q >= 1.5) return 'Modestly Overvalued';
    if (q >= 1.0) return 'Fair Value';
    if (q >= 0.7) return 'Modestly Undervalued';
    return 'Significantly Undervalued';
  }

  /**
   * Get aggregate valuation metrics from stock data
   */
  getAggregateValuationMetrics() {
    try {
      // Get P/E ratios
      const peData = this.db.prepare(`
        SELECT cm.pe_ratio
        FROM calculated_metrics cm
        JOIN companies c ON cm.company_id = c.id
        WHERE cm.pe_ratio > 0 AND cm.pe_ratio < 200
          AND cm.period_type = 'annual'
          AND c.is_active = 1
          AND cm.fiscal_period = (
            SELECT MAX(cm2.fiscal_period)
            FROM calculated_metrics cm2
            WHERE cm2.company_id = cm.company_id
              AND cm2.period_type = 'annual'
          )
        ORDER BY cm.pe_ratio
      `).all().map(r => r.pe_ratio);

      const medianPE = peData.length > 0
        ? peData[Math.floor(peData.length / 2)]
        : null;

      // Get P/B ratios
      const pbData = this.db.prepare(`
        SELECT cm.pb_ratio
        FROM calculated_metrics cm
        JOIN companies c ON cm.company_id = c.id
        WHERE cm.pb_ratio > 0 AND cm.pb_ratio < 50
          AND cm.period_type = 'annual'
          AND c.is_active = 1
          AND cm.fiscal_period = (
            SELECT MAX(cm2.fiscal_period)
            FROM calculated_metrics cm2
            WHERE cm2.company_id = cm.company_id
              AND cm2.period_type = 'annual'
          )
        ORDER BY cm.pb_ratio
      `).all().map(r => r.pb_ratio);

      const medianPB = pbData.length > 0
        ? pbData[Math.floor(pbData.length / 2)]
        : null;

      // Get FCF yield data
      const fcfData = this.db.prepare(`
        SELECT cm.fcf_yield
        FROM calculated_metrics cm
        JOIN companies c ON cm.company_id = c.id
        WHERE cm.fcf_yield IS NOT NULL AND cm.fcf_yield > -1 AND cm.fcf_yield < 1
          AND cm.period_type = 'annual'
          AND c.is_active = 1
          AND cm.fiscal_period = (
            SELECT MAX(cm2.fiscal_period)
            FROM calculated_metrics cm2
            WHERE cm2.company_id = cm.company_id
              AND cm2.period_type = 'annual'
          )
        ORDER BY cm.fcf_yield
      `).all().map(r => r.fcf_yield);

      const medianFCFYield = fcfData.length > 0
        ? fcfData[Math.floor(fcfData.length / 2)]
        : null;

      // Get MSI (Misean Stationarity Index = Enterprise Value / Book Value)
      const msiData = this.db.prepare(`
        SELECT cm.msi
        FROM calculated_metrics cm
        JOIN companies c ON cm.company_id = c.id
        WHERE cm.msi > 0 AND cm.msi < 50
          AND cm.period_type = 'annual'
          AND c.is_active = 1
          AND cm.fiscal_period = (
            SELECT MAX(cm2.fiscal_period)
            FROM calculated_metrics cm2
            WHERE cm2.company_id = cm.company_id
              AND cm2.period_type = 'annual'
          )
        ORDER BY cm.msi
      `).all().map(r => r.msi);

      const medianMSI = msiData.length > 0
        ? msiData[Math.floor(msiData.length / 2)]
        : null;

      // Calculate % undervalued (stocks with P/E below historical median of ~16)
      const undervaluedCount = peData.filter(pe => pe < 16).length;
      const totalCount = peData.length;
      const pctUndervalued = totalCount > 0
        ? (undervaluedCount / totalCount) * 100
        : null;

      return {
        medianPE,
        medianPB,
        medianFCFYield,
        medianMSI,
        pctUndervalued,
        totalStocks: totalCount,
        undervaluedStocks: undervaluedCount,
        peAssessment: this.assessMedianPE(medianPE),
        msiAssessment: this.assessMSI(medianMSI),
        dataQuality: {
          peCount: peData.length,
          pbCount: pbData.length,
          fcfCount: fcfData.length,
          msiCount: msiData.length
        }
      };
    } catch (err) {
      console.error('Error calculating aggregate metrics:', err.message);
      return {
        medianPE: null,
        medianPB: null,
        medianFCFYield: null,
        medianMSI: null,
        pctUndervalued: null,
        totalStocks: 0,
        undervaluedStocks: 0,
        peAssessment: 'N/A',
        msiAssessment: 'N/A',
        dataQuality: { peCount: 0, pbCount: 0, fcfCount: 0, msiCount: 0 },
        note: err.message
      };
    }
  }

  assessMedianPE(pe) {
    if (!pe) return 'N/A';
    if (pe >= 25) return 'Expensive';
    if (pe >= 20) return 'Above Average';
    if (pe >= 15) return 'Fair Value';
    if (pe >= 12) return 'Attractive';
    return 'Very Attractive';
  }

  assessMSI(msi) {
    // MSI = Enterprise Value / Book Value
    // Lower is better (more value for the book assets)
    if (!msi) return 'N/A';
    if (msi >= 5) return 'Very Expensive';
    if (msi >= 3) return 'Expensive';
    if (msi >= 2) return 'Above Average';
    if (msi >= 1.5) return 'Fair Value';
    if (msi >= 1) return 'Attractive';
    return 'Very Attractive';
  }

  /**
   * Get treasury yields and yield curve data
   */
  getTreasuryYields() {
    const getValue = (seriesId) => {
      const result = this.db.prepare(`
        SELECT value, observation_date
        FROM economic_indicators
        WHERE series_id = ?
        ORDER BY observation_date DESC
        LIMIT 1
      `).get(seriesId);
      return result?.value;
    };

    const twoYear = getValue('DGS2');
    const tenYear = getValue('DGS10');
    const thirtyYear = getValue('DGS30');
    const threeMonth = getValue('DGS3MO');
    const fiveYear = getValue('DGS5');

    const spread2s10s = tenYear && twoYear ? tenYear - twoYear : null;
    const spread3m10y = tenYear && threeMonth ? tenYear - threeMonth : null;

    // Get full yield curve
    const yieldCurve = this.db.prepare(`
      SELECT * FROM yield_curve
      ORDER BY curve_date DESC
      LIMIT 1
    `).get();

    return {
      threeMonth,
      sixMonth: getValue('DGS6MO'),
      oneYear: getValue('DGS1'),
      twoYear,
      fiveYear,
      tenYear,
      twentyYear: getValue('DGS20'),
      thirtyYear,
      spread2s10s,
      spread3m10y,
      curveInverted: spread2s10s !== null && spread2s10s < 0,
      curveInverted3m10y: spread3m10y !== null && spread3m10y < 0,
      assessment: this.assessYieldCurve(spread2s10s),
      fullCurve: yieldCurve
    };
  }

  assessYieldCurve(spread) {
    if (spread === null) return 'N/A';
    if (spread < -0.5) return 'Deeply Inverted - Recession Warning';
    if (spread < 0) return 'Inverted - Caution';
    if (spread < 0.5) return 'Flat - Late Cycle';
    if (spread < 1.5) return 'Normal';
    return 'Steep - Early Cycle';
  }

  /**
   * Get safe haven stocks
   * Criteria: High defensive score, low debt, positive FCF, dividend paying
   */
  getSafeHavens(limit = 10) {
    try {
      // Use defensive_score instead of beta since beta data isn't populated
      // Get only the latest factor score per company
      const safeHavens = this.db.prepare(`
        WITH latest_factors AS (
          SELECT fs.*
          FROM stock_factor_scores fs
          WHERE fs.score_date = (
            SELECT MAX(fs2.score_date)
            FROM stock_factor_scores fs2
            WHERE fs2.company_id = fs.company_id
          )
        )
        SELECT
          c.symbol,
          c.name,
          c.sector,
          c.market_cap,
          lf.defensive_score,
          cm.debt_to_equity,
          cm.fcf_yield,
          cm.dividend_yield,
          cm.current_ratio,
          cm.pe_ratio,
          cm.roic
        FROM companies c
        JOIN calculated_metrics cm ON c.id = cm.company_id
        LEFT JOIN latest_factors lf ON c.id = lf.company_id
        WHERE cm.period_type = 'annual'
          AND c.is_active = 1
          AND c.market_cap > 10000000000
          AND lf.defensive_score IS NOT NULL
          AND lf.defensive_score > 0.6
          AND (cm.debt_to_equity IS NULL OR cm.debt_to_equity < 0.8)
          AND cm.fcf_yield > 0
          AND cm.dividend_yield > 0
          AND cm.fiscal_period = (
            SELECT MAX(cm2.fiscal_period)
            FROM calculated_metrics cm2
            WHERE cm2.company_id = cm.company_id
              AND cm2.period_type = 'annual'
          )
        ORDER BY lf.defensive_score DESC, cm.dividend_yield DESC
        LIMIT ?
      `).all(limit);

      return safeHavens.map(stock => ({
        ...stock,
        safetyScore: this.calculateSafetyScore(stock)
      }));
    } catch (err) {
      console.error('Error getting safe havens:', err.message);
      return [];
    }
  }

  calculateSafetyScore(stock) {
    let score = 0;

    // Defensive score contribution (higher is better)
    if (stock.defensive_score > 0.8) score += 3;
    else if (stock.defensive_score > 0.7) score += 2;
    else score += 1;

    // Debt contribution (lower is better)
    if (stock.debt_to_equity === null || stock.debt_to_equity < 0.3) score += 3;
    else if (stock.debt_to_equity < 0.5) score += 2;
    else score += 1;

    // FCF contribution (higher is better)
    if (stock.fcf_yield > 0.05) score += 3;
    else if (stock.fcf_yield > 0.03) score += 2;
    else score += 1;

    // Dividend contribution
    if (stock.dividend_yield > 0.03) score += 2;
    else if (stock.dividend_yield > 0.01) score += 1;

    return score;
  }

  /**
   * Get undervalued quality stocks
   * Quality stocks trading below their sector median P/E
   */
  getUndervaluedQuality(limit = 10) {
    try {
      const opportunities = this.db.prepare(`
        WITH sector_medians AS (
          SELECT
            c.sector,
            AVG(cm.pe_ratio) as avg_pe
          FROM companies c
          JOIN calculated_metrics cm ON c.id = cm.company_id
          WHERE cm.pe_ratio > 0 AND cm.pe_ratio < 100
            AND cm.period_type = 'annual'
            AND c.is_active = 1
            AND cm.fiscal_period = (
              SELECT MAX(cm2.fiscal_period)
              FROM calculated_metrics cm2
              WHERE cm2.company_id = cm.company_id
                AND cm2.period_type = 'annual'
            )
          GROUP BY c.sector
        )
        SELECT
          c.symbol,
          c.name,
          c.sector,
          c.market_cap,
          cm.pe_ratio,
          sm.avg_pe as sector_avg_pe,
          cm.roic,
          cm.fcf_yield,
          cm.revenue_growth_yoy,
          (sm.avg_pe - cm.pe_ratio) / sm.avg_pe * 100 as discount_pct
        FROM companies c
        JOIN calculated_metrics cm ON c.id = cm.company_id
        JOIN sector_medians sm ON c.sector = sm.sector
        WHERE cm.pe_ratio > 0
          AND cm.pe_ratio < sm.avg_pe * 0.8
          AND cm.roic > 0.1
          AND cm.fcf_yield > 0
          AND cm.period_type = 'annual'
          AND c.is_active = 1
          AND c.market_cap > 5000000000
          AND cm.fiscal_period = (
            SELECT MAX(cm2.fiscal_period)
            FROM calculated_metrics cm2
            WHERE cm2.company_id = cm.company_id
              AND cm2.period_type = 'annual'
          )
        ORDER BY discount_pct DESC
        LIMIT ?
      `).all(limit);

      return opportunities;
    } catch (err) {
      console.error('Error getting undervalued quality:', err.message);
      return [];
    }
  }

  /**
   * Get all market indicators in one call
   */
  async getAllIndicators() {
    const [
      buffettIndicator,
      tobinQ,
      valuationMetrics,
      treasuryYields,
      safeHavens,
      opportunities
    ] = await Promise.all([
      this.getBuffettIndicator(),
      this.getMarketTobinQ(),
      this.getAggregateValuationMetrics(),
      this.getTreasuryYields(),
      this.getSafeHavens(10),
      this.getUndervaluedQuality(10)
    ]);

    // Get VIX and credit spreads
    const vix = this.db.prepare(`
      SELECT value FROM economic_indicators
      WHERE series_id = 'VIXCLS'
      ORDER BY observation_date DESC
      LIMIT 1
    `).get();

    const hySpread = this.db.prepare(`
      SELECT value FROM economic_indicators
      WHERE series_id = 'BAMLH0A0HYM2'
      ORDER BY observation_date DESC
      LIMIT 1
    `).get();

    // Determine overall market assessment
    const overallAssessment = this.getOverallAssessment({
      buffett: buffettIndicator,
      tobinQ,
      valuationMetrics,
      yields: treasuryYields,
      vix: vix?.value,
      hySpread: hySpread?.value
    });

    return {
      timestamp: new Date().toISOString(),
      buffettIndicator,
      marketTobinQ: tobinQ,
      aggregateValuation: valuationMetrics,
      treasuryYields,
      volatility: {
        vix: vix?.value,
        level: this.assessVix(vix?.value)
      },
      credit: {
        hySpread: hySpread?.value,
        level: this.assessCreditSpread(hySpread?.value)
      },
      safeHavens,
      opportunities,
      overallAssessment
    };
  }

  assessVix(vix) {
    if (!vix) return 'N/A';
    if (vix >= 30) return 'Crisis';
    if (vix >= 25) return 'Elevated';
    if (vix >= 20) return 'Above Normal';
    if (vix >= 15) return 'Normal';
    return 'Low';
  }

  assessCreditSpread(spread) {
    if (!spread) return 'N/A';
    if (spread >= 7) return 'Distressed';
    if (spread >= 5) return 'Stressed';
    if (spread >= 4) return 'Elevated';
    return 'Normal';
  }

  getOverallAssessment(data) {
    let bullishSignals = 0;
    let bearishSignals = 0;

    // Buffett Indicator
    if (data.buffett?.value < 100) bullishSignals++;
    if (data.buffett?.value > 150) bearishSignals++;

    // Tobin's Q
    if (data.tobinQ?.value < 1.0) bullishSignals++;
    if (data.tobinQ?.value > 1.5) bearishSignals++;

    // Median P/E
    if (data.valuationMetrics?.medianPE < 15) bullishSignals++;
    if (data.valuationMetrics?.medianPE > 22) bearishSignals++;

    // Yield curve
    if (data.yields?.curveInverted) bearishSignals++;
    if (data.yields?.spread2s10s > 1) bullishSignals++;

    // VIX
    if (data.vix > 25) bearishSignals++;
    if (data.vix < 15) bullishSignals++;

    // Credit spreads
    if (data.hySpread > 5) bearishSignals++;
    if (data.hySpread < 4) bullishSignals++;

    const netSignal = bullishSignals - bearishSignals;

    if (netSignal >= 3) return { signal: 'bullish', label: 'Favorable', description: 'Multiple indicators suggest attractive valuations' };
    if (netSignal >= 1) return { signal: 'neutral_bullish', label: 'Moderately Favorable', description: 'Mostly positive with some caution warranted' };
    if (netSignal >= -1) return { signal: 'neutral', label: 'Mixed', description: 'Balanced signals, selectivity important' };
    if (netSignal >= -3) return { signal: 'neutral_bearish', label: 'Cautious', description: 'Some warning signs, favor quality and defense' };
    return { signal: 'bearish', label: 'Unfavorable', description: 'Multiple warning signs, consider reducing risk' };
  }
}

module.exports = { MarketIndicatorsService };

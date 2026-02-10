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

const { getDatabaseAsync } = require('../lib/db');

class MarketIndicatorsService {
  constructor() {
    // No database parameter needed - using getDatabaseAsync()
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
   * Note: FRED discontinued Wilshire 5000 data on June 3, 2024
   * Now calculates from our tracked stocks with calibration factor
   */
  async getBuffettIndicator() {
    // FRED discontinued WILL5000IND in June 2024
    // Always calculate from our companies table with calibration
    return this.calculateBuffettFromCompanies();
  }

  /**
   * Calculate Buffett Indicator from our companies table
   * Uses calibration factor to align with external benchmarks
   */
  async calculateBuffettFromCompanies() {
    const database = await getDatabaseAsync();

    // Sum market caps from our tracked companies
    const marketCapResult = await database.query(`
      SELECT SUM(market_cap) as total_market_cap,
             COUNT(*) as stock_count
      FROM companies
      WHERE market_cap > 0 AND is_active = 1
    `);
    const marketCap = marketCapResult.rows[0];

    // Get latest GDP from FRED
    const gdpResult = await database.query(`
      SELECT value, observation_date FROM economic_indicators
      WHERE series_id = $1
      ORDER BY observation_date DESC
      LIMIT 1
    `, ['GDP']);
    const gdp = gdpResult.rows[0];

    if (!marketCap?.total_market_cap || !gdp?.value) {
      return {
        value: null,
        assessment: 'Insufficient data',
        note: 'Missing market cap or GDP data'
      };
    }

    // Convert market cap from dollars to billions to match GDP
    const marketCapBillions = marketCap.total_market_cap / 1e9;

    // Calibration factor 1.029 aligns our 4,200+ stock coverage with external
    // benchmarks (Wilshire 5000/GDP from longtermtrends.com, CurrentMarketValuation.com)
    // Note: FRED discontinued Wilshire 5000 data in June 2024
    const calibrationFactor = 1.029;
    const calibratedMarketCap = marketCapBillions * calibrationFactor;
    const ratio = (calibratedMarketCap / gdp.value) * 100;

    return {
      value: ratio,
      rawMarketCap: marketCapBillions,
      calibratedMarketCap: calibratedMarketCap,
      rawGDP: gdp.value,
      gdpDate: gdp.observation_date,
      stockCount: marketCap.stock_count,
      calibrationFactor: calibrationFactor,
      assessment: this.assessBuffett(ratio),
      percentile: this.getBuffettPercentile(ratio),
      note: 'Calculated from tracked stocks with calibration to Wilshire 5000'
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
   * Uses CTE instead of correlated subqueries
   */
  async getMarketTobinQ() {
    try {
      const database = await getDatabaseAsync();

      const tobinDataResult = await database.query(`
        WITH latest_metrics AS (
          SELECT cm.company_id, cm.tobins_q
          FROM calculated_metrics cm
          INNER JOIN (
            SELECT company_id, MAX(fiscal_period) as max_period
            FROM calculated_metrics
            WHERE period_type = 'annual'
            GROUP BY company_id
          ) latest ON cm.company_id = latest.company_id
            AND cm.fiscal_period = latest.max_period
            AND cm.period_type = 'annual'
          JOIN companies c ON cm.company_id = c.id
          WHERE c.market_cap > 0 AND c.is_active = 1
            AND cm.tobins_q > 0 AND cm.tobins_q < 50
        )
        SELECT c.market_cap, lm.tobins_q
        FROM companies c
        JOIN latest_metrics lm ON c.id = lm.company_id
        WHERE c.market_cap > 0 AND c.is_active = 1
      `);
      const tobinData = tobinDataResult.rows;

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
   * Single query with CTE instead of 4 sequential correlated-subquery queries
   */
  async getAggregateValuationMetrics() {
    try {
      const database = await getDatabaseAsync();

      const result = await database.query(`
        WITH latest_metrics AS (
          SELECT cm.pe_ratio, cm.pb_ratio, cm.fcf_yield, cm.msi
          FROM calculated_metrics cm
          INNER JOIN (
            SELECT company_id, MAX(fiscal_period) as max_period
            FROM calculated_metrics
            WHERE period_type = 'annual'
            GROUP BY company_id
          ) latest ON cm.company_id = latest.company_id
            AND cm.fiscal_period = latest.max_period
            AND cm.period_type = 'annual'
          JOIN companies c ON cm.company_id = c.id AND c.is_active = 1
        )
        SELECT pe_ratio, pb_ratio, fcf_yield, msi FROM latest_metrics
      `);
      const rows = result.rows || [];

      const peData = rows.filter(r => r.pe_ratio > 0 && r.pe_ratio < 200).map(r => r.pe_ratio).sort((a, b) => a - b);
      const pbData = rows.filter(r => r.pb_ratio > 0 && r.pb_ratio < 50).map(r => r.pb_ratio).sort((a, b) => a - b);
      const fcfData = rows.filter(r => r.fcf_yield != null && r.fcf_yield > -1 && r.fcf_yield < 1).map(r => r.fcf_yield).sort((a, b) => a - b);
      const msiData = rows.filter(r => r.msi > 0 && r.msi < 50).map(r => r.msi).sort((a, b) => a - b);

      const medianPE = peData.length > 0 ? peData[Math.floor(peData.length / 2)] : null;
      const medianPB = pbData.length > 0 ? pbData[Math.floor(pbData.length / 2)] : null;
      const medianFCFYield = fcfData.length > 0 ? fcfData[Math.floor(fcfData.length / 2)] : null;
      const medianMSI = msiData.length > 0 ? msiData[Math.floor(msiData.length / 2)] : null;
      const undervaluedCount = peData.filter(pe => pe < 16).length;
      const totalCount = peData.length;
      const pctUndervalued = totalCount > 0 ? (undervaluedCount / totalCount) * 100 : null;

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
   * Batched: 1 query for all yields (was 9 sequential round-trips), 1 for yield curve
   */
  async getTreasuryYields() {
    const database = await getDatabaseAsync();
    const seriesIds = ['DGS3MO', 'DGS6MO', 'DGS1', 'DGS2', 'DGS5', 'DGS10', 'DGS20', 'DGS30'];
    const ph1 = seriesIds.map((_, i) => `$${i + 1}`).join(', ');
    const ph2 = seriesIds.map((_, i) => `$${i + 9}`).join(', ');
    const params = [...seriesIds, ...seriesIds];

    const [yieldsResult, yieldCurveResult] = await Promise.all([
      database.query(`
        SELECT e.series_id, e.value
        FROM economic_indicators e
        INNER JOIN (
          SELECT series_id, MAX(observation_date) as max_date
          FROM economic_indicators
          WHERE series_id IN (${ph1})
          GROUP BY series_id
        ) latest ON e.series_id = latest.series_id AND e.observation_date = latest.max_date
        WHERE e.series_id IN (${ph2})
      `, params),
      database.query(`
        SELECT * FROM yield_curve
        ORDER BY curve_date DESC
        LIMIT 1
      `)
    ]);

    const values = Object.fromEntries(
      (yieldsResult.rows || []).map(r => [r.series_id, r.value])
    );
    const twoYear = values.DGS2;
    const tenYear = values.DGS10;
    const thirtyYear = values.DGS30;
    const threeMonth = values.DGS3MO;
    const spread2s10s = tenYear != null && twoYear != null ? tenYear - twoYear : null;
    const spread3m10y = tenYear != null && threeMonth != null ? tenYear - threeMonth : null;

    return {
      threeMonth,
      sixMonth: values.DGS6MO,
      oneYear: values.DGS1,
      twoYear,
      fiveYear: values.DGS5,
      tenYear,
      twentyYear: values.DGS20,
      thirtyYear,
      spread2s10s,
      spread3m10y,
      curveInverted: spread2s10s !== null && spread2s10s < 0,
      curveInverted3m10y: spread3m10y !== null && spread3m10y < 0,
      assessment: this.assessYieldCurve(spread2s10s),
      fullCurve: yieldCurveResult.rows?.[0] || null
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
   * Uses CTE instead of correlated subqueries
   */
  async getSafeHavens(limit = 10) {
    try {
      const database = await getDatabaseAsync();

      const safeHavensResult = await database.query(`
        WITH latest_factors AS (
          SELECT fs.company_id, fs.defensive_score
          FROM stock_factor_scores fs
          INNER JOIN (
            SELECT company_id, MAX(score_date) as max_date
            FROM stock_factor_scores
            GROUP BY company_id
          ) latest ON fs.company_id = latest.company_id AND fs.score_date = latest.max_date
        ),
        latest_metrics AS (
          SELECT cm.company_id, cm.debt_to_equity, cm.fcf_yield, cm.dividend_yield,
                 cm.current_ratio, cm.pe_ratio, cm.roic
          FROM calculated_metrics cm
          INNER JOIN (
            SELECT company_id, MAX(fiscal_period) as max_period
            FROM calculated_metrics
            WHERE period_type = 'annual'
            GROUP BY company_id
          ) lm ON cm.company_id = lm.company_id
            AND cm.fiscal_period = lm.max_period
            AND cm.period_type = 'annual'
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
        JOIN latest_metrics cm ON c.id = cm.company_id
        LEFT JOIN latest_factors lf ON c.id = lf.company_id
        WHERE c.is_active = 1
          AND c.market_cap > 10000000000
          AND lf.defensive_score IS NOT NULL
          AND lf.defensive_score > 0.6
          AND (cm.debt_to_equity IS NULL OR cm.debt_to_equity < 0.8)
          AND cm.fcf_yield > 0
          AND cm.dividend_yield > 0
        ORDER BY lf.defensive_score DESC, cm.dividend_yield DESC
        LIMIT $1
      `, [limit]);

      return safeHavensResult.rows.map(stock => ({
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
   * Uses CTE instead of correlated subqueries
   */
  async getUndervaluedQuality(limit = 10) {
    try {
      const database = await getDatabaseAsync();

      const opportunitiesResult = await database.query(`
        WITH latest_metrics AS (
          SELECT cm.company_id, cm.pe_ratio, cm.roic, cm.fcf_yield, cm.revenue_growth_yoy
          FROM calculated_metrics cm
          INNER JOIN (
            SELECT company_id, MAX(fiscal_period) as max_period
            FROM calculated_metrics
            WHERE period_type = 'annual'
            GROUP BY company_id
          ) latest ON cm.company_id = latest.company_id
            AND cm.fiscal_period = latest.max_period
            AND cm.period_type = 'annual'
          JOIN companies c ON cm.company_id = c.id
          WHERE c.is_active = 1 AND cm.pe_ratio > 0 AND cm.pe_ratio < 100
        ),
        sector_medians AS (
          SELECT c.sector, AVG(lm.pe_ratio) as avg_pe
          FROM companies c
          JOIN latest_metrics lm ON c.id = lm.company_id
          GROUP BY c.sector
        )
        SELECT
          c.symbol,
          c.name,
          c.sector,
          c.market_cap,
          lm.pe_ratio,
          sm.avg_pe as sector_avg_pe,
          lm.roic,
          lm.fcf_yield,
          lm.revenue_growth_yoy,
          (sm.avg_pe - lm.pe_ratio) / sm.avg_pe * 100 as discount_pct
        FROM companies c
        JOIN latest_metrics lm ON c.id = lm.company_id
        JOIN sector_medians sm ON c.sector = sm.sector
        WHERE lm.pe_ratio > 0
          AND lm.pe_ratio < sm.avg_pe * 0.8
          AND lm.roic > 0.1
          AND lm.fcf_yield > 0
          AND c.is_active = 1
          AND c.market_cap > 5000000000
        ORDER BY discount_pct DESC
        LIMIT $1
      `, [limit]);

      return opportunitiesResult.rows;
    } catch (err) {
      console.error('Error getting undervalued quality:', err.message);
      return [];
    }
  }

  /**
   * Get S&P 500 cap-weighted P/E ratio
   * Uses CTE instead of correlated subquery
   */
  async getSP500PE() {
    try {
      const database = await getDatabaseAsync();

      const resultQuery = await database.query(`
        WITH latest_metrics AS (
          SELECT cm.company_id, cm.pe_ratio
          FROM calculated_metrics cm
          INNER JOIN (
            SELECT company_id, MAX(fiscal_period) as max_period
            FROM calculated_metrics
            WHERE period_type = 'annual'
            GROUP BY company_id
          ) latest ON cm.company_id = latest.company_id
            AND cm.fiscal_period = latest.max_period
            AND cm.period_type = 'annual'
          WHERE cm.pe_ratio IS NOT NULL AND cm.pe_ratio > 0 AND cm.pe_ratio < 500
        ),
        sp500_data AS (
          SELECT c.id, c.symbol, c.market_cap, lm.pe_ratio
          FROM index_constituents ic
          JOIN companies c ON ic.company_id = c.id
          JOIN latest_metrics lm ON lm.company_id = c.id
          WHERE ic.index_id = 1
            AND c.market_cap > 0
        )
        SELECT
          SUM(market_cap) as total_market_cap,
          SUM(market_cap / pe_ratio) as total_earnings,
          COUNT(*) as company_count
        FROM sp500_data
      `);
      const result = resultQuery.rows[0];

      if (!result || !result.total_earnings || result.total_earnings <= 0) {
        return null;
      }

      const weightedPE = result.total_market_cap / result.total_earnings;

      return {
        value: Math.round(weightedPE * 100) / 100,
        companyCount: result.company_count,
        totalMarketCap: result.total_market_cap,
        assessment: this.assessSP500PE(weightedPE)
      };
    } catch (error) {
      console.error('Error calculating S&P 500 P/E:', error);
      return null;
    }
  }

  assessSP500PE(pe) {
    if (!pe) return 'N/A';
    if (pe >= 30) return 'Extremely Overvalued';
    if (pe >= 25) return 'Overvalued';
    if (pe >= 20) return 'Above Average';
    if (pe >= 15) return 'Fair Value';
    if (pe >= 10) return 'Undervalued';
    return 'Extremely Undervalued';
  }

  /**
   * Get all market indicators in one call
   */
  async getAllIndicators() {
    const database = await getDatabaseAsync();

    const [
      buffettIndicator,
      tobinQ,
      valuationMetrics,
      treasuryYields,
      safeHavens,
      opportunities,
      sp500PE
    ] = await Promise.all([
      this.getBuffettIndicator(),
      this.getMarketTobinQ(),
      this.getAggregateValuationMetrics(),
      this.getTreasuryYields(),
      this.getSafeHavens(10),
      this.getUndervaluedQuality(10),
      this.getSP500PE()
    ]);

    // Get VIX and credit spreads
    const vixResult = await database.query(`
      SELECT value FROM economic_indicators
      WHERE series_id = $1
      ORDER BY observation_date DESC
      LIMIT 1
    `, ['VIXCLS']);
    const vix = vixResult.rows[0];

    const hySpreadResult = await database.query(`
      SELECT value FROM economic_indicators
      WHERE series_id = $1
      ORDER BY observation_date DESC
      LIMIT 1
    `, ['BAMLH0A0HYM2']);
    const hySpread = hySpreadResult.rows[0];

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
      sp500PE,
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

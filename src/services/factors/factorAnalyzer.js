// src/services/factors/factorAnalyzer.js
// Analyzes factor exposures at the portfolio and investor level

const { getDatabaseAsync } = require('../../lib/db');

/**
 * FactorAnalyzer
 *
 * Provides portfolio-level factor analysis including:
 * - Portfolio factor exposures (weighted average of holdings)
 * - Factor tilts relative to benchmark
 * - Factor attribution for returns
 * - Style box classification
 * - Factor regime analysis
 */
class FactorAnalyzer {
  constructor() {
    // No db needed
  }

  /**
   * Calculate portfolio factor exposures for an investor at a point in time
   */
  async calculatePortfolioExposures(investorId, snapshotDate, options = {}) {
    const database = await getDatabaseAsync();
    const { verbose = false, benchmark = 'market' } = options;

    // Get investor holdings at this date
    const holdingsResult = await database.query(`
      SELECT
        ih.company_id,
        ih.cusip,
        c.symbol,
        ih.market_value,
        ih.portfolio_weight,
        ih.shares
      FROM investor_holdings ih
      LEFT JOIN companies c ON ih.company_id = c.id
      WHERE ih.investor_id = $1
        AND ih.filing_date = (
          SELECT MAX(filing_date)
          FROM investor_holdings
          WHERE investor_id = $2
            AND filing_date <= $3
        )
        AND ih.shares > 0
    `, [investorId, investorId, snapshotDate]);

    const holdings = holdingsResult.rows;

    if (holdings.length === 0) {
      if (verbose) console.log('  No holdings found for this date');
      return null;
    }

    // Get factor scores for each holding
    const holdingsWithFactors = await Promise.all(holdings.map(async holding => {
      const result = await database.query(`
        SELECT * FROM stock_factor_scores
        WHERE company_id = $1
          AND score_date <= $2
        ORDER BY score_date DESC
        LIMIT 1
      `, [holding.company_id, snapshotDate]);

      const factors = result.rows[0];
      return { ...holding, factors };
    }));

    const filtered = holdingsWithFactors.filter(h => h.factors);

    if (filtered.length === 0) {
      if (verbose) console.log('  No factor data available for holdings');
      return null;
    }

    // Calculate total portfolio value for weighting
    const totalValue = filtered.reduce((sum, h) => sum + (h.market_value || 0), 0);

    // Calculate weighted average factor scores
    const weightedFactors = this._calculateWeightedFactors(filtered, totalValue);

    // Get benchmark exposures for comparison
    const benchmarkExposures = await this._getBenchmarkExposures(snapshotDate, benchmark);

    // Calculate factor tilts
    const tilts = this._calculateFactorTilts(weightedFactors, benchmarkExposures);

    // Classify style box
    const styleBox = this._classifyStyleBox(weightedFactors, tilts);

    // Calculate portfolio characteristics
    const characteristics = await this._calculatePortfolioCharacteristics(filtered, totalValue);

    // Store exposures
    const result = {
      investor_id: investorId,
      snapshot_date: snapshotDate,
      ...weightedFactors,
      ...tilts,
      ...characteristics,
      style_box: styleBox.style,
      style_confidence: styleBox.confidence,
      position_count: filtered.length
    };

    await this._storePortfolioExposures(result);

    return result;
  }

  /**
   * Calculate weighted average factor scores
   */
  _calculateWeightedFactors(holdings, totalValue) {
    const factors = ['value', 'quality', 'momentum', 'growth', 'size', 'volatility', 'dividend'];
    const result = {};

    for (const factor of factors) {
      const scoreKey = `${factor}_score`;
      let weightedSum = 0;
      let totalWeight = 0;

      for (const holding of holdings) {
        if (holding.factors && holding.factors[scoreKey] != null) {
          const weight = (holding.market_value || 0) / totalValue;
          weightedSum += holding.factors[scoreKey] * weight;
          totalWeight += weight;
        }
      }

      result[`avg_${factor}_score`] = totalWeight > 0 ? weightedSum / totalWeight : null;
    }

    return result;
  }

  /**
   * Get benchmark factor exposures
   */
  async _getBenchmarkExposures(date, benchmark) {
    // For now, use market average (percentile 50)
    // In production, could use S&P 500 or sector-specific benchmarks
    if (benchmark === 'market') {
      return {
        value: 50,
        quality: 50,
        momentum: 50,
        growth: 50,
        size: 50,
        volatility: 50,
        dividend: 50
      };
    }

    // Could implement sector-specific or custom benchmarks
    return {
      value: 50,
      quality: 50,
      momentum: 50,
      growth: 50,
      size: 50,
      volatility: 50,
      dividend: 50
    };
  }

  /**
   * Calculate factor tilts relative to benchmark
   */
  _calculateFactorTilts(portfolioFactors, benchmarkFactors) {
    const factors = ['value', 'quality', 'momentum', 'growth', 'size'];

    const tilts = {};
    for (const factor of factors) {
      const portfolioScore = portfolioFactors[`avg_${factor}_score`];
      const benchmarkScore = benchmarkFactors[factor];

      if (portfolioScore != null && benchmarkScore != null) {
        // Tilt is difference from benchmark, normalized
        tilts[`${factor}_tilt`] = (portfolioScore - benchmarkScore) / 50; // Scale to roughly -1 to +1
      } else {
        tilts[`${factor}_tilt`] = null;
      }
    }

    return tilts;
  }

  /**
   * Classify portfolio into style box
   */
  _classifyStyleBox(factors, tilts) {
    // Size classification
    let size;
    const sizeTilt = tilts.size_tilt || 0;
    if (sizeTilt > 0.3) size = 'small';
    else if (sizeTilt < -0.3) size = 'large';
    else size = 'mid';

    // Style classification (value vs growth)
    const valueTilt = tilts.value_tilt || 0;
    const growthTilt = tilts.growth_tilt || 0;

    let style;
    if (valueTilt > 0.3 && valueTilt > growthTilt + 0.2) style = 'value';
    else if (growthTilt > 0.3 && growthTilt > valueTilt + 0.2) style = 'growth';
    else style = 'blend';

    // Calculate confidence
    const confidence = Math.max(
      Math.abs(sizeTilt),
      Math.abs(valueTilt - growthTilt)
    ) * 100;

    return {
      style: `${size}_${style}`,
      confidence: Math.min(100, confidence)
    };
  }

  /**
   * Calculate portfolio characteristics from holdings
   */
  async _calculatePortfolioCharacteristics(holdings, totalValue) {
    const database = await getDatabaseAsync();

    // Get additional metrics for each holding
    const holdingsWithMetrics = await Promise.all(holdings.map(async h => {
      const metricsResult = await database.query(`
        SELECT
          pe_ratio, pb_ratio, roe, roic,
          revenue_growth_yoy, earnings_growth_yoy,
          dividend_yield
        FROM calculated_metrics
        WHERE company_id = $1
        ORDER BY fiscal_period DESC
        LIMIT 1
      `, [h.company_id]);

      const companyResult = await database.query(`
        SELECT market_cap FROM companies WHERE id = $1
      `, [h.company_id]);

      const metrics = metricsResult.rows[0];
      const company = companyResult.rows[0];

      return { ...h, metrics, company };
    }));

    // Calculate weighted averages
    const weightedMetrics = {
      weighted_pe: this._weightedAverage(holdingsWithMetrics, 'metrics.pe_ratio', totalValue),
      weighted_pb: this._weightedAverage(holdingsWithMetrics, 'metrics.pb_ratio', totalValue),
      weighted_roe: this._weightedAverage(holdingsWithMetrics, 'metrics.roe', totalValue),
      weighted_roic: this._weightedAverage(holdingsWithMetrics, 'metrics.roic', totalValue),
      weighted_revenue_growth: this._weightedAverage(holdingsWithMetrics, 'metrics.revenue_growth_yoy', totalValue),
      weighted_earnings_growth: this._weightedAverage(holdingsWithMetrics, 'metrics.earnings_growth_yoy', totalValue),
      weighted_dividend_yield: this._weightedAverage(holdingsWithMetrics, 'metrics.dividend_yield', totalValue),
      weighted_market_cap: this._weightedAverage(holdingsWithMetrics, 'company.market_cap', totalValue)
    };

    // Calculate concentration metrics
    const weights = holdingsWithMetrics.map(h => (h.market_value || 0) / totalValue);
    const herfindahl = weights.reduce((sum, w) => sum + w * w, 0);

    const sortedWeights = [...weights].sort((a, b) => b - a);
    const top10Weight = sortedWeights.slice(0, 10).reduce((sum, w) => sum + w, 0);

    // Sector concentration
    const sectorWeights = {};
    holdingsWithMetrics.forEach(h => {
      const sector = h.factors?.sector || 'Unknown';
      sectorWeights[sector] = (sectorWeights[sector] || 0) + (h.market_value || 0) / totalValue;
    });
    const sectorConcentration = Object.values(sectorWeights).reduce((sum, w) => sum + w * w, 0);

    return {
      ...weightedMetrics,
      herfindahl_index: herfindahl,
      top_10_weight: top10Weight * 100,
      sector_concentration: sectorConcentration
    };
  }

  /**
   * Calculate weighted average for a nested property
   */
  _weightedAverage(holdings, path, totalValue) {
    let weightedSum = 0;
    let totalWeight = 0;

    for (const holding of holdings) {
      const value = this._getNestedValue(holding, path);
      if (value != null && !isNaN(value)) {
        const weight = (holding.market_value || 0) / totalValue;
        weightedSum += value * weight;
        totalWeight += weight;
      }
    }

    return totalWeight > 0 ? weightedSum / totalWeight : null;
  }

  /**
   * Get nested object value
   */
  _getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  /**
   * Store portfolio exposures in database
   */
  async _storePortfolioExposures(exposures) {
    const database = await getDatabaseAsync();

    await database.query(`
      INSERT INTO portfolio_factor_exposures (
        investor_id, snapshot_date,
        avg_value_score, avg_quality_score, avg_momentum_score,
        avg_growth_score, avg_size_score, avg_volatility_score, avg_dividend_score,
        value_tilt, quality_tilt, momentum_tilt, growth_tilt, size_tilt,
        weighted_pe, weighted_pb, weighted_roe, weighted_roic,
        weighted_revenue_growth, weighted_earnings_growth, weighted_dividend_yield,
        weighted_market_cap, herfindahl_index, top_10_weight, sector_concentration,
        style_box, style_confidence, position_count, created_at
      ) VALUES (
        $1, $2,
        $3, $4, $5,
        $6, $7, $8, $9,
        $10, $11, $12, $13, $14,
        $15, $16, $17, $18,
        $19, $20, $21,
        $22, $23, $24, $25,
        $26, $27, $28, CURRENT_TIMESTAMP
      )
      ON CONFLICT (investor_id, snapshot_date)
      DO UPDATE SET
        avg_value_score = EXCLUDED.avg_value_score,
        avg_quality_score = EXCLUDED.avg_quality_score,
        avg_momentum_score = EXCLUDED.avg_momentum_score,
        avg_growth_score = EXCLUDED.avg_growth_score,
        avg_size_score = EXCLUDED.avg_size_score,
        avg_volatility_score = EXCLUDED.avg_volatility_score,
        avg_dividend_score = EXCLUDED.avg_dividend_score,
        value_tilt = EXCLUDED.value_tilt,
        quality_tilt = EXCLUDED.quality_tilt,
        momentum_tilt = EXCLUDED.momentum_tilt,
        growth_tilt = EXCLUDED.growth_tilt,
        size_tilt = EXCLUDED.size_tilt,
        weighted_pe = EXCLUDED.weighted_pe,
        weighted_pb = EXCLUDED.weighted_pb,
        weighted_roe = EXCLUDED.weighted_roe,
        weighted_roic = EXCLUDED.weighted_roic,
        weighted_revenue_growth = EXCLUDED.weighted_revenue_growth,
        weighted_earnings_growth = EXCLUDED.weighted_earnings_growth,
        weighted_dividend_yield = EXCLUDED.weighted_dividend_yield,
        weighted_market_cap = EXCLUDED.weighted_market_cap,
        herfindahl_index = EXCLUDED.herfindahl_index,
        top_10_weight = EXCLUDED.top_10_weight,
        sector_concentration = EXCLUDED.sector_concentration,
        style_box = EXCLUDED.style_box,
        style_confidence = EXCLUDED.style_confidence,
        position_count = EXCLUDED.position_count,
        created_at = EXCLUDED.created_at
    `, [
      exposures.investor_id, exposures.snapshot_date,
      exposures.avg_value_score, exposures.avg_quality_score, exposures.avg_momentum_score,
      exposures.avg_growth_score, exposures.avg_size_score, exposures.avg_volatility_score, exposures.avg_dividend_score,
      exposures.value_tilt, exposures.quality_tilt, exposures.momentum_tilt, exposures.growth_tilt, exposures.size_tilt,
      exposures.weighted_pe, exposures.weighted_pb, exposures.weighted_roe, exposures.weighted_roic,
      exposures.weighted_revenue_growth, exposures.weighted_earnings_growth, exposures.weighted_dividend_yield,
      exposures.weighted_market_cap, exposures.herfindahl_index, exposures.top_10_weight, exposures.sector_concentration,
      exposures.style_box, exposures.style_confidence, exposures.position_count
    ]);
  }

  /**
   * Get investor factor profile
   */
  async getInvestorFactorProfile(investorId) {
    const database = await getDatabaseAsync();

    // Get latest exposures
    const latestResult = await database.query(`
      SELECT * FROM portfolio_factor_exposures
      WHERE investor_id = $1
      ORDER BY snapshot_date DESC
      LIMIT 1
    `, [investorId]);

    const latest = latestResult.rows[0];

    // Get historical average tilts
    const historicalAvgResult = await database.query(`
      SELECT
        AVG(value_tilt) as avg_value_tilt,
        AVG(quality_tilt) as avg_quality_tilt,
        AVG(momentum_tilt) as avg_momentum_tilt,
        AVG(growth_tilt) as avg_growth_tilt,
        AVG(size_tilt) as avg_size_tilt,
        AVG(avg_value_score) as hist_value_score,
        AVG(avg_quality_score) as hist_quality_score,
        COUNT(*) as observation_count
      FROM portfolio_factor_exposures
      WHERE investor_id = $1
    `, [investorId]);

    const historicalAvg = historicalAvgResult.rows[0];

    // Get factor consistency (standard deviation of tilts)
    const consistencyResult = await database.query(`
      SELECT
        CASE WHEN COUNT(*) > 1 THEN
          SQRT(SUM((value_tilt - (SELECT AVG(value_tilt) FROM portfolio_factor_exposures WHERE investor_id = $1)) *
               (value_tilt - (SELECT AVG(value_tilt) FROM portfolio_factor_exposures WHERE investor_id = $2))) / COUNT(*))
        ELSE 0 END as value_tilt_std,
        CASE WHEN COUNT(*) > 1 THEN
          SQRT(SUM((quality_tilt - (SELECT AVG(quality_tilt) FROM portfolio_factor_exposures WHERE investor_id = $3)) *
               (quality_tilt - (SELECT AVG(quality_tilt) FROM portfolio_factor_exposures WHERE investor_id = $4))) / COUNT(*))
        ELSE 0 END as quality_tilt_std
      FROM portfolio_factor_exposures
      WHERE investor_id = $5
    `, [investorId, investorId, investorId, investorId, investorId]);

    const consistency = consistencyResult.rows[0];

    // Determine dominant factor style
    const tilts = [
      { factor: 'value', tilt: historicalAvg?.avg_value_tilt || 0 },
      { factor: 'quality', tilt: historicalAvg?.avg_quality_tilt || 0 },
      { factor: 'momentum', tilt: historicalAvg?.avg_momentum_tilt || 0 },
      { factor: 'growth', tilt: historicalAvg?.avg_growth_tilt || 0 },
      { factor: 'size', tilt: historicalAvg?.avg_size_tilt || 0 }
    ].sort((a, b) => Math.abs(b.tilt) - Math.abs(a.tilt));

    const dominantFactor = tilts[0];
    const secondaryFactor = tilts[1];

    return {
      investorId,
      current: latest,
      historical: historicalAvg,
      consistency,
      dominantFactor: dominantFactor.factor,
      dominantTilt: dominantFactor.tilt,
      secondaryFactor: secondaryFactor.factor,
      secondaryTilt: secondaryFactor.tilt,
      factorStyle: this._describeFactorStyle(tilts)
    };
  }

  /**
   * Describe factor style in human-readable terms
   */
  _describeFactorStyle(tilts) {
    const descriptions = [];

    for (const { factor, tilt } of tilts.slice(0, 2)) {
      if (Math.abs(tilt) > 0.2) {
        const direction = tilt > 0 ? 'high' : 'low';
        descriptions.push(`${direction} ${factor}`);
      }
    }

    if (descriptions.length === 0) return 'Balanced/Blend';
    return descriptions.join(', ');
  }

  /**
   * Compare factor exposures between investors
   */
  async compareInvestorFactors(investorIds, snapshotDate = null) {
    const database = await getDatabaseAsync();
    const results = [];

    for (const investorId of investorIds) {
      let exposureResult;
      if (snapshotDate) {
        exposureResult = await database.query(`
          SELECT pfe.*, fi.name as investor_name
          FROM portfolio_factor_exposures pfe
          JOIN famous_investors fi ON pfe.investor_id = fi.id
          WHERE pfe.investor_id = $1 AND pfe.snapshot_date <= $2
          ORDER BY pfe.snapshot_date DESC
          LIMIT 1
        `, [investorId, snapshotDate]);
      } else {
        exposureResult = await database.query(`
          SELECT pfe.*, fi.name as investor_name
          FROM portfolio_factor_exposures pfe
          JOIN famous_investors fi ON pfe.investor_id = fi.id
          WHERE pfe.investor_id = $1
          ORDER BY pfe.snapshot_date DESC
          LIMIT 1
        `, [investorId]);
      }

      const exposure = exposureResult.rows[0];
      if (exposure) {
        results.push(exposure);
      }
    }

    return results;
  }

  /**
   * Calculate factor attribution for an investor's returns
   */
  async calculateFactorAttribution(investorId, periodStart, periodEnd, options = {}) {
    const database = await getDatabaseAsync();
    const { verbose = false } = options;

    // Get factor exposures during the period
    const exposuresResult = await database.query(`
      SELECT * FROM portfolio_factor_exposures
      WHERE investor_id = $1
        AND snapshot_date >= $2
        AND snapshot_date <= $3
      ORDER BY snapshot_date
    `, [investorId, periodStart, periodEnd]);

    const exposures = exposuresResult.rows;

    if (exposures.length === 0) {
      return null;
    }

    // Calculate average exposures during period
    const avgExposures = {
      value: exposures.reduce((sum, e) => sum + (e.value_tilt || 0), 0) / exposures.length,
      quality: exposures.reduce((sum, e) => sum + (e.quality_tilt || 0), 0) / exposures.length,
      momentum: exposures.reduce((sum, e) => sum + (e.momentum_tilt || 0), 0) / exposures.length,
      growth: exposures.reduce((sum, e) => sum + (e.growth_tilt || 0), 0) / exposures.length,
      size: exposures.reduce((sum, e) => sum + (e.size_tilt || 0), 0) / exposures.length
    };

    // Get factor returns during the period
    const factorReturnsResult = await database.query(`
      SELECT * FROM factor_returns
      WHERE return_date >= $1 AND return_date <= $2
      ORDER BY return_date
    `, [periodStart, periodEnd]);

    const factorReturns = factorReturnsResult.rows;

    // Calculate factor contributions (exposure * factor return)
    // This is a simplified Brinson-style attribution
    const contributions = {
      value: avgExposures.value * (factorReturns.reduce((sum, r) => sum + (r.value_return || 0), 0)),
      quality: avgExposures.quality * (factorReturns.reduce((sum, r) => sum + (r.quality_return || 0), 0)),
      momentum: avgExposures.momentum * (factorReturns.reduce((sum, r) => sum + (r.momentum_return || 0), 0)),
      growth: avgExposures.growth * (factorReturns.reduce((sum, r) => sum + (r.growth_return || 0), 0)),
      size: avgExposures.size * (factorReturns.reduce((sum, r) => sum + (r.size_return || 0), 0))
    };

    // Note: actual total return and alpha would require actual portfolio return data
    const result = {
      investor_id: investorId,
      period_start: periodStart,
      period_end: periodEnd,
      period_type: 'custom',
      value_contribution: contributions.value,
      quality_contribution: contributions.quality,
      momentum_contribution: contributions.momentum,
      growth_contribution: contributions.growth,
      size_contribution: contributions.size,
      avg_value_exposure: avgExposures.value,
      avg_quality_exposure: avgExposures.quality,
      avg_momentum_exposure: avgExposures.momentum,
      avg_growth_exposure: avgExposures.growth,
      avg_size_exposure: avgExposures.size
    };

    // Store attribution
    await database.query(`
      INSERT INTO investor_factor_attribution (
        investor_id, period_start, period_end, period_type,
        value_contribution, quality_contribution, momentum_contribution,
        growth_contribution, size_contribution,
        avg_value_exposure, avg_quality_exposure, avg_momentum_exposure,
        avg_growth_exposure, avg_size_exposure,
        created_at
      ) VALUES (
        $1, $2, $3, $4,
        $5, $6, $7,
        $8, $9,
        $10, $11, $12,
        $13, $14,
        CURRENT_TIMESTAMP
      )
      ON CONFLICT (investor_id, period_start, period_end, period_type)
      DO UPDATE SET
        value_contribution = EXCLUDED.value_contribution,
        quality_contribution = EXCLUDED.quality_contribution,
        momentum_contribution = EXCLUDED.momentum_contribution,
        growth_contribution = EXCLUDED.growth_contribution,
        size_contribution = EXCLUDED.size_contribution,
        avg_value_exposure = EXCLUDED.avg_value_exposure,
        avg_quality_exposure = EXCLUDED.avg_quality_exposure,
        avg_momentum_exposure = EXCLUDED.avg_momentum_exposure,
        avg_growth_exposure = EXCLUDED.avg_growth_exposure,
        avg_size_exposure = EXCLUDED.avg_size_exposure,
        created_at = EXCLUDED.created_at
    `, [
      result.investor_id, result.period_start, result.period_end, result.period_type,
      result.value_contribution, result.quality_contribution, result.momentum_contribution,
      result.growth_contribution, result.size_contribution,
      result.avg_value_exposure, result.avg_quality_exposure, result.avg_momentum_exposure,
      result.avg_growth_exposure, result.avg_size_exposure
    ]);

    return result;
  }

  /**
   * Enrich investment decisions with factor context
   */
  async enrichDecisionWithFactors(decisionId) {
    const database = await getDatabaseAsync();

    const decisionResult = await database.query(`
      SELECT * FROM investment_decisions WHERE id = $1
    `, [decisionId]);

    const decision = decisionResult.rows[0];

    if (!decision || !decision.company_id) {
      return null;
    }

    // Get factor scores at decision time
    const factorsResult = await database.query(`
      SELECT * FROM stock_factor_scores
      WHERE company_id = $1 AND score_date <= $2
      ORDER BY score_date DESC
      LIMIT 1
    `, [decision.company_id, decision.decision_date]);

    const factors = factorsResult.rows[0];

    if (!factors) {
      return null;
    }

    // Determine dominant factor
    const factorScores = [
      { factor: 'value', percentile: factors.value_percentile },
      { factor: 'quality', percentile: factors.quality_percentile },
      { factor: 'momentum', percentile: factors.momentum_percentile },
      { factor: 'growth', percentile: factors.growth_percentile }
    ].filter(f => f.percentile != null)
      .sort((a, b) => Math.abs(b.percentile - 50) - Math.abs(a.percentile - 50));

    const dominantFactor = factorScores[0];

    // Classify the decision
    const isValuePlay = (factors.value_percentile || 0) > 80 ? 1 : 0;
    const isQualityPlay = (factors.quality_percentile || 0) > 80 ? 1 : 0;
    const isMomentumPlay = (factors.momentum_percentile || 0) > 80 ? 1 : 0;
    const isGrowthPlay = (factors.growth_percentile || 0) > 80 ? 1 : 0;
    const isContrarianPlay = (factors.momentum_percentile || 100) < 20 ? 1 : 0;
    const isSmallCapPlay = (factors.size_percentile || 0) > 70 ? 1 : 0;

    // Store factor context
    const context = {
      decision_id: decisionId,
      value_score: factors.value_score,
      quality_score: factors.quality_score,
      momentum_score: factors.momentum_score,
      growth_score: factors.growth_score,
      size_score: factors.size_score,
      volatility_score: factors.volatility_score,
      value_percentile: factors.value_percentile,
      quality_percentile: factors.quality_percentile,
      momentum_percentile: factors.momentum_percentile,
      growth_percentile: factors.growth_percentile,
      dominant_factor: dominantFactor?.factor || null,
      dominant_factor_percentile: dominantFactor?.percentile || null,
      is_value_play: isValuePlay,
      is_quality_play: isQualityPlay,
      is_momentum_play: isMomentumPlay,
      is_growth_play: isGrowthPlay,
      is_contrarian_play: isContrarianPlay,
      is_small_cap_play: isSmallCapPlay
    };

    await database.query(`
      INSERT INTO decision_factor_context (
        decision_id, value_score, quality_score, momentum_score, growth_score,
        size_score, volatility_score,
        value_percentile, quality_percentile, momentum_percentile, growth_percentile,
        dominant_factor, dominant_factor_percentile,
        is_value_play, is_quality_play, is_momentum_play, is_growth_play,
        is_contrarian_play, is_small_cap_play,
        created_at
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7,
        $8, $9, $10, $11,
        $12, $13,
        $14, $15, $16, $17,
        $18, $19,
        CURRENT_TIMESTAMP
      )
      ON CONFLICT (decision_id)
      DO UPDATE SET
        value_score = EXCLUDED.value_score,
        quality_score = EXCLUDED.quality_score,
        momentum_score = EXCLUDED.momentum_score,
        growth_score = EXCLUDED.growth_score,
        size_score = EXCLUDED.size_score,
        volatility_score = EXCLUDED.volatility_score,
        value_percentile = EXCLUDED.value_percentile,
        quality_percentile = EXCLUDED.quality_percentile,
        momentum_percentile = EXCLUDED.momentum_percentile,
        growth_percentile = EXCLUDED.growth_percentile,
        dominant_factor = EXCLUDED.dominant_factor,
        dominant_factor_percentile = EXCLUDED.dominant_factor_percentile,
        is_value_play = EXCLUDED.is_value_play,
        is_quality_play = EXCLUDED.is_quality_play,
        is_momentum_play = EXCLUDED.is_momentum_play,
        is_growth_play = EXCLUDED.is_growth_play,
        is_contrarian_play = EXCLUDED.is_contrarian_play,
        is_small_cap_play = EXCLUDED.is_small_cap_play,
        created_at = EXCLUDED.created_at
    `, [
      context.decision_id, context.value_score, context.quality_score, context.momentum_score, context.growth_score,
      context.size_score, context.volatility_score,
      context.value_percentile, context.quality_percentile, context.momentum_percentile, context.growth_percentile,
      context.dominant_factor, context.dominant_factor_percentile,
      context.is_value_play, context.is_quality_play, context.is_momentum_play, context.is_growth_play,
      context.is_contrarian_play, context.is_small_cap_play
    ]);

    return context;
  }

  /**
   * Batch enrich all decisions with factor context
   */
  async enrichAllDecisionsWithFactors(options = {}) {
    const database = await getDatabaseAsync();
    const { limit = 10000, verbose = false } = options;

    const decisionsResult = await database.query(`
      SELECT d.id
      FROM investment_decisions d
      LEFT JOIN decision_factor_context dfc ON d.id = dfc.decision_id
      WHERE dfc.decision_id IS NULL
        AND d.company_id IS NOT NULL
      LIMIT $1
    `, [limit]);

    const decisions = decisionsResult.rows;

    if (verbose) {
      console.log(`📊 Enriching ${decisions.length} decisions with factor context...`);
    }

    let enriched = 0;
    for (const decision of decisions) {
      const result = await this.enrichDecisionWithFactors(decision.id);
      if (result) enriched++;

      if (verbose && enriched % 1000 === 0) {
        console.log(`  Enriched ${enriched}/${decisions.length}`);
      }
    }

    if (verbose) {
      console.log(`✅ Enriched ${enriched} decisions with factor context`);
    }

    return { enriched, total: decisions.length };
  }
}

module.exports = FactorAnalyzer;

// src/services/factors/factorAnalyzer.js
// Analyzes factor exposures at the portfolio and investor level

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
  constructor(db) {
    this.db = db;
  }

  /**
   * Calculate portfolio factor exposures for an investor at a point in time
   */
  async calculatePortfolioExposures(investorId, snapshotDate, options = {}) {
    const { verbose = false, benchmark = 'market' } = options;

    // Get investor holdings at this date
    const holdings = this.db.prepare(`
      SELECT
        ih.company_id,
        ih.cusip,
        c.symbol,
        ih.market_value,
        ih.portfolio_weight,
        ih.shares
      FROM investor_holdings ih
      LEFT JOIN companies c ON ih.company_id = c.id
      WHERE ih.investor_id = ?
        AND ih.filing_date = (
          SELECT MAX(filing_date)
          FROM investor_holdings
          WHERE investor_id = ?
            AND filing_date <= ?
        )
        AND ih.shares > 0
    `).all(investorId, investorId, snapshotDate);

    if (holdings.length === 0) {
      if (verbose) console.log('  No holdings found for this date');
      return null;
    }

    // Get factor scores for each holding
    const holdingsWithFactors = holdings.map(holding => {
      const factors = this.db.prepare(`
        SELECT * FROM stock_factor_scores
        WHERE company_id = ?
          AND score_date <= ?
        ORDER BY score_date DESC
        LIMIT 1
      `).get(holding.company_id, snapshotDate);

      return { ...holding, factors };
    }).filter(h => h.factors);

    if (holdingsWithFactors.length === 0) {
      if (verbose) console.log('  No factor data available for holdings');
      return null;
    }

    // Calculate total portfolio value for weighting
    const totalValue = holdingsWithFactors.reduce((sum, h) => sum + (h.market_value || 0), 0);

    // Calculate weighted average factor scores
    const weightedFactors = this._calculateWeightedFactors(holdingsWithFactors, totalValue);

    // Get benchmark exposures for comparison
    const benchmarkExposures = await this._getBenchmarkExposures(snapshotDate, benchmark);

    // Calculate factor tilts
    const tilts = this._calculateFactorTilts(weightedFactors, benchmarkExposures);

    // Classify style box
    const styleBox = this._classifyStyleBox(weightedFactors, tilts);

    // Calculate portfolio characteristics
    const characteristics = this._calculatePortfolioCharacteristics(holdingsWithFactors, totalValue);

    // Store exposures
    const result = {
      investor_id: investorId,
      snapshot_date: snapshotDate,
      ...weightedFactors,
      ...tilts,
      ...characteristics,
      style_box: styleBox.style,
      style_confidence: styleBox.confidence,
      position_count: holdingsWithFactors.length
    };

    this._storePortfolioExposures(result);

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
  _calculatePortfolioCharacteristics(holdings, totalValue) {
    // Get additional metrics for each holding
    const holdingsWithMetrics = holdings.map(h => {
      const metrics = this.db.prepare(`
        SELECT
          pe_ratio, pb_ratio, roe, roic,
          revenue_growth_yoy, earnings_growth_yoy,
          dividend_yield
        FROM calculated_metrics
        WHERE company_id = ?
        ORDER BY fiscal_period DESC
        LIMIT 1
      `).get(h.company_id);

      const company = this.db.prepare(`
        SELECT market_cap FROM companies WHERE id = ?
      `).get(h.company_id);

      return { ...h, metrics, company };
    });

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
  _storePortfolioExposures(exposures) {
    this.db.prepare(`
      INSERT OR REPLACE INTO portfolio_factor_exposures (
        investor_id, snapshot_date,
        avg_value_score, avg_quality_score, avg_momentum_score,
        avg_growth_score, avg_size_score, avg_volatility_score, avg_dividend_score,
        value_tilt, quality_tilt, momentum_tilt, growth_tilt, size_tilt,
        weighted_pe, weighted_pb, weighted_roe, weighted_roic,
        weighted_revenue_growth, weighted_earnings_growth, weighted_dividend_yield,
        weighted_market_cap, herfindahl_index, top_10_weight, sector_concentration,
        style_box, style_confidence, position_count, created_at
      ) VALUES (
        @investor_id, @snapshot_date,
        @avg_value_score, @avg_quality_score, @avg_momentum_score,
        @avg_growth_score, @avg_size_score, @avg_volatility_score, @avg_dividend_score,
        @value_tilt, @quality_tilt, @momentum_tilt, @growth_tilt, @size_tilt,
        @weighted_pe, @weighted_pb, @weighted_roe, @weighted_roic,
        @weighted_revenue_growth, @weighted_earnings_growth, @weighted_dividend_yield,
        @weighted_market_cap, @herfindahl_index, @top_10_weight, @sector_concentration,
        @style_box, @style_confidence, @position_count, datetime('now')
      )
    `).run(exposures);
  }

  /**
   * Get investor factor profile
   */
  getInvestorFactorProfile(investorId) {
    // Get latest exposures
    const latest = this.db.prepare(`
      SELECT * FROM portfolio_factor_exposures
      WHERE investor_id = ?
      ORDER BY snapshot_date DESC
      LIMIT 1
    `).get(investorId);

    // Get historical average tilts
    const historicalAvg = this.db.prepare(`
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
      WHERE investor_id = ?
    `).get(investorId);

    // Get factor consistency (standard deviation of tilts)
    const consistency = this.db.prepare(`
      SELECT
        CASE WHEN COUNT(*) > 1 THEN
          SQRT(SUM((value_tilt - (SELECT AVG(value_tilt) FROM portfolio_factor_exposures WHERE investor_id = ?)) *
               (value_tilt - (SELECT AVG(value_tilt) FROM portfolio_factor_exposures WHERE investor_id = ?))) / COUNT(*))
        ELSE 0 END as value_tilt_std,
        CASE WHEN COUNT(*) > 1 THEN
          SQRT(SUM((quality_tilt - (SELECT AVG(quality_tilt) FROM portfolio_factor_exposures WHERE investor_id = ?)) *
               (quality_tilt - (SELECT AVG(quality_tilt) FROM portfolio_factor_exposures WHERE investor_id = ?))) / COUNT(*))
        ELSE 0 END as quality_tilt_std
      FROM portfolio_factor_exposures
      WHERE investor_id = ?
    `).get(investorId, investorId, investorId, investorId, investorId);

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
  compareInvestorFactors(investorIds, snapshotDate = null) {
    const results = [];

    for (const investorId of investorIds) {
      let exposure;
      if (snapshotDate) {
        exposure = this.db.prepare(`
          SELECT pfe.*, fi.name as investor_name
          FROM portfolio_factor_exposures pfe
          JOIN famous_investors fi ON pfe.investor_id = fi.id
          WHERE pfe.investor_id = ? AND pfe.snapshot_date <= ?
          ORDER BY pfe.snapshot_date DESC
          LIMIT 1
        `).get(investorId, snapshotDate);
      } else {
        exposure = this.db.prepare(`
          SELECT pfe.*, fi.name as investor_name
          FROM portfolio_factor_exposures pfe
          JOIN famous_investors fi ON pfe.investor_id = fi.id
          WHERE pfe.investor_id = ?
          ORDER BY pfe.snapshot_date DESC
          LIMIT 1
        `).get(investorId);
      }

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
    const { verbose = false } = options;

    // Get factor exposures during the period
    const exposures = this.db.prepare(`
      SELECT * FROM portfolio_factor_exposures
      WHERE investor_id = ?
        AND snapshot_date >= ?
        AND snapshot_date <= ?
      ORDER BY snapshot_date
    `).all(investorId, periodStart, periodEnd);

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
    const factorReturns = this.db.prepare(`
      SELECT * FROM factor_returns
      WHERE return_date >= ? AND return_date <= ?
      ORDER BY return_date
    `).all(periodStart, periodEnd);

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
    this.db.prepare(`
      INSERT OR REPLACE INTO investor_factor_attribution (
        investor_id, period_start, period_end, period_type,
        value_contribution, quality_contribution, momentum_contribution,
        growth_contribution, size_contribution,
        avg_value_exposure, avg_quality_exposure, avg_momentum_exposure,
        avg_growth_exposure, avg_size_exposure,
        created_at
      ) VALUES (
        @investor_id, @period_start, @period_end, @period_type,
        @value_contribution, @quality_contribution, @momentum_contribution,
        @growth_contribution, @size_contribution,
        @avg_value_exposure, @avg_quality_exposure, @avg_momentum_exposure,
        @avg_growth_exposure, @avg_size_exposure,
        datetime('now')
      )
    `).run(result);

    return result;
  }

  /**
   * Enrich investment decisions with factor context
   */
  async enrichDecisionWithFactors(decisionId) {
    const decision = this.db.prepare(`
      SELECT * FROM investment_decisions WHERE id = ?
    `).get(decisionId);

    if (!decision || !decision.company_id) {
      return null;
    }

    // Get factor scores at decision time
    const factors = this.db.prepare(`
      SELECT * FROM stock_factor_scores
      WHERE company_id = ? AND score_date <= ?
      ORDER BY score_date DESC
      LIMIT 1
    `).get(decision.company_id, decision.decision_date);

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

    this.db.prepare(`
      INSERT OR REPLACE INTO decision_factor_context (
        decision_id, value_score, quality_score, momentum_score, growth_score,
        size_score, volatility_score,
        value_percentile, quality_percentile, momentum_percentile, growth_percentile,
        dominant_factor, dominant_factor_percentile,
        is_value_play, is_quality_play, is_momentum_play, is_growth_play,
        is_contrarian_play, is_small_cap_play,
        created_at
      ) VALUES (
        @decision_id, @value_score, @quality_score, @momentum_score, @growth_score,
        @size_score, @volatility_score,
        @value_percentile, @quality_percentile, @momentum_percentile, @growth_percentile,
        @dominant_factor, @dominant_factor_percentile,
        @is_value_play, @is_quality_play, @is_momentum_play, @is_growth_play,
        @is_contrarian_play, @is_small_cap_play,
        datetime('now')
      )
    `).run(context);

    return context;
  }

  /**
   * Batch enrich all decisions with factor context
   */
  async enrichAllDecisionsWithFactors(options = {}) {
    const { limit = 10000, verbose = false } = options;

    const decisions = this.db.prepare(`
      SELECT d.id
      FROM investment_decisions d
      LEFT JOIN decision_factor_context dfc ON d.id = dfc.decision_id
      WHERE dfc.decision_id IS NULL
        AND d.company_id IS NOT NULL
      LIMIT ?
    `).all(limit);

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

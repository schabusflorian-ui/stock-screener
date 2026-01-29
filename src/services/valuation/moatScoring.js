// src/services/valuation/moatScoring.js
// Moat Scoring System - Buffett-inspired competitive advantage assessment
// Quantifies durable competitive advantages to identify quality businesses

/**
 * MoatScorer - Quantitative competitive moat assessment
 *
 * Implements scoring across 8 dimensions:
 * 1. Gross margin stability
 * 2. Gross margin level vs industry
 * 3. ROIC consistency
 * 4. Market share trend
 * 5. Customer concentration
 * 6. R&D/Capex efficiency
 * 7. Switching costs (retention)
 * 8. Scale advantages (SG&A leverage)
 */
class MoatScorer {
  /**
   * @param {Database} db - better-sqlite3 database instance
   */
  constructor(db) {
    this.db = db;
    this._initializeTables();
    this._prepareStatements();
    console.log('🏰 MoatScorer initialized');
  }

  _initializeTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS moat_scores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL,
        symbol TEXT,
        score_date TEXT NOT NULL,
        total_score REAL,
        margin_stability_score REAL,
        margin_level_score REAL,
        roic_consistency_score REAL,
        market_share_score REAL,
        customer_concentration_score REAL,
        rd_efficiency_score REAL,
        switching_cost_score REAL,
        scale_advantage_score REAL,
        moat_type TEXT,
        moat_strength TEXT,
        primary_moat TEXT,
        threat_level TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        UNIQUE(company_id, score_date)
      );

      CREATE TABLE IF NOT EXISTS moat_threats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL,
        threat_date TEXT,
        threat_type TEXT,
        severity TEXT,
        evidence TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
    `);
  }

  _prepareStatements() {
    this.stmtGetCompany = this.db.prepare(`
      SELECT id, symbol, name, sector, market_cap
      FROM companies WHERE id = ?
    `);

    this.stmtGetCompanyBySymbol = this.db.prepare(`
      SELECT id, symbol, name, sector, market_cap
      FROM companies WHERE LOWER(symbol) = LOWER(?)
    `);

    this.stmtGetMetricsHistory = this.db.prepare(`
      SELECT *
      FROM calculated_metrics
      WHERE company_id = ?
      ORDER BY fiscal_period DESC
      LIMIT 20
    `);

    this.stmtGetSectorMetrics = this.db.prepare(`
      SELECT AVG(gross_margin) as avg_gross_margin,
             AVG(roe) as avg_roe,
             AVG(revenue_growth_yoy) as avg_revenue_growth
      FROM calculated_metrics cm
      JOIN companies c ON c.id = cm.company_id
      WHERE c.sector = ?
        AND cm.gross_margin IS NOT NULL
    `);

    this.stmtStoreMoatScore = this.db.prepare(`
      INSERT OR REPLACE INTO moat_scores (
        company_id, symbol, score_date, total_score,
        margin_stability_score, margin_level_score, roic_consistency_score,
        market_share_score, customer_concentration_score, rd_efficiency_score,
        switching_cost_score, scale_advantage_score,
        moat_type, moat_strength, primary_moat, threat_level
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.stmtGetMoatScore = this.db.prepare(`
      SELECT * FROM moat_scores
      WHERE company_id = ?
      ORDER BY score_date DESC
      LIMIT 1
    `);

    this.stmtStoreThreat = this.db.prepare(`
      INSERT INTO moat_threats (company_id, threat_date, threat_type, severity, evidence)
      VALUES (?, ?, ?, ?, ?)
    `);
  }

  /**
   * Calculate comprehensive moat score (0-100)
   * @param {number} companyId - Company ID
   * @returns {Object} Moat score breakdown
   */
  calculateMoatScore(companyId) {
    const company = this.stmtGetCompany.get(companyId);
    if (!company) return { error: 'Company not found' };

    const metrics = this.stmtGetMetricsHistory.all(companyId);
    if (metrics.length < 2) {
      return { error: 'Insufficient metrics history' };
    }

    const sectorMetrics = this.stmtGetSectorMetrics.get(company.sector);

    // Calculate individual scores
    const scores = {
      marginStability: this._scoreMarginStability(metrics),
      marginLevel: this._scoreMarginLevel(metrics, sectorMetrics),
      roicConsistency: this._scoreROICConsistency(metrics),
      marketShare: this._scoreMarketShare(metrics, sectorMetrics),
      customerConcentration: this._scoreCustomerConcentration(metrics),
      rdEfficiency: this._scoreRDEfficiency(metrics),
      switchingCost: this._scoreSwitchingCost(metrics),
      scaleAdvantage: this._scoreScaleAdvantage(metrics)
    };

    // Total score (weighted sum)
    const totalScore =
      scores.marginStability * 0.15 +
      scores.marginLevel * 0.15 +
      scores.roicConsistency * 0.15 +
      scores.marketShare * 0.15 +
      scores.customerConcentration * 0.10 +
      scores.rdEfficiency * 0.10 +
      scores.switchingCost * 0.10 +
      scores.scaleAdvantage * 0.10;

    // Classify moat strength
    let moatStrength = 'none';
    if (totalScore >= 70) moatStrength = 'wide';
    else if (totalScore >= 50) moatStrength = 'narrow';

    // Identify primary moat type
    const primaryMoat = this._identifyPrimaryMoat(scores);

    // Assess threats
    const threats = this._assessThreats(metrics, scores);

    const result = {
      companyId,
      symbol: company.symbol,
      totalScore: Math.round(totalScore),
      components: {
        marginStability: scores.marginStability,
        marginLevel: scores.marginLevel,
        roicConsistency: scores.roicConsistency,
        marketShare: scores.marketShare,
        customerConcentration: scores.customerConcentration,
        rdEfficiency: scores.rdEfficiency,
        switchingCost: scores.switchingCost,
        scaleAdvantage: scores.scaleAdvantage
      },
      moatStrength,
      primaryMoat,
      threatLevel: threats.level,
      threats: threats.threats,
      interpretation: this._interpretScore(totalScore, moatStrength, primaryMoat)
    };

    // Store result
    const date = new Date().toISOString().split('T')[0];
    this.stmtStoreMoatScore.run(
      companyId, company.symbol, date, result.totalScore,
      scores.marginStability, scores.marginLevel, scores.roicConsistency,
      scores.marketShare, scores.customerConcentration, scores.rdEfficiency,
      scores.switchingCost, scores.scaleAdvantage,
      result.moatStrength, result.moatStrength, primaryMoat, threats.level
    );

    return result;
  }

  _scoreMarginStability(metrics) {
    // Score: 0-15 based on gross margin standard deviation
    const grossMargins = metrics
      .filter(m => m.gross_margin != null)
      .map(m => m.gross_margin);

    if (grossMargins.length < 3) return 7.5; // Neutral

    const mean = grossMargins.reduce((a, b) => a + b, 0) / grossMargins.length;
    const std = Math.sqrt(
      grossMargins.reduce((sum, m) => sum + (m - mean) ** 2, 0) / (grossMargins.length - 1)
    );

    // Convert std to score
    if (std < 0.03) return 15;  // < 3% std = very stable
    if (std < 0.05) return 12;  // 3-5% = stable
    if (std < 0.10) return 8;   // 5-10% = moderate
    if (std < 0.15) return 4;   // 10-15% = unstable
    return 0;                   // > 15% = very unstable
  }

  _scoreMarginLevel(metrics, sectorMetrics) {
    // Score: 0-15 based on gross margin vs industry
    const currentGM = metrics[0]?.gross_margin;
    const sectorGM = sectorMetrics?.avg_gross_margin || 0.3;

    if (currentGM == null) return 7.5;

    const premium = currentGM - sectorGM;

    if (premium > 0.15) return 15;   // > 15% above industry
    if (premium > 0.10) return 12;   // 10-15% above
    if (premium > 0.05) return 9;    // 5-10% above
    if (premium > 0) return 6;       // 0-5% above
    if (premium > -0.05) return 3;   // 0-5% below
    return 0;                        // > 5% below
  }

  _scoreROICConsistency(metrics) {
    // Score: 0-15 based on ROIC > estimated WACC (use 10% proxy)
    const wacc = 0.10; // 10% proxy WACC

    const roics = metrics
      .filter(m => m.roe != null) // Using ROE as ROIC proxy
      .map(m => m.roe);

    if (roics.length < 3) return 7.5;

    const yearsAboveWACC = roics.filter(r => r > wacc).length;
    const total = roics.length;
    const ratio = yearsAboveWACC / total;

    if (ratio >= 0.9) return 15;     // 90%+ years above WACC
    if (ratio >= 0.8) return 12;     // 80-90%
    if (ratio >= 0.6) return 8;      // 60-80%
    if (ratio >= 0.4) return 4;      // 40-60%
    return 0;                        // < 40%
  }

  _scoreMarketShare(metrics, sectorMetrics) {
    // Score: 0-15 based on revenue growth vs industry
    const revenueGrowths = metrics
      .filter(m => m.revenue_growth != null)
      .map(m => m.revenue_growth);

    if (revenueGrowths.length < 2) return 7.5;

    const avgGrowth = revenueGrowths.reduce((a, b) => a + b, 0) / revenueGrowths.length;
    const sectorGrowth = sectorMetrics?.avg_revenue_growth || 0.05;

    const outperformance = avgGrowth - sectorGrowth;

    if (outperformance > 0.10) return 15;   // > 10% above industry
    if (outperformance > 0.05) return 12;   // 5-10% above
    if (outperformance > 0.02) return 9;    // 2-5% above
    if (outperformance > -0.02) return 6;   // +/- 2%
    if (outperformance > -0.05) return 3;   // 2-5% below
    return 0;                               // > 5% below
  }

  _scoreCustomerConcentration(metrics) {
    // Score: 0-10 based on diversification
    // Without actual customer data, use revenue stability as proxy
    const revenues = metrics
      .filter(m => m.revenue != null)
      .map(m => m.revenue);

    if (revenues.length < 3) return 5;

    const mean = revenues.reduce((a, b) => a + b, 0) / revenues.length;
    const cv = Math.sqrt(
      revenues.reduce((sum, r) => sum + (r - mean) ** 2, 0) / (revenues.length - 1)
    ) / mean;

    // Low CV suggests diversified customer base
    if (cv < 0.10) return 10;
    if (cv < 0.15) return 7;
    if (cv < 0.25) return 4;
    return 2;
  }

  _scoreRDEfficiency(metrics) {
    // Score: 0-10 based on revenue growth per R&D dollar
    // Using operating margin improvement as proxy
    const opMargins = metrics
      .filter(m => m.operating_margin != null)
      .map(m => m.operating_margin);

    if (opMargins.length < 3) return 5;

    // Check if margins are improving
    const recentAvg = opMargins.slice(0, 3).reduce((a, b) => a + b, 0) / 3;
    const olderAvg = opMargins.slice(-3).reduce((a, b) => a + b, 0) / Math.min(3, opMargins.length);

    const improvement = recentAvg - olderAvg;

    if (improvement > 0.05) return 10;   // > 5% improvement
    if (improvement > 0.02) return 7;    // 2-5% improvement
    if (improvement > 0) return 5;       // Slight improvement
    if (improvement > -0.03) return 3;   // Slight decline
    return 1;                            // Significant decline
  }

  _scoreSwitchingCost(metrics) {
    // Score: 0-10 based on revenue retention (using revenue stability)
    const revenues = metrics
      .filter(m => m.revenue != null)
      .map(m => m.revenue);

    if (revenues.length < 3) return 5;

    // Check for consistent growth (implies retention + expansion)
    let positiveChanges = 0;
    for (let i = 0; i < revenues.length - 1; i++) {
      if (revenues[i] >= revenues[i + 1]) positiveChanges++;
    }

    const ratio = positiveChanges / (revenues.length - 1);

    if (ratio >= 0.9) return 10;   // 90%+ periods with growth
    if (ratio >= 0.7) return 7;
    if (ratio >= 0.5) return 5;
    if (ratio >= 0.3) return 3;
    return 1;
  }

  _scoreScaleAdvantage(metrics) {
    // Score: 0-10 based on SG&A as % of revenue trend (declining = scale)
    const sgaRatios = metrics
      .filter(m => m.revenue != null && m.operating_expenses != null)
      .map(m => m.operating_expenses / m.revenue);

    if (sgaRatios.length < 3) return 5;

    // Check if SG&A ratio is declining (scale benefits)
    const recentAvg = sgaRatios.slice(0, 3).reduce((a, b) => a + b, 0) / 3;
    const olderAvg = sgaRatios.slice(-3).reduce((a, b) => a + b, 0) / Math.min(3, sgaRatios.length);

    const improvement = olderAvg - recentAvg; // Positive = improving scale

    if (improvement > 0.05) return 10;   // > 5% improvement
    if (improvement > 0.02) return 7;    // 2-5% improvement
    if (improvement > 0) return 5;       // Slight improvement
    if (improvement > -0.03) return 3;   // Slight increase
    return 1;                            // Significant increase
  }

  _identifyPrimaryMoat(scores) {
    const moatTypes = [
      { type: 'COST_ADVANTAGE', score: scores.marginLevel + scores.scaleAdvantage },
      { type: 'SWITCHING_COSTS', score: scores.switchingCost + scores.customerConcentration },
      { type: 'NETWORK_EFFECTS', score: scores.marketShare + scores.marginStability },
      { type: 'INTANGIBLE_ASSETS', score: scores.rdEfficiency + scores.marginLevel },
      { type: 'EFFICIENT_SCALE', score: scores.roicConsistency + scores.marginStability }
    ];

    moatTypes.sort((a, b) => b.score - a.score);
    return moatTypes[0].type;
  }

  _assessThreats(metrics, scores) {
    const threats = [];

    // Margin compression
    const grossMargins = metrics.filter(m => m.gross_margin != null).map(m => m.gross_margin);
    if (grossMargins.length >= 3) {
      const trend = grossMargins[0] - grossMargins[Math.min(4, grossMargins.length - 1)];
      if (trend < -0.05) {
        threats.push({
          type: 'MARGIN_COMPRESSION',
          severity: 'high',
          evidence: `Gross margin declined ${(trend * 100).toFixed(1)}% over recent periods`
        });
      }
    }

    // Growth deceleration
    const revenueGrowths = metrics.filter(m => m.revenue_growth != null).map(m => m.revenue_growth);
    if (revenueGrowths.length >= 3) {
      const recent = revenueGrowths.slice(0, 2).reduce((a, b) => a + b, 0) / 2;
      const older = revenueGrowths.slice(-2).reduce((a, b) => a + b, 0) / 2;
      if (recent < older - 0.05) {
        threats.push({
          type: 'GROWTH_DECELERATION',
          severity: 'medium',
          evidence: `Revenue growth slowing from ${(older * 100).toFixed(1)}% to ${(recent * 100).toFixed(1)}%`
        });
      }
    }

    // ROIC deterioration
    if (scores.roicConsistency < 6) {
      threats.push({
        type: 'ROIC_DETERIORATION',
        severity: 'medium',
        evidence: 'Returns on invested capital inconsistently above cost of capital'
      });
    }

    // Determine overall threat level
    let level = 'low';
    if (threats.some(t => t.severity === 'high')) level = 'high';
    else if (threats.length >= 2) level = 'medium';
    else if (threats.length === 1) level = 'low';

    return { level, threats };
  }

  _interpretScore(totalScore, moatStrength, primaryMoat) {
    const moatDescriptions = {
      'COST_ADVANTAGE': 'Cost leadership through scale or efficiency',
      'SWITCHING_COSTS': 'High customer switching costs create stickiness',
      'NETWORK_EFFECTS': 'Value increases with more users',
      'INTANGIBLE_ASSETS': 'Strong brand or intellectual property',
      'EFFICIENT_SCALE': 'Natural monopoly characteristics'
    };

    if (moatStrength === 'wide') {
      return `Strong competitive moat (${totalScore}/100). Primary advantage: ${moatDescriptions[primaryMoat]}. Business likely to maintain high returns on capital.`;
    } else if (moatStrength === 'narrow') {
      return `Moderate competitive advantage (${totalScore}/100). Primary advantage: ${moatDescriptions[primaryMoat]}. Monitor for erosion.`;
    } else {
      return `Limited competitive moat (${totalScore}/100). Business may face margin pressure. Requires discount to intrinsic value.`;
    }
  }

  /**
   * Get moat-adjusted valuation multiple
   * @param {number} companyId - Company ID
   * @param {number} baseMultiple - Base valuation multiple (e.g., P/E)
   * @returns {Object} Adjusted multiple
   */
  getMoatAdjustedValuation(companyId, baseMultiple) {
    let moatScore = this.stmtGetMoatScore.get(companyId);

    if (!moatScore) {
      moatScore = this.calculateMoatScore(companyId);
    }

    if (moatScore.error) {
      return { baseMultiple, adjustedMultiple: baseMultiple, adjustment: 1.0 };
    }

    let adjustment = 1.0;
    if (moatScore.moat_strength === 'wide' || moatScore.moatStrength === 'wide') {
      adjustment = 1.3; // 30% premium for wide moat
    } else if (moatScore.moat_strength === 'narrow' || moatScore.moatStrength === 'narrow') {
      adjustment = 1.1; // 10% premium for narrow moat
    } else {
      adjustment = 0.9; // 10% discount for no moat
    }

    // Adjust for threat level
    const threatLevel = moatScore.threat_level || moatScore.threatLevel;
    if (threatLevel === 'high') adjustment *= 0.9;
    else if (threatLevel === 'medium') adjustment *= 0.95;

    return {
      baseMultiple,
      adjustedMultiple: baseMultiple * adjustment,
      adjustment,
      moatStrength: moatScore.moat_strength || moatScore.moatStrength,
      reasoning: `${adjustment > 1 ? 'Premium' : 'Discount'} applied for ${moatScore.moat_strength || moatScore.moatStrength} moat`
    };
  }

  /**
   * Get moat score for a symbol
   * @param {string} symbol - Stock symbol
   * @returns {Object} Moat score
   */
  getMoatScoreBySymbol(symbol) {
    const company = this.stmtGetCompanyBySymbol.get(symbol);
    if (!company) return { error: 'Company not found' };

    let score = this.stmtGetMoatScore.get(company.id);
    if (!score) {
      score = this.calculateMoatScore(company.id);
    }
    return score;
  }
}

function createMoatScorer(db) {
  return new MoatScorer(db);
}

module.exports = { MoatScorer, createMoatScorer };

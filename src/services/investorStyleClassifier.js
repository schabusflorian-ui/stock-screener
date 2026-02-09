// src/services/investorStyleClassifier.js
/**
 * Investor Style Classification Service
 *
 * Automatically classifies investors based on their portfolio factor exposures:
 * - Value: High value factor tilt
 * - Growth: High growth factor tilt
 * - Quality: High quality factor tilt
 * - Momentum: High momentum factor tilt
 * - Blend: Balanced across factors
 * - Contrarian: High value + low momentum
 */

const { getDatabaseAsync } = require('../lib/db');

class InvestorStyleClassifier {
  constructor() {
    // No database parameter needed - using getDatabaseAsync()
  }

  /**
   * Classify all investors based on their latest portfolio factor exposures
   */
  async classifyAllInvestors() {
    const database = await getDatabaseAsync();

    const investorsResult = await database.query(
      'SELECT DISTINCT investor_id FROM portfolio_factor_exposures'
    );
    const investors = investorsResult.rows;

    const results = [];
    for (const { investor_id } of investors) {
      const classification = await this.classifyInvestor(investor_id);
      if (classification) {
        results.push(classification);
      }
    }

    return results;
  }

  /**
   * Classify a single investor
   */
  async classifyInvestor(investorId) {
    const database = await getDatabaseAsync();

    // Get latest portfolio factor exposures
    const exposureResult = await database.query(`
      SELECT * FROM portfolio_factor_exposures
      WHERE investor_id = $1
      ORDER BY snapshot_date DESC
      LIMIT 1
    `, [investorId]);
    const exposure = exposureResult.rows[0];

    if (!exposure) {
      return null;
    }

    // Get investor info
    const investorResult = await database.query(
      'SELECT id, name, investment_style FROM famous_investors WHERE id = $1',
      [investorId]
    );
    const investor = investorResult.rows[0];

    if (!investor) {
      return null;
    }

    // Calculate style based on tilts
    const classification = this._determineStyle(exposure);

    return {
      investorId,
      name: investor.name,
      currentStyle: investor.investment_style,
      classifiedStyle: classification.primaryStyle,
      secondaryStyle: classification.secondaryStyle,
      styleBox: exposure.style_box,
      confidence: classification.confidence,
      factorTilts: {
        value: exposure.value_tilt,
        quality: exposure.quality_tilt,
        momentum: exposure.momentum_tilt,
        growth: exposure.growth_tilt
      },
      characteristics: classification.characteristics,
      snapshotDate: exposure.snapshot_date
    };
  }

  /**
   * Determine investment style from factor tilts
   */
  _determineStyle(exposure) {
    const tilts = {
      value: exposure.value_tilt || 0,
      quality: exposure.quality_tilt || 0,
      momentum: exposure.momentum_tilt || 0,
      growth: exposure.growth_tilt || 0
    };

    // Find dominant tilts
    const tiltArray = Object.entries(tilts)
      .map(([factor, tilt]) => ({ factor, tilt }))
      .sort((a, b) => Math.abs(b.tilt) - Math.abs(a.tilt));

    const dominant = tiltArray[0];
    const secondary = tiltArray[1];

    // Determine primary style
    let primaryStyle = 'Blend';
    let secondaryStyle = null;
    let confidence = 'medium';
    const characteristics = [];

    // Strong single-factor tilt
    if (dominant.tilt > 15) {
      primaryStyle = this._factorToStyle(dominant.factor);
      confidence = 'high';
      characteristics.push(`Strong ${dominant.factor} tilt (+${dominant.tilt.toFixed(1)})`);

      if (secondary.tilt > 10) {
        secondaryStyle = this._factorToStyle(secondary.factor);
        characteristics.push(`Secondary ${secondary.factor} tilt (+${secondary.tilt.toFixed(1)})`);
      }
    } else if (dominant.tilt > 8) {
      primaryStyle = this._factorToStyle(dominant.factor);
      confidence = 'medium';
      characteristics.push(`Moderate ${dominant.factor} tilt (+${dominant.tilt.toFixed(1)})`);
    }

    // Special style detection

    // Contrarian: High value + low/negative momentum
    if (tilts.value > 10 && tilts.momentum < -5) {
      primaryStyle = 'Contrarian';
      confidence = 'high';
      characteristics.push('Value-focused with negative momentum exposure');
    }

    // Quality Growth: High quality + high growth
    if (tilts.quality > 10 && tilts.growth > 10) {
      primaryStyle = 'Quality Growth';
      confidence = 'high';
      characteristics.push('Combines quality and growth factors');
    }

    // GARP (Growth at Reasonable Price): Growth + Value
    if (tilts.growth > 8 && tilts.value > 5) {
      if (primaryStyle !== 'Quality Growth') {
        primaryStyle = 'GARP';
        confidence = 'medium';
        characteristics.push('Growth at reasonable valuations');
      }
    }

    // Deep Value: Very high value tilt
    if (tilts.value > 20) {
      primaryStyle = 'Deep Value';
      confidence = 'high';
      characteristics.push('Deep value concentration');
    }

    // Momentum Trader: Very high momentum
    if (tilts.momentum > 20) {
      primaryStyle = 'Momentum';
      confidence = 'high';
      characteristics.push('Strong momentum following');
    }

    // Add quality assessment
    if (tilts.quality > 15) {
      characteristics.push('Quality-focused holdings');
    } else if (tilts.quality < -10) {
      characteristics.push('Lower quality tolerance');
    }

    // Size assessment from style box
    if (exposure.style_box) {
      if (exposure.style_box.includes('large')) {
        characteristics.push('Large-cap focused');
      } else if (exposure.style_box.includes('small')) {
        characteristics.push('Small-cap focused');
      }
    }

    return {
      primaryStyle,
      secondaryStyle,
      confidence,
      characteristics
    };
  }

  _factorToStyle(factor) {
    const mapping = {
      'value': 'Value',
      'quality': 'Quality',
      'momentum': 'Momentum',
      'growth': 'Growth'
    };
    return mapping[factor] || 'Blend';
  }

  /**
   * Get style distribution across all investors
   */
  async getStyleDistribution() {
    const classifications = await this.classifyAllInvestors();

    const distribution = {};
    for (const c of classifications) {
      const style = c.classifiedStyle;
      if (!distribution[style]) {
        distribution[style] = { count: 0, investors: [] };
      }
      distribution[style].count++;
      distribution[style].investors.push({
        id: c.investorId,
        name: c.name,
        confidence: c.confidence
      });
    }

    return {
      totalInvestors: classifications.length,
      distribution
    };
  }

  /**
   * Find investors with similar style
   */
  async findSimilarInvestors(investorId, limit = 5) {
    const target = await this.classifyInvestor(investorId);
    if (!target) return [];

    const allInvestors = await this.classifyAllInvestors();
    const allClassifications = allInvestors.filter(c => c.investorId !== investorId);

    // Score similarity based on factor tilts
    const scored = allClassifications.map(c => {
      const tiltDiff =
        Math.abs(c.factorTilts.value - target.factorTilts.value) +
        Math.abs(c.factorTilts.quality - target.factorTilts.quality) +
        Math.abs(c.factorTilts.momentum - target.factorTilts.momentum) +
        Math.abs(c.factorTilts.growth - target.factorTilts.growth);

      const styleBonus = c.classifiedStyle === target.classifiedStyle ? 10 : 0;
      const similarity = 100 - tiltDiff + styleBonus;

      return { ...c, similarity: Math.max(0, similarity) };
    });

    return scored
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
  }

  /**
   * Get style evolution for an investor over time
   */
  async getStyleEvolution(investorId, limit = 20) {
    const database = await getDatabaseAsync();

    const exposuresResult = await database.query(`
      SELECT * FROM portfolio_factor_exposures
      WHERE investor_id = $1
      ORDER BY snapshot_date DESC
      LIMIT $2
    `, [investorId, limit]);
    const exposures = exposuresResult.rows;

    return exposures.map(exp => {
      const classification = this._determineStyle(exp);
      return {
        date: exp.snapshot_date,
        style: classification.primaryStyle,
        styleBox: exp.style_box,
        tilts: {
          value: exp.value_tilt,
          quality: exp.quality_tilt,
          momentum: exp.momentum_tilt,
          growth: exp.growth_tilt
        }
      };
    }).reverse();
  }

  /**
   * Update famous_investors table with classified styles
   */
  async updateInvestorStyles() {
    const database = await getDatabaseAsync();
    const classifications = await this.classifyAllInvestors();

    let updated = 0;
    for (const c of classifications) {
      if (c.classifiedStyle && c.confidence !== 'low') {
        await database.query(`
          UPDATE famous_investors
          SET investment_style = $1,
              updated_at = datetime('now')
          WHERE id = $2
        `, [c.classifiedStyle, c.investorId]);
        updated++;
      }
    }

    return { updated, total: classifications.length };
  }
}

// Singleton
let instance = null;

function getInvestorStyleClassifier() {
  if (!instance) {
    instance = new InvestorStyleClassifier();
  }
  return instance;
}

module.exports = {
  InvestorStyleClassifier,
  getInvestorStyleClassifier
};

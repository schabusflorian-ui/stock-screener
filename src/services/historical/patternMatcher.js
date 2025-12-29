// src/services/historical/patternMatcher.js
// Matches investment decisions to known investment patterns

/**
 * PatternMatcher
 *
 * Matches investment decisions to investment patterns by:
 * 1. Comparing decision metrics to pattern typical ranges
 * 2. Calculating match scores and confidence levels
 * 3. Assigning primary and secondary pattern matches
 * 4. Updating pattern statistics based on matched decisions
 */
class PatternMatcher {
  constructor(db) {
    this.db = db;
    this._patternsCache = null;
    this._patternsCacheTime = null;
  }

  /**
   * Match a single decision to patterns
   */
  async matchDecision(decisionId) {
    const decision = this.db.prepare(`
      SELECT * FROM investment_decisions WHERE id = ?
    `).get(decisionId);

    if (!decision) {
      throw new Error(`Decision not found: ${decisionId}`);
    }

    // Get all active patterns
    const patterns = await this._getPatterns();

    // Calculate match scores for each pattern
    const matches = [];
    for (const pattern of patterns) {
      const score = this._calculateMatchScore(decision, pattern);
      if (score.confidence > 0.3) {  // Minimum threshold
        matches.push({
          patternId: pattern.id,
          patternCode: pattern.pattern_code,
          patternName: pattern.pattern_name,
          score: score.score,
          confidence: score.confidence,
          matchedCriteria: score.matchedCriteria,
          missedCriteria: score.missedCriteria
        });
      }
    }

    // Sort by confidence
    matches.sort((a, b) => b.confidence - a.confidence);

    // Update decision with primary pattern
    if (matches.length > 0) {
      const primary = matches[0];

      this.db.prepare(`
        UPDATE investment_decisions SET
          primary_pattern_id = ?,
          pattern_confidence = ?,
          pattern_tags = ?,
          updated_at = datetime('now')
        WHERE id = ?
      `).run(
        primary.patternId,
        primary.confidence,
        JSON.stringify(matches.slice(0, 3).map(m => m.patternCode)),
        decisionId
      );

      // Store all pattern matches
      const insertMatch = this.db.prepare(`
        INSERT OR REPLACE INTO decision_pattern_matches
        (decision_id, pattern_id, match_confidence, match_score, matched_at)
        VALUES (?, ?, ?, ?, datetime('now'))
      `);

      for (const match of matches) {
        insertMatch.run(decisionId, match.patternId, match.confidence, match.score);
      }

      // Update pattern statistics
      await this._updatePatternStats(primary.patternId);
    }

    return {
      decisionId,
      matched: matches.length > 0,
      primaryPattern: matches[0] || null,
      allMatches: matches
    };
  }

  /**
   * Match all decisions to patterns
   */
  async matchAllDecisions(options = {}) {
    const { limit = 1000, rematch = false, verbose = false } = options;

    let query = `
      SELECT id, symbol, pe_ratio, roic
      FROM investment_decisions
      WHERE pe_ratio IS NOT NULL
        OR roic IS NOT NULL
    `;

    if (!rematch) {
      query += ` AND primary_pattern_id IS NULL`;
    }

    query += ` ORDER BY decision_date DESC LIMIT ?`;

    const decisions = this.db.prepare(query).all(limit);

    if (verbose) {
      console.log(`📊 Matching ${decisions.length} decisions to patterns...`);
    }

    let matched = 0;
    let errors = 0;

    for (const decision of decisions) {
      try {
        const result = await this.matchDecision(decision.id);
        if (result.matched) matched++;

        if (verbose && (matched + errors) % 100 === 0) {
          console.log(`  Processed ${matched + errors}/${decisions.length}`);
        }
      } catch (e) {
        if (verbose) {
          console.error(`Error matching decision ${decision.id}: ${e.message}`);
        }
        errors++;
      }
    }

    if (verbose) {
      console.log(`✅ Matched ${matched} decisions (${errors} errors)`);
    }

    return { matched, errors, total: decisions.length };
  }

  /**
   * Get pattern performance statistics
   */
  async getPatternPerformance(patternCode) {
    const pattern = this.db.prepare(`
      SELECT * FROM investment_patterns WHERE pattern_code = ?
    `).get(patternCode);

    if (!pattern) return null;

    // Get performance from matched decisions
    const performance = this.db.prepare(`
      SELECT
        COUNT(*) as sample_size,
        AVG(d.return_1y) as avg_return_1y,
        AVG(d.return_3y) as avg_return_3y,
        AVG(d.alpha_1y) as avg_alpha_1y,
        SUM(CASE WHEN d.beat_market_1y = 1 THEN 1 ELSE 0 END) * 100.0 /
          NULLIF(COUNT(CASE WHEN d.beat_market_1y IS NOT NULL THEN 1 END), 0) as win_rate,
        AVG(d.max_drawdown_1y) as avg_max_drawdown,
        MIN(d.return_1y) as worst_return_1y,
        MAX(d.return_1y) as best_return_1y
      FROM investment_decisions d
      WHERE d.primary_pattern_id = ?
        AND d.return_1y IS NOT NULL
    `).get(pattern.id);

    // Get top investors using this pattern
    const investors = this.db.prepare(`
      SELECT
        fi.id,
        fi.name,
        COUNT(*) as usage_count,
        AVG(d.return_1y) as avg_return,
        SUM(CASE WHEN d.beat_market_1y = 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(*) as success_rate
      FROM investment_decisions d
      JOIN famous_investors fi ON d.investor_id = fi.id
      WHERE d.primary_pattern_id = ?
        AND d.return_1y IS NOT NULL
      GROUP BY fi.id
      ORDER BY usage_count DESC
      LIMIT 10
    `).all(pattern.id);

    // Get example decisions
    const examples = this.db.prepare(`
      SELECT
        d.id,
        d.symbol,
        d.decision_date,
        d.return_1y,
        d.alpha_1y,
        fi.name as investor_name
      FROM investment_decisions d
      JOIN famous_investors fi ON d.investor_id = fi.id
      WHERE d.primary_pattern_id = ?
        AND d.return_1y IS NOT NULL
      ORDER BY ABS(d.return_1y) DESC
      LIMIT 10
    `).all(pattern.id);

    return {
      pattern: {
        code: pattern.pattern_code,
        name: pattern.pattern_name,
        category: pattern.pattern_category,
        description: pattern.description
      },
      performance,
      topInvestors: investors,
      notableExamples: examples
    };
  }

  /**
   * Get all patterns with performance data
   */
  async getAllPatterns() {
    const patterns = this.db.prepare(`
      SELECT
        ip.*,
        COUNT(d.id) as decision_count,
        AVG(d.return_1y) as avg_return_1y,
        AVG(d.alpha_1y) as avg_alpha_1y,
        SUM(CASE WHEN d.beat_market_1y = 1 THEN 1 ELSE 0 END) * 100.0 /
          NULLIF(COUNT(CASE WHEN d.beat_market_1y IS NOT NULL THEN 1 END), 0) as win_rate
      FROM investment_patterns ip
      LEFT JOIN investment_decisions d ON d.primary_pattern_id = ip.id AND d.return_1y IS NOT NULL
      WHERE ip.is_active = 1
      GROUP BY ip.id
      ORDER BY decision_count DESC
    `).all();

    return patterns.map(p => {
      if (p.typical_metrics) {
        try {
          p.typical_metrics = JSON.parse(p.typical_metrics);
        } catch (e) {
          p.typical_metrics = null;
        }
      }
      return p;
    });
  }

  // ============================================
  // Private Methods
  // ============================================

  /**
   * Get all patterns (cached)
   */
  async _getPatterns() {
    const now = Date.now();

    // Cache patterns for 5 minutes
    if (this._patternsCache && this._patternsCacheTime && (now - this._patternsCacheTime) < 300000) {
      return this._patternsCache;
    }

    const patterns = this.db.prepare(`
      SELECT * FROM investment_patterns WHERE is_active = 1
    `).all();

    // Parse JSON fields
    for (const pattern of patterns) {
      if (pattern.typical_metrics) {
        try {
          pattern.typical_metrics = JSON.parse(pattern.typical_metrics);
        } catch (e) {
          pattern.typical_metrics = {};
        }
      }
      if (pattern.typical_context) {
        try {
          pattern.typical_context = JSON.parse(pattern.typical_context);
        } catch (e) {
          pattern.typical_context = {};
        }
      }
    }

    this._patternsCache = patterns;
    this._patternsCacheTime = now;

    return patterns;
  }

  /**
   * Calculate match score between a decision and a pattern
   */
  _calculateMatchScore(decision, pattern) {
    const metrics = pattern.typical_metrics || {};
    const matchedCriteria = [];
    const missedCriteria = [];
    let totalWeight = 0;
    let matchedWeight = 0;

    // Define metric checks with weights
    const checks = [
      { metric: 'pe_ratio', field: 'pe_ratio', weight: 3 },
      { metric: 'pb_ratio', field: 'pb_ratio', weight: 2 },
      { metric: 'roic', field: 'roic', weight: 3 },
      { metric: 'roe', field: 'roe', weight: 2 },
      { metric: 'fcf_yield', field: 'fcf_yield', weight: 2 },
      { metric: 'revenue_growth_yoy', field: 'revenue_growth_yoy', weight: 2 },
      { metric: 'net_margin', field: 'net_margin', weight: 1 },
      { metric: 'debt_to_equity', field: 'debt_to_equity', weight: 2 },
      { metric: 'dividend_yield', field: 'dividend_yield', weight: 1 }
    ];

    for (const check of checks) {
      const range = metrics[check.metric];
      if (!range) continue;  // Pattern doesn't specify this metric

      const value = decision[check.field];
      totalWeight += check.weight;

      if (value == null) {
        missedCriteria.push({ metric: check.metric, reason: 'no_data' });
        continue;
      }

      const inRange = this._isInRange(value, range);
      if (inRange) {
        matchedWeight += check.weight;
        matchedCriteria.push({
          metric: check.metric,
          value,
          range: `${range.min}-${range.max}`
        });
      } else {
        missedCriteria.push({
          metric: check.metric,
          value,
          expected: `${range.min}-${range.max}`,
          reason: value < range.min ? 'below_min' : 'above_max'
        });
      }
    }

    // Additional pattern-specific checks
    const additionalScore = this._checkPatternSpecificCriteria(decision, pattern);
    matchedWeight += additionalScore.weight;
    totalWeight += additionalScore.maxWeight;
    matchedCriteria.push(...additionalScore.matched);
    missedCriteria.push(...additionalScore.missed);

    // Calculate final scores
    const score = totalWeight > 0 ? matchedWeight / totalWeight : 0;

    // Confidence is based on how much data we had to work with
    const dataAvailable = checks.filter(c =>
      metrics[c.metric] && decision[c.field] != null
    ).length;
    const dataConfidence = dataAvailable / checks.filter(c => metrics[c.metric]).length || 0;
    const confidence = score * dataConfidence;

    return {
      score,
      confidence,
      matchedCriteria,
      missedCriteria
    };
  }

  /**
   * Check if a value is within a range (with some tolerance)
   */
  _isInRange(value, range) {
    if (!range || range.min == null || range.max == null) return false;

    // Allow 20% tolerance on boundaries
    const tolerance = (range.max - range.min) * 0.2;
    return value >= (range.min - tolerance) && value <= (range.max + tolerance);
  }

  /**
   * Pattern-specific criteria that go beyond simple metric ranges
   */
  _checkPatternSpecificCriteria(decision, pattern) {
    const matched = [];
    const missed = [];
    let weight = 0;
    let maxWeight = 0;

    switch (pattern.pattern_code) {
      case 'deep_value':
        maxWeight += 2;
        // Should be beaten down (negative recent performance would be ideal)
        // We don't have this data directly, but low P/E + low P/B is a signal
        if (decision.pe_ratio && decision.pe_ratio < 10 &&
            decision.pb_ratio && decision.pb_ratio < 1) {
          weight += 2;
          matched.push({ metric: 'deep_discount', value: 'yes' });
        } else {
          missed.push({ metric: 'deep_discount', reason: 'not_deeply_discounted' });
        }
        break;

      case 'quality_compounder':
        maxWeight += 2;
        // Should have high ROIC AND growing revenue
        if (decision.roic && decision.roic > 20 &&
            decision.revenue_growth_yoy && decision.revenue_growth_yoy > 10) {
          weight += 2;
          matched.push({ metric: 'compounding_characteristics', value: 'yes' });
        } else {
          missed.push({ metric: 'compounding_characteristics', reason: 'missing_criteria' });
        }
        break;

      case 'turnaround':
        maxWeight += 2;
        // Often low or negative margins with potential improvement
        if (decision.net_margin && decision.net_margin < 5 &&
            decision.pe_ratio && decision.pe_ratio > 0) {
          weight += 2;
          matched.push({ metric: 'turnaround_profile', value: 'yes' });
        }
        break;

      case 'high_growth_premium':
        maxWeight += 2;
        // Very high growth justifying premium
        if (decision.revenue_growth_yoy && decision.revenue_growth_yoy > 30) {
          weight += 2;
          matched.push({ metric: 'exceptional_growth', value: decision.revenue_growth_yoy });
        }
        break;
    }

    return { weight, maxWeight, matched, missed };
  }

  /**
   * Update pattern statistics after matching
   */
  async _updatePatternStats(patternId) {
    // Update pattern with latest statistics
    const stats = this.db.prepare(`
      SELECT
        COUNT(*) as sample_size,
        AVG(return_1y) as avg_return_1y,
        AVG(return_3y) as avg_return_3y,
        SUM(CASE WHEN beat_market_1y = 1 THEN 1 ELSE 0 END) * 100.0 /
          NULLIF(COUNT(CASE WHEN beat_market_1y IS NOT NULL THEN 1 END), 0) as success_rate,
        AVG(max_drawdown_1y) as avg_max_drawdown
      FROM investment_decisions
      WHERE primary_pattern_id = ?
        AND return_1y IS NOT NULL
    `).get(patternId);

    if (stats) {
      this.db.prepare(`
        UPDATE investment_patterns SET
          sample_size = ?,
          success_rate = ?,
          avg_return_1y = ?,
          avg_return_3y = ?,
          avg_max_drawdown = ?,
          times_matched = times_matched + 1,
          last_matched_at = datetime('now'),
          updated_at = datetime('now')
        WHERE id = ?
      `).run(
        stats.sample_size,
        stats.success_rate,
        stats.avg_return_1y,
        stats.avg_return_3y,
        stats.avg_max_drawdown,
        patternId
      );
    }
  }
}

module.exports = PatternMatcher;

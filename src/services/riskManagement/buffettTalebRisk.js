/**
 * Buffett-Taleb Risk Manager
 *
 * Hybrid risk management combining value investing principles (Buffett)
 * with antifragile/tail risk concepts (Taleb/Spitznagel).
 *
 * Risk Checks:
 * 1. Margin of Safety - Don't overpay
 * 2. Circle of Competence - Invest in what you understand
 * 3. Concentration Limits - Position sizing discipline
 * 4. Barbell Allocation - Safe core + speculative sleeve
 * 5. Drawdown Management - Protect capital
 * 6. Tail Hedge Recommendations - Antifragile positioning
 */

const { MarginOfSafetyCalculator } = require('./marginOfSafety');

class BuffettTalebRiskManager {
  constructor(db) {
    this.db = db;
    this.mosCalculator = new MarginOfSafetyCalculator(db);

    // Default risk parameters (can be overridden per portfolio)
    this.DEFAULTS = {
      // Margin of Safety
      minMarginOfSafety: 0.25,        // 25% minimum
      marginOutsideCompetence: 0.35,  // 35% for unfamiliar sectors
      marginLowConfidence: 0.30,      // 30% for low confidence valuations
      marginHighVolatility: 0.30,     // 30% when VIX elevated

      // Concentration
      maxPositionPct: 0.20,           // 20% max single position
      maxSectorPct: 0.35,             // 35% max sector
      maxPositions: 15,
      minPositions: 5,

      // Barbell
      targetSafePct: 0.85,            // 85% in safe sleeve
      minSafePct: 0.75,               // Critical: 75% minimum
      targetCashPct: 0.05,            // 5% cash reserve

      // Safe sleeve criteria
      safeMinMarketCap: 10000000000,  // $10B minimum
      safeMaxBeta: 1.2,
      safeMaxDebtToEquity: 1.0,

      // Drawdown
      maxPortfolioDrawdown: 0.20,     // 20% alert
      maxPositionDrawdown: 0.30,      // 30% trim position

      // Tail hedge
      targetTailHedgePct: 0.03,       // 3% in tail hedges
      tailHedgeInstruments: ['UVXY', 'VXX', 'SQQQ', 'SH']
    };

    this.prepareStatements();
  }

  prepareStatements() {
    // Portfolio config
    this.getPortfolioConfig = this.db.prepare(`
      SELECT * FROM portfolio_risk_config WHERE portfolio_id = ?
    `);

    this.upsertPortfolioConfig = this.db.prepare(`
      INSERT INTO portfolio_risk_config (
        portfolio_id, min_margin_of_safety, margin_outside_competence,
        max_position_pct, max_sector_pct, max_positions, min_positions,
        target_safe_pct, min_safe_pct, target_cash_pct,
        safe_min_market_cap, safe_max_beta, safe_max_debt_to_equity,
        max_portfolio_drawdown, max_position_drawdown, drawdown_action,
        target_tail_hedge_pct, tail_hedge_instruments,
        core_sectors, core_industries, kelly_fraction, max_kelly_bet
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(portfolio_id) DO UPDATE SET
        min_margin_of_safety = excluded.min_margin_of_safety,
        margin_outside_competence = excluded.margin_outside_competence,
        max_position_pct = excluded.max_position_pct,
        max_sector_pct = excluded.max_sector_pct,
        target_safe_pct = excluded.target_safe_pct,
        min_safe_pct = excluded.min_safe_pct,
        max_portfolio_drawdown = excluded.max_portfolio_drawdown,
        updated_at = CURRENT_TIMESTAMP
    `);

    // Portfolio holdings
    this.getPortfolioHoldings = this.db.prepare(`
      SELECT
        ph.*,
        c.symbol,
        c.name,
        c.sector,
        c.industry,
        pm.market_cap,
        pm.beta,
        pm.last_price,
        cm.debt_to_equity,
        cm.roic
      FROM portfolio_holdings ph
      JOIN companies c ON ph.company_id = c.id
      LEFT JOIN price_metrics pm ON pm.company_id = c.id
      LEFT JOIN calculated_metrics cm ON cm.company_id = c.id AND cm.period_type = 'annual'
      WHERE ph.portfolio_id = ?
        AND ph.quantity > 0
    `);

    this.getPortfolioValue = this.db.prepare(`
      SELECT
        SUM(ph.quantity * pm.last_price) as total_value,
        SUM(ph.cost_basis) as total_cost
      FROM portfolio_holdings ph
      JOIN price_metrics pm ON pm.company_id = ph.company_id
      WHERE ph.portfolio_id = ?
        AND ph.quantity > 0
    `);

    this.getPortfolioCash = this.db.prepare(`
      SELECT cash_balance FROM portfolios WHERE id = ?
    `);

    // Drawdown tracking
    this.getActiveDrawdown = this.db.prepare(`
      SELECT * FROM drawdown_history
      WHERE portfolio_id = ? AND is_active = 1
      ORDER BY start_date DESC
      LIMIT 1
    `);

    this.insertDrawdown = this.db.prepare(`
      INSERT INTO drawdown_history (
        portfolio_id, start_date, peak_value, current_value,
        current_drawdown_pct, is_active
      ) VALUES (?, ?, ?, ?, ?, 1)
    `);

    this.updateDrawdown = this.db.prepare(`
      UPDATE drawdown_history SET
        trough_date = CASE WHEN current_value < trough_value OR trough_value IS NULL
                          THEN CURRENT_DATE ELSE trough_date END,
        trough_value = CASE WHEN current_value < trough_value OR trough_value IS NULL
                           THEN ? ELSE trough_value END,
        current_value = ?,
        current_drawdown_pct = ?,
        max_drawdown_pct = CASE WHEN ? > max_drawdown_pct OR max_drawdown_pct IS NULL
                               THEN ? ELSE max_drawdown_pct END,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    this.closeDrawdown = this.db.prepare(`
      UPDATE drawdown_history SET
        recovery_date = CURRENT_DATE,
        is_recovered = 1,
        is_active = 0,
        days_to_recovery = julianday(CURRENT_DATE) - julianday(start_date),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    // Risk events
    this.insertRiskEvent = this.db.prepare(`
      INSERT INTO risk_events (
        portfolio_id, company_id, event_type, severity,
        check_name, check_result, required_value, actual_value,
        trade_context, message, recommendation
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Company lookup
    this.getCompanyDetails = this.db.prepare(`
      SELECT
        c.id,
        c.symbol,
        c.name,
        c.sector,
        c.industry,
        pm.market_cap,
        pm.beta,
        pm.last_price
      FROM companies c
      LEFT JOIN price_metrics pm ON pm.company_id = c.id
      WHERE c.id = ?
    `);
  }

  /**
   * Get effective config (portfolio-specific or defaults)
   */
  getConfig(portfolioId) {
    const custom = this.getPortfolioConfig.get(portfolioId);
    if (custom) {
      return {
        ...this.DEFAULTS,
        ...custom,
        coreSectors: custom.core_sectors ? JSON.parse(custom.core_sectors) : null,
        coreIndustries: custom.core_industries ? JSON.parse(custom.core_industries) : null,
        tailHedgeInstruments: custom.tail_hedge_instruments
          ? JSON.parse(custom.tail_hedge_instruments)
          : this.DEFAULTS.tailHedgeInstruments
      };
    }
    return this.DEFAULTS;
  }

  /**
   * Save/update portfolio risk config
   */
  saveConfig(portfolioId, config) {
    const c = { ...this.DEFAULTS, ...config };

    this.upsertPortfolioConfig.run(
      portfolioId,
      c.minMarginOfSafety,
      c.marginOutsideCompetence,
      c.maxPositionPct,
      c.maxSectorPct,
      c.maxPositions,
      c.minPositions,
      c.targetSafePct,
      c.minSafePct,
      c.targetCashPct,
      c.safeMinMarketCap,
      c.safeMaxBeta,
      c.safeMaxDebtToEquity,
      c.maxPortfolioDrawdown,
      c.maxPositionDrawdown,
      c.drawdownAction || 'alert',
      c.targetTailHedgePct,
      JSON.stringify(c.tailHedgeInstruments || this.DEFAULTS.tailHedgeInstruments),
      c.coreSectors ? JSON.stringify(c.coreSectors) : null,
      c.coreIndustries ? JSON.stringify(c.coreIndustries) : null,
      c.kellyFraction || 0.5,
      c.maxKellyBet || 0.25
    );

    return this.getConfig(portfolioId);
  }

  /**
   * CHECK 1: Margin of Safety
   */
  async checkMarginOfSafety(companyId, portfolioId, options = {}) {
    const config = this.getConfig(portfolioId);
    const { isOutsideCompetence = false, isLowConfidence = false, isHighVolatility = false } = options;

    // Determine required margin
    let requiredMargin = config.minMarginOfSafety || config.min_margin_of_safety;

    if (isOutsideCompetence) {
      requiredMargin = Math.max(requiredMargin, config.marginOutsideCompetence || config.margin_outside_competence || 0.35);
    }
    if (isLowConfidence) {
      requiredMargin = Math.max(requiredMargin, 0.30);
    }
    if (isHighVolatility) {
      requiredMargin = Math.max(requiredMargin, 0.30);
    }

    // Get valuation
    const mosCheck = this.mosCalculator.checkMarginOfSafety(companyId, requiredMargin);

    const result = {
      check: 'marginOfSafety',
      passed: mosCheck.passed,
      marginOfSafety: mosCheck.marginOfSafety,
      required: requiredMargin,
      intrinsicValue: mosCheck.intrinsicValue,
      currentPrice: mosCheck.currentPrice,
      valuationSignal: mosCheck.valuationSignal,
      adjustments: {
        outsideCompetence: isOutsideCompetence,
        lowConfidence: isLowConfidence,
        highVolatility: isHighVolatility
      }
    };

    // Log risk event if failed
    if (!result.passed) {
      const company = this.getCompanyDetails.get(companyId);
      this.logRiskEvent(portfolioId, companyId, 'margin_of_safety', 'warning', result);
    }

    return result;
  }

  /**
   * CHECK 2: Circle of Competence
   */
  checkCircleOfCompetence(companyId, portfolioId) {
    const config = this.getConfig(portfolioId);
    const company = this.getCompanyDetails.get(companyId);

    if (!company) {
      return { check: 'circleOfCompetence', passed: false, reason: 'Company not found' };
    }

    const coreSectors = config.coreSectors;
    const coreIndustries = config.coreIndustries;

    // If no core sectors defined, assume all sectors are within competence
    if (!coreSectors && !coreIndustries) {
      return {
        check: 'circleOfCompetence',
        passed: true,
        sector: company.sector,
        industry: company.industry,
        note: 'No circle of competence defined - all sectors allowed'
      };
    }

    const sectorMatch = !coreSectors || coreSectors.includes(company.sector);
    const industryMatch = !coreIndustries || coreIndustries.includes(company.industry);

    const isInCompetence = sectorMatch || industryMatch;

    return {
      check: 'circleOfCompetence',
      passed: isInCompetence,
      isOutsideCompetence: !isInCompetence,
      sector: company.sector,
      industry: company.industry,
      coreSectors: coreSectors,
      coreIndustries: coreIndustries,
      requiresHigherMargin: !isInCompetence
    };
  }

  /**
   * CHECK 3: Concentration Limits
   */
  checkConcentration(portfolioId, newPositionValue = 0, companyId = null) {
    const config = this.getConfig(portfolioId);
    const holdings = this.getPortfolioHoldings.all(portfolioId);
    const portfolioValue = this.getPortfolioValue.get(portfolioId);
    const cash = this.getPortfolioCash.get(portfolioId)?.cash_balance || 0;

    const totalValue = (portfolioValue?.total_value || 0) + cash + newPositionValue;

    if (totalValue <= 0) {
      return { check: 'concentration', passed: true, note: 'Empty portfolio' };
    }

    const result = {
      check: 'concentration',
      passed: true,
      warnings: [],
      blockers: []
    };

    // Position count check
    const positionCount = holdings.length + (newPositionValue > 0 ? 1 : 0);
    const maxPositions = config.maxPositions || config.max_positions;
    if (positionCount > maxPositions) {
      result.passed = false;
      result.blockers.push(`Position count (${positionCount}) exceeds maximum (${maxPositions})`);
    }
    result.positionCount = positionCount;
    result.maxPositions = maxPositions;

    // Single position size check
    const maxPositionPct = config.maxPositionPct || config.max_position_pct;
    if (newPositionValue > 0) {
      const positionPct = newPositionValue / totalValue;
      if (positionPct > maxPositionPct) {
        result.passed = false;
        result.blockers.push(`Position size (${(positionPct * 100).toFixed(1)}%) exceeds maximum (${maxPositionPct * 100}%)`);
      }
      result.newPositionPct = positionPct;
    }

    // Sector concentration check
    const sectorExposure = {};
    for (const h of holdings) {
      const sector = h.sector || 'Unknown';
      const value = h.quantity * h.last_price;
      sectorExposure[sector] = (sectorExposure[sector] || 0) + value;
    }

    const maxSectorPct = config.maxSectorPct || config.max_sector_pct;
    for (const [sector, value] of Object.entries(sectorExposure)) {
      const pct = value / totalValue;
      if (pct > maxSectorPct) {
        result.warnings.push(`${sector} concentration (${(pct * 100).toFixed(1)}%) exceeds target (${maxSectorPct * 100}%)`);
      }
    }
    result.sectorExposure = sectorExposure;

    return result;
  }

  /**
   * CHECK 4: Barbell Allocation
   */
  checkBarbellAllocation(portfolioId) {
    const config = this.getConfig(portfolioId);
    const holdings = this.getPortfolioHoldings.all(portfolioId);
    const portfolioValue = this.getPortfolioValue.get(portfolioId);
    const cash = this.getPortfolioCash.get(portfolioId)?.cash_balance || 0;

    const totalValue = (portfolioValue?.total_value || 0) + cash;

    if (totalValue <= 0) {
      return { check: 'barbell', passed: true, note: 'Empty portfolio' };
    }

    // Classify each holding as safe or speculative
    let safeValue = cash; // Cash counts as safe
    let speculativeValue = 0;
    let tailHedgeValue = 0;

    const safeMinMarketCap = config.safeMinMarketCap || config.safe_min_market_cap;
    const safeMaxBeta = config.safeMaxBeta || config.safe_max_beta;
    const safeMaxDebtToEquity = config.safeMaxDebtToEquity || config.safe_max_debt_to_equity;
    const tailHedgeInstruments = config.tailHedgeInstruments || [];

    for (const h of holdings) {
      const positionValue = h.quantity * h.last_price;

      // Check if it's a tail hedge instrument
      if (tailHedgeInstruments.includes(h.symbol)) {
        tailHedgeValue += positionValue;
        continue;
      }

      // Classify as safe or speculative
      const isSafe = (
        (h.market_cap >= safeMinMarketCap || h.market_cap === null) &&
        (h.beta <= safeMaxBeta || h.beta === null) &&
        (h.debt_to_equity <= safeMaxDebtToEquity || h.debt_to_equity === null)
      );

      if (isSafe) {
        safeValue += positionValue;
      } else {
        speculativeValue += positionValue;
      }
    }

    const safePct = safeValue / totalValue;
    const speculativePct = speculativeValue / totalValue;
    const tailHedgePct = tailHedgeValue / totalValue;
    const cashPct = cash / totalValue;

    const targetSafePct = config.targetSafePct || config.target_safe_pct;
    const minSafePct = config.minSafePct || config.min_safe_pct;
    const targetTailHedgePct = config.targetTailHedgePct || config.target_tail_hedge_pct;
    const targetCashPct = config.targetCashPct || config.target_cash_pct;

    const result = {
      check: 'barbell',
      passed: true,
      warnings: [],
      blockers: [],
      allocation: {
        safe: { value: safeValue, pct: safePct },
        speculative: { value: speculativeValue, pct: speculativePct },
        tailHedge: { value: tailHedgeValue, pct: tailHedgePct },
        cash: { value: cash, pct: cashPct }
      },
      targets: {
        safePct: targetSafePct,
        minSafePct: minSafePct,
        tailHedgePct: targetTailHedgePct,
        cashPct: targetCashPct
      }
    };

    // Check minimum safe allocation
    if (safePct < minSafePct) {
      result.passed = false;
      result.blockers.push(
        `Safe allocation (${(safePct * 100).toFixed(1)}%) below minimum (${minSafePct * 100}%)`
      );
    } else if (safePct < targetSafePct) {
      result.warnings.push(
        `Safe allocation (${(safePct * 100).toFixed(1)}%) below target (${targetSafePct * 100}%)`
      );
    }

    // Check tail hedge
    if (tailHedgePct < targetTailHedgePct * 0.5) {
      result.warnings.push(
        `Tail hedge (${(tailHedgePct * 100).toFixed(1)}%) significantly below target (${targetTailHedgePct * 100}%)`
      );
    }

    return result;
  }

  /**
   * CHECK 5: Drawdown
   */
  checkDrawdown(portfolioId) {
    const config = this.getConfig(portfolioId);
    const portfolioValue = this.getPortfolioValue.get(portfolioId);
    const cash = this.getPortfolioCash.get(portfolioId)?.cash_balance || 0;
    const currentValue = (portfolioValue?.total_value || 0) + cash;

    // Get or create active drawdown tracking
    const activeDrawdown = this.getActiveDrawdown.get(portfolioId);

    if (!activeDrawdown) {
      // No active drawdown - start tracking with current as peak
      this.insertDrawdown.run(portfolioId, new Date().toISOString().split('T')[0], currentValue, currentValue, 0);
      return {
        check: 'drawdown',
        passed: true,
        currentDrawdown: 0,
        maxAllowed: config.maxPortfolioDrawdown || config.max_portfolio_drawdown,
        peakValue: currentValue,
        note: 'Started drawdown tracking'
      };
    }

    const peakValue = activeDrawdown.peak_value;

    // Check if we hit new peak (recovered)
    if (currentValue >= peakValue) {
      // Recovered from drawdown
      if (activeDrawdown.current_drawdown_pct > 0.01) {
        this.closeDrawdown.run(activeDrawdown.id);
        // Start new tracking period
        this.insertDrawdown.run(portfolioId, new Date().toISOString().split('T')[0], currentValue, currentValue, 0);
      }

      return {
        check: 'drawdown',
        passed: true,
        currentDrawdown: 0,
        maxAllowed: config.maxPortfolioDrawdown || config.max_portfolio_drawdown,
        peakValue: currentValue,
        recovered: true
      };
    }

    // Calculate current drawdown
    const currentDrawdown = (peakValue - currentValue) / peakValue;

    // Update drawdown record
    this.updateDrawdown.run(
      currentValue, // trough value
      currentValue, // current value
      currentDrawdown,
      currentDrawdown, // for max drawdown comparison
      currentDrawdown,
      activeDrawdown.id
    );

    const maxAllowed = config.maxPortfolioDrawdown || config.max_portfolio_drawdown;

    const result = {
      check: 'drawdown',
      passed: currentDrawdown <= maxAllowed,
      currentDrawdown: currentDrawdown,
      maxAllowed: maxAllowed,
      peakValue: peakValue,
      currentValue: currentValue,
      daysSincePeak: activeDrawdown.days_to_trough || 0
    };

    if (!result.passed) {
      result.severity = currentDrawdown > maxAllowed * 1.5 ? 'critical' : 'warning';
      this.logRiskEvent(portfolioId, null, 'drawdown', result.severity, result);
    }

    return result;
  }

  /**
   * CHECK 6: Tail Hedge Recommendation
   */
  getTailHedgeRecommendation(portfolioId) {
    const config = this.getConfig(portfolioId);
    const barbellCheck = this.checkBarbellAllocation(portfolioId);

    const currentTailHedgePct = barbellCheck.allocation.tailHedge.pct;
    const targetPct = config.targetTailHedgePct || config.target_tail_hedge_pct;
    const portfolioValue = barbellCheck.allocation.safe.value +
                          barbellCheck.allocation.speculative.value +
                          barbellCheck.allocation.tailHedge.value +
                          barbellCheck.allocation.cash.value;

    // Check market conditions (use VIX if available)
    let marketCondition = 'normal';
    let recommendedPct = targetPct;

    try {
      const vix = this.db.prepare(`
        SELECT value FROM economic_indicators
        WHERE series = 'VIXCLS'
        ORDER BY date DESC
        LIMIT 1
      `).get();

      if (vix) {
        if (vix.value > 30) {
          marketCondition = 'elevated_fear';
          recommendedPct = targetPct * 0.5; // Reduce target when VIX high (hedges expensive)
        } else if (vix.value < 15) {
          marketCondition = 'complacent';
          recommendedPct = targetPct * 1.5; // Increase target when VIX low (hedges cheap)
        }
      }
    } catch (e) {
      // VIX data not available
    }

    const currentValue = barbellCheck.allocation.tailHedge.value;
    const targetValue = portfolioValue * recommendedPct;
    const gap = targetValue - currentValue;

    const instruments = config.tailHedgeInstruments || this.DEFAULTS.tailHedgeInstruments;

    return {
      currentAllocation: {
        value: currentValue,
        pct: currentTailHedgePct
      },
      target: {
        pct: recommendedPct,
        value: targetValue
      },
      gap: {
        value: gap,
        pct: gap / portfolioValue
      },
      marketCondition: marketCondition,
      recommendation: gap > 0
        ? `Add $${gap.toFixed(0)} to tail hedges using: ${instruments.join(', ')}`
        : 'Tail hedge allocation adequate',
      suggestedInstruments: instruments,
      notes: [
        'Tail hedges provide convex payoff in market crashes',
        'Cost of hedges is insurance premium - expected to lose in normal times',
        'Spitznagel recommends far OTM puts on broad indices'
      ]
    };
  }

  /**
   * COMPREHENSIVE: Assess Trade Risk
   */
  async assessTradeRisk(portfolioId, companyId, positionValue, options = {}) {
    const { skipMOS = false } = options;

    const result = {
      approved: true,
      overallScore: 1.0,
      checks: {},
      warnings: [],
      blockers: [],
      recommendation: 'APPROVED'
    };

    // 1. Circle of Competence (run first to adjust MOS requirement)
    const competenceCheck = this.checkCircleOfCompetence(companyId, portfolioId);
    result.checks.circleOfCompetence = competenceCheck;

    // 2. Margin of Safety (if not skipped)
    if (!skipMOS) {
      const mosCheck = await this.checkMarginOfSafety(companyId, portfolioId, {
        isOutsideCompetence: competenceCheck.isOutsideCompetence
      });
      result.checks.marginOfSafety = mosCheck;

      if (!mosCheck.passed) {
        result.approved = false;
        result.blockers.push(
          `Insufficient margin of safety: ${((mosCheck.marginOfSafety || 0) * 100).toFixed(1)}% ` +
          `(required: ${(mosCheck.required * 100).toFixed(1)}%)`
        );
        result.overallScore -= 0.3;
      }
    }

    // 3. Concentration check
    const concentrationCheck = this.checkConcentration(portfolioId, positionValue, companyId);
    result.checks.concentration = concentrationCheck;

    if (!concentrationCheck.passed) {
      result.approved = false;
      result.blockers.push(...concentrationCheck.blockers);
      result.overallScore -= 0.2;
    }
    if (concentrationCheck.warnings) {
      result.warnings.push(...concentrationCheck.warnings);
    }

    // 4. Barbell allocation
    const barbellCheck = this.checkBarbellAllocation(portfolioId);
    result.checks.barbell = barbellCheck;

    if (!barbellCheck.passed) {
      result.approved = false;
      result.blockers.push(...barbellCheck.blockers);
      result.overallScore -= 0.2;
    }
    if (barbellCheck.warnings) {
      result.warnings.push(...barbellCheck.warnings);
    }

    // 5. Drawdown check
    const drawdownCheck = this.checkDrawdown(portfolioId);
    result.checks.drawdown = drawdownCheck;

    if (!drawdownCheck.passed) {
      if (drawdownCheck.severity === 'critical') {
        result.approved = false;
        result.blockers.push(
          `Portfolio drawdown (${(drawdownCheck.currentDrawdown * 100).toFixed(1)}%) ` +
          `exceeds maximum (${(drawdownCheck.maxAllowed * 100).toFixed(1)}%)`
        );
      } else {
        result.warnings.push(
          `Elevated drawdown: ${(drawdownCheck.currentDrawdown * 100).toFixed(1)}%`
        );
      }
      result.overallScore -= 0.15;
    }

    // Calculate final score
    result.overallScore = Math.max(0, result.overallScore);

    // Set recommendation
    if (!result.approved) {
      result.recommendation = 'BLOCKED';
    } else if (result.warnings.length > 0) {
      result.recommendation = 'APPROVED_WITH_WARNINGS';
    }

    // Log risk event
    this.logRiskEvent(portfolioId, companyId, 'trade_assessment',
      result.approved ? 'info' : 'blocked', result);

    return result;
  }

  /**
   * Log risk event
   */
  logRiskEvent(portfolioId, companyId, eventType, severity, result) {
    this.insertRiskEvent.run(
      portfolioId,
      companyId,
      eventType,
      severity,
      result.check || eventType,
      result.passed ? 'passed' : 'failed',
      result.required || null,
      result.marginOfSafety || result.currentDrawdown || null,
      JSON.stringify(result),
      result.blockers?.join('; ') || result.warnings?.join('; ') || null,
      result.recommendation || null
    );
  }

  /**
   * Get recent risk events
   */
  getRiskEvents(portfolioId, options = {}) {
    const { limit = 50, severity = null, unresolved = false } = options;

    let query = `
      SELECT re.*, c.symbol, c.name
      FROM risk_events re
      LEFT JOIN companies c ON re.company_id = c.id
      WHERE re.portfolio_id = ?
    `;

    const params = [portfolioId];

    if (severity) {
      query += ' AND re.severity = ?';
      params.push(severity);
    }

    if (unresolved) {
      query += ' AND re.resolved = 0';
    }

    query += ' ORDER BY re.created_at DESC LIMIT ?';
    params.push(limit);

    return this.db.prepare(query).all(...params);
  }

  /**
   * Get portfolio risk summary
   */
  getPortfolioRiskSummary(portfolioId) {
    const concentration = this.checkConcentration(portfolioId);
    const barbell = this.checkBarbellAllocation(portfolioId);
    const drawdown = this.checkDrawdown(portfolioId);
    const tailHedge = this.getTailHedgeRecommendation(portfolioId);

    const unresolvedEvents = this.db.prepare(`
      SELECT severity, COUNT(*) as count
      FROM risk_events
      WHERE portfolio_id = ? AND resolved = 0
      GROUP BY severity
    `).all(portfolioId);

    return {
      concentration,
      barbell,
      drawdown,
      tailHedge,
      unresolvedEvents,
      overallHealth: this.calculateOverallHealth(concentration, barbell, drawdown)
    };
  }

  calculateOverallHealth(concentration, barbell, drawdown) {
    let score = 100;
    const issues = [];

    if (!concentration.passed) {
      score -= 20;
      issues.push('Concentration limits exceeded');
    }
    if (!barbell.passed) {
      score -= 25;
      issues.push('Barbell allocation out of balance');
    }
    if (!drawdown.passed) {
      score -= 30;
      issues.push('Drawdown exceeds limits');
    }

    // Warnings
    score -= (concentration.warnings?.length || 0) * 5;
    score -= (barbell.warnings?.length || 0) * 5;

    return {
      score: Math.max(0, score),
      status: score >= 80 ? 'healthy' : score >= 60 ? 'warning' : 'critical',
      issues
    };
  }
}

module.exports = { BuffettTalebRiskManager };

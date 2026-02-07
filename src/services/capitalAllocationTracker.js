// src/services/capitalAllocationTracker.js
// Service for tracking capital allocation: buybacks, dividends, and shareholder returns

const { getDatabaseAsync } = require('../database');

/**
 * Capital Allocation Tracker
 *
 * Tracks how companies deploy capital:
 * - Buyback programs and execution
 * - Dividend payments and changes
 * - Overall capital allocation summary
 * - Shareholder yield calculations
 */
class CapitalAllocationTracker {
  constructor() {
    // No db initialization needed with async pattern
  }


  // ============================================
  // BUYBACK PROGRAM MANAGEMENT
  // ============================================

  /**
   * Parse a buyback announcement from 8-K filing
   * @param {string} filingContent - 8-K filing text content
   * @returns {Object|null} Parsed buyback program data
   */
  parseBuybackAnnouncement(filingContent) {
    const content = filingContent.toLowerCase();

    // Check if this is a buyback announcement
    const buybackKeywords = [
      'share repurchase', 'stock repurchase', 'buyback',
      'repurchase program', 'repurchase plan'
    ];

    const hasBuybackContent = buybackKeywords.some(kw => content.includes(kw));
    if (!hasBuybackContent) return null;

    const result = {
      authorizationAmount: null,
      authorizationShares: null,
      expirationDate: null,
      notes: []
    };

    // Extract dollar amount authorization
    // Patterns like: "$10 billion", "up to $5,000,000,000", "$500 million"
    const dollarPatterns = [
      /(?:up\s+to\s+)?\$\s*([\d,]+(?:\.\d+)?)\s*(billion|million|b|m)/gi,
      /(?:authorized|approved|announced).*?\$\s*([\d,]+(?:\.\d+)?)\s*(billion|million|b|m)?/gi
    ];

    for (const pattern of dollarPatterns) {
      const match = pattern.exec(filingContent);
      if (match) {
        let amount = parseFloat(match[1].replace(/,/g, ''));
        const unit = (match[2] || '').toLowerCase();

        if (unit.startsWith('b')) {
          amount *= 1_000_000_000;
        } else if (unit.startsWith('m')) {
          amount *= 1_000_000;
        }

        if (amount > 0) {
          result.authorizationAmount = amount;
          break;
        }
      }
    }

    // Extract share count authorization
    // Patterns like: "50 million shares", "100,000,000 shares"
    const sharePatterns = [
      /([\d,]+(?:\.\d+)?)\s*(billion|million|b|m)?\s*shares/gi
    ];

    for (const pattern of sharePatterns) {
      const match = pattern.exec(filingContent);
      if (match) {
        let shares = parseFloat(match[1].replace(/,/g, ''));
        const unit = (match[2] || '').toLowerCase();

        if (unit.startsWith('b')) {
          shares *= 1_000_000_000;
        } else if (unit.startsWith('m')) {
          shares *= 1_000_000;
        }

        if (shares > 0) {
          result.authorizationShares = shares;
          break;
        }
      }
    }

    // Extract expiration date
    const expirationPatterns = [
      /(?:expir(?:e|es|ation)|through|until|ending)\s*(?:on|:)?\s*(\w+\s+\d{1,2},?\s+\d{4})/gi,
      /(\d{4})\s*(?:expiration|through|until)/gi
    ];

    for (const pattern of expirationPatterns) {
      const match = pattern.exec(filingContent);
      if (match) {
        try {
          const dateStr = match[1];
          const date = new Date(dateStr);
          if (!isNaN(date.getTime())) {
            result.expirationDate = date.toISOString().split('T')[0];
            break;
          }
        } catch (e) {
          // Continue to next pattern
        }
      }
    }

    // Check for "no expiration" mentions
    if (!result.expirationDate && /no\s+(?:set\s+)?expiration/i.test(filingContent)) {
      result.notes.push('No set expiration date');
    }

    // Check for new/additional program indicators
    if (/new\s+(?:share\s+)?repurchase/i.test(content)) {
      result.notes.push('New program');
    }
    if (/(?:increase|additional|added)\s+(?:to\s+)?(?:the\s+)?(?:share\s+)?repurchase/i.test(content)) {
      result.notes.push('Increase to existing program');
    }

    return result.authorizationAmount || result.authorizationShares ? result : null;
  }

  /**
   * Store a new buyback program
   */
  async storeBuybackProgram(companyId, data, filing) {
    const database = await getDatabaseAsync();

    const programResult = await database.query(`
      INSERT INTO buyback_programs (
        company_id, announced_date, authorization_amount, authorization_shares,
        expiration_date, status, source_filing, accession_number, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id
    `, [
      companyId,
      data.announcedDate || filing.filingDate,
      data.authorizationAmount,
      data.authorizationShares,
      data.expirationDate,
      'active',
      filing.formType || '8-K',
      filing.accessionNumber,
      data.notes?.join('; ') || null
    ]);

    const programId = programResult.rows[0].id;

    // Create significant event
    const formattedAmount = data.authorizationAmount
      ? this.formatCurrency(data.authorizationAmount)
      : `${this.formatNumber(data.authorizationShares)} shares`;

    await database.query(`
      INSERT INTO significant_events (
        company_id, event_type, event_date, headline, description,
        value, value_formatted, significance_score, is_positive,
        source_type, source_url, accession_number,
        insider_id, program_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    `, [
      companyId,
      'buyback_announcement',
      data.announcedDate || filing.filingDate,
      `New Buyback Program: ${formattedAmount}`,
      `Company announced a new share repurchase program${data.expirationDate ? ` through ${data.expirationDate}` : ''}.`,
      data.authorizationAmount || data.authorizationShares,
      formattedAmount,
      this.calculateBuybackSignificance(data),
      true, // is_positive
      'sec_filing',
      null,
      filing.accessionNumber,
      null,
      programId
    ]);

    return programId;
  }

  /**
   * Calculate significance score for buyback announcement
   */
  calculateBuybackSignificance(data) {
    let score = 50; // Base score

    if (data.authorizationAmount) {
      if (data.authorizationAmount >= 10_000_000_000) score += 30; // $10B+
      else if (data.authorizationAmount >= 5_000_000_000) score += 20; // $5B+
      else if (data.authorizationAmount >= 1_000_000_000) score += 10; // $1B+
    }

    if (data.notes?.includes('New program')) score += 5;
    if (data.notes?.includes('Increase')) score += 3;

    return Math.min(score, 100);
  }

  /**
   * Extract buyback execution data from 10-Q/10-K filing
   */
  extractBuybackExecution(companyId, fiscalQuarter, filingContent) {
    // Look for Item 2: Unregistered Sales / Issuer Purchases table
    const content = filingContent;

    // Common patterns in the repurchase disclosure table
    const result = {
      sharesRepurchased: null,
      amountSpent: null,
      averagePrice: null,
      monthlyBreakdown: []
    };

    // Try to find the repurchase table section
    const tablePatterns = [
      /issuer\s+purchases\s+of\s+equity\s+securities([\s\S]*?)(?:item\s+\d|$)/i,
      /share\s+repurchase\s+(?:program|activity)([\s\S]*?)(?:\n\n|\r\n\r\n|item\s+\d)/i
    ];

    let tableContent = null;
    for (const pattern of tablePatterns) {
      const match = pattern.exec(content);
      if (match) {
        tableContent = match[1];
        break;
      }
    }

    if (tableContent) {
      // Extract total shares and amounts
      // Look for patterns like: "Total   1,234,567   $123.45   $152,469,066"
      const totalPattern = /total[^\d]*([\d,]+)\s+\$?([\d,.]+)\s+\$?([\d,]+(?:\.\d+)?)/i;
      const totalMatch = totalPattern.exec(tableContent);

      if (totalMatch) {
        result.sharesRepurchased = parseFloat(totalMatch[1].replace(/,/g, ''));
        result.averagePrice = parseFloat(totalMatch[2].replace(/,/g, ''));
        result.amountSpent = parseFloat(totalMatch[3].replace(/,/g, ''));
      }

      // Try to extract monthly breakdown
      const monthPattern = /(\w+\s+\d{1,2}(?:\s*-\s*\w+\s+\d{1,2})?)[,\s]*([\d,]+)\s+\$?([\d,.]+)/g;
      let monthMatch;
      while ((monthMatch = monthPattern.exec(tableContent)) !== null) {
        result.monthlyBreakdown.push({
          period: monthMatch[1],
          shares: parseFloat(monthMatch[2].replace(/,/g, '')),
          avgPrice: parseFloat(monthMatch[3].replace(/,/g, ''))
        });
      }
    }

    return result.sharesRepurchased ? result : null;
  }

  /**
   * Store buyback execution activity
   */
  async storeBuybackActivity(companyId, fiscalQuarter, data, filing) {
    const database = await getDatabaseAsync();

    // Find active program
    const activeProgramsResult = await database.query(`
      SELECT * FROM buyback_programs
      WHERE company_id = $1 AND status = 'active'
      ORDER BY announced_date DESC
    `, [companyId]);

    const activePrograms = activeProgramsResult.rows;
    const programId = activePrograms.length > 0 ? activePrograms[0].id : null;

    // Store the activity
    await database.query(`
      INSERT INTO buyback_activity (
        company_id, program_id, fiscal_quarter,
        shares_repurchased, amount_spent, average_price,
        month1_shares, month1_amount, month2_shares, month2_amount,
        month3_shares, month3_amount, source_filing, accession_number
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      ON CONFLICT(company_id, fiscal_quarter) DO UPDATE SET
        shares_repurchased = excluded.shares_repurchased,
        amount_spent = excluded.amount_spent,
        average_price = excluded.average_price,
        month1_shares = excluded.month1_shares,
        month1_amount = excluded.month1_amount,
        month2_shares = excluded.month2_shares,
        month2_amount = excluded.month2_amount,
        month3_shares = excluded.month3_shares,
        month3_amount = excluded.month3_amount,
        source_filing = excluded.source_filing,
        accession_number = excluded.accession_number
    `, [
      companyId,
      programId,
      fiscalQuarter,
      data.sharesRepurchased,
      data.amountSpent,
      data.averagePrice,
      data.monthlyBreakdown[0]?.shares || null,
      data.monthlyBreakdown[0]?.shares ? data.monthlyBreakdown[0].shares * data.monthlyBreakdown[0].avgPrice : null,
      data.monthlyBreakdown[1]?.shares || null,
      data.monthlyBreakdown[1]?.shares ? data.monthlyBreakdown[1].shares * data.monthlyBreakdown[1].avgPrice : null,
      data.monthlyBreakdown[2]?.shares || null,
      data.monthlyBreakdown[2]?.shares ? data.monthlyBreakdown[2].shares * data.monthlyBreakdown[2].avgPrice : null,
      filing.formType,
      filing.accessionNumber
    ]);

    // Update program totals if we have an active program
    if (programId) {
      const program = activePrograms[0];
      const newTotal = (program.shares_repurchased || 0) + (data.sharesRepurchased || 0);
      const newAmountSpent = (program.amount_spent || 0) + (data.amountSpent || 0);
      const newAvgPrice = newAmountSpent / newTotal;
      const remaining = program.authorization_amount
        ? program.authorization_amount - newAmountSpent
        : null;

      await database.query(`
        UPDATE buyback_programs SET
          shares_repurchased = $1,
          amount_spent = $2,
          average_price = $3,
          remaining_authorization = $4,
          status = $5,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $6
      `, [
        newTotal,
        newAmountSpent,
        newAvgPrice,
        remaining,
        remaining !== null && remaining <= 0 ? 'completed' : 'active',
        programId
      ]);
    }
  }

  // ============================================
  // DIVIDEND MANAGEMENT
  // ============================================

  /**
   * Store a dividend record
   */
  async storeDividend(companyId, data) {
    const database = await getDatabaseAsync();

    // Get prior dividend to calculate change
    const priorDividendResult = await database.query(`
      SELECT * FROM dividends
      WHERE company_id = $1 AND dividend_type = 'regular'
      ORDER BY ex_dividend_date DESC
      LIMIT 1
    `, [companyId]);

    const priorDividend = priorDividendResult.rows[0];

    let changeAmount = null;
    let changePct = null;
    let consecutiveIncreases = 0;
    let isIncrease = false;
    let isDecrease = false;
    let isInitiation = false;

    if (priorDividend) {
      changeAmount = data.dividendAmount - priorDividend.dividend_amount;
      changePct = (changeAmount / priorDividend.dividend_amount) * 100;

      if (changeAmount > 0.001) {
        isIncrease = true;
        consecutiveIncreases = (priorDividend.consecutive_increases || 0) + 1;
      } else if (changeAmount < -0.001) {
        isDecrease = true;
        consecutiveIncreases = 0;
      } else {
        consecutiveIncreases = priorDividend.consecutive_increases || 0;
      }
    } else {
      isInitiation = true;
    }

    await database.query(`
      INSERT INTO dividends (
        company_id, declared_date, ex_dividend_date, record_date, payment_date,
        dividend_amount, dividend_type, frequency, prior_dividend,
        change_amount, change_pct, consecutive_increases,
        is_increase, is_decrease, is_initiation, is_suspension,
        source_filing, accession_number
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      ON CONFLICT(company_id, ex_dividend_date, dividend_type) DO UPDATE SET
        declared_date = excluded.declared_date,
        record_date = excluded.record_date,
        payment_date = excluded.payment_date,
        dividend_amount = excluded.dividend_amount,
        frequency = excluded.frequency,
        prior_dividend = excluded.prior_dividend,
        change_amount = excluded.change_amount,
        change_pct = excluded.change_pct,
        consecutive_increases = excluded.consecutive_increases,
        is_increase = excluded.is_increase,
        is_decrease = excluded.is_decrease,
        is_initiation = excluded.is_initiation,
        is_suspension = excluded.is_suspension
    `, [
      companyId,
      data.declaredDate,
      data.exDividendDate,
      data.recordDate,
      data.paymentDate,
      data.dividendAmount,
      data.dividendType || 'regular',
      data.frequency,
      priorDividend?.dividend_amount || null,
      changeAmount,
      changePct,
      consecutiveIncreases,
      isIncrease,
      isDecrease,
      isInitiation,
      data.isSuspension ? true : false,
      data.sourceFiling,
      data.accessionNumber
    ]);

    // Create significant event for increases, initiations, or decreases
    if (isIncrease || isInitiation || isDecrease) {
      let eventType, headline, significance, isPositive;

      if (isInitiation) {
        eventType = 'dividend_initiation';
        headline = `Dividend Initiated: $${data.dividendAmount.toFixed(4)}/share`;
        significance = 80;
        isPositive = true;
      } else if (isIncrease) {
        eventType = 'dividend_increase';
        headline = `Dividend Increased ${changePct.toFixed(1)}% to $${data.dividendAmount.toFixed(4)}/share`;
        significance = 60 + Math.min(changePct, 20); // Higher increase = more significant
        isPositive = true;
      } else {
        eventType = 'dividend_decrease';
        headline = `Dividend Cut ${Math.abs(changePct).toFixed(1)}% to $${data.dividendAmount.toFixed(4)}/share`;
        significance = 90; // Cuts are very significant
        isPositive = false;
      }

      await database.query(`
        INSERT INTO significant_events (
          company_id, event_type, event_date, headline, description,
          value, value_formatted, significance_score, is_positive,
          source_type, source_url, accession_number,
          insider_id, program_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      `, [
        companyId,
        eventType,
        data.declaredDate || data.exDividendDate,
        headline,
        consecutiveIncreases > 10
          ? `This marks ${consecutiveIncreases} consecutive years of dividend increases.`
          : null,
        data.dividendAmount,
        `$${data.dividendAmount.toFixed(4)}`,
        significance,
        isPositive,
        'dividend_data',
        null,
        data.accessionNumber,
        null,
        null
      ]);
    }
  }

  /**
   * Calculate annual dividend and yield
   */
  async getAnnualDividend(companyId, currentPrice = null) {
    const database = await getDatabaseAsync();

    const historyResult = await database.query(`
      SELECT * FROM dividends
      WHERE company_id = $1
      ORDER BY ex_dividend_date DESC
      LIMIT $2
    `, [companyId, 8]);

    const history = historyResult.rows;

    if (history.length === 0) {
      return { annualDividend: 0, dividendYield: null, frequency: null };
    }

    // Determine frequency and calculate annual amount
    const regularDividends = history.filter(d => d.dividend_type === 'regular');
    if (regularDividends.length === 0) {
      return { annualDividend: 0, dividendYield: null, frequency: null };
    }

    // Estimate frequency based on gaps
    let frequency = regularDividends[0].frequency;
    if (!frequency && regularDividends.length >= 2) {
      const gap = this.daysBetween(
        regularDividends[1].ex_dividend_date,
        regularDividends[0].ex_dividend_date
      );

      if (gap < 45) frequency = 'monthly';
      else if (gap < 100) frequency = 'quarterly';
      else if (gap < 200) frequency = 'semi-annual';
      else frequency = 'annual';
    }

    const latestAmount = regularDividends[0].dividend_amount;
    let annualDividend;

    switch (frequency) {
      case 'monthly':
        annualDividend = latestAmount * 12;
        break;
      case 'quarterly':
        annualDividend = latestAmount * 4;
        break;
      case 'semi-annual':
        annualDividend = latestAmount * 2;
        break;
      case 'annual':
      default:
        annualDividend = latestAmount;
    }

    const dividendYield = currentPrice ? (annualDividend / currentPrice) * 100 : null;

    return {
      annualDividend,
      dividendYield,
      frequency,
      latestAmount,
      consecutiveIncreases: regularDividends[0].consecutive_increases || 0
    };
  }

  // ============================================
  // CAPITAL ALLOCATION SUMMARY
  // ============================================

  /**
   * Calculate and store capital allocation summary for a quarter
   */
  async calculateCapitalSummary(companyId, fiscalQuarter, financialData, marketCap = null) {
    const database = await getDatabaseAsync();

    const {
      operatingCashFlow,
      freeCashFlow,
      dividendsPaid,
      buybacksExecuted,
      capex,
      acquisitions,
      debtRepayment,
      debtIssuance,
      revenue,
      netIncome
    } = financialData;

    // Calculate metrics
    const totalShareholderReturn = (dividendsPaid || 0) + (buybacksExecuted || 0);
    const shareholderYield = marketCap ? (totalShareholderReturn / marketCap) * 100 : null;

    const dividendPctOfFcf = freeCashFlow && freeCashFlow > 0
      ? (dividendsPaid / freeCashFlow) * 100
      : null;

    const buybackPctOfFcf = freeCashFlow && freeCashFlow > 0
      ? (buybacksExecuted / freeCashFlow) * 100
      : null;

    const capexPctOfRevenue = revenue && revenue > 0
      ? (Math.abs(capex || 0) / revenue) * 100
      : null;

    const dividendPayoutRatio = netIncome && netIncome > 0
      ? (dividendsPaid / netIncome) * 100
      : null;

    const totalPayoutRatio = netIncome && netIncome > 0
      ? (totalShareholderReturn / netIncome) * 100
      : null;

    await database.query(`
      INSERT INTO capital_allocation_summary (
        company_id, fiscal_quarter, operating_cash_flow, free_cash_flow,
        dividends_paid, buybacks_executed, capex, acquisitions,
        debt_repayment, debt_issuance,
        total_shareholder_return, shareholder_yield,
        dividend_pct_of_fcf, buyback_pct_of_fcf, capex_pct_of_revenue,
        dividend_payout_ratio, total_payout_ratio
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      ON CONFLICT(company_id, fiscal_quarter) DO UPDATE SET
        operating_cash_flow = excluded.operating_cash_flow,
        free_cash_flow = excluded.free_cash_flow,
        dividends_paid = excluded.dividends_paid,
        buybacks_executed = excluded.buybacks_executed,
        capex = excluded.capex,
        acquisitions = excluded.acquisitions,
        debt_repayment = excluded.debt_repayment,
        debt_issuance = excluded.debt_issuance,
        total_shareholder_return = excluded.total_shareholder_return,
        shareholder_yield = excluded.shareholder_yield,
        dividend_pct_of_fcf = excluded.dividend_pct_of_fcf,
        buyback_pct_of_fcf = excluded.buyback_pct_of_fcf,
        capex_pct_of_revenue = excluded.capex_pct_of_revenue,
        dividend_payout_ratio = excluded.dividend_payout_ratio,
        total_payout_ratio = excluded.total_payout_ratio,
        updated_at = CURRENT_TIMESTAMP
    `, [
      companyId,
      fiscalQuarter,
      operatingCashFlow,
      freeCashFlow,
      dividendsPaid,
      buybacksExecuted,
      capex,
      acquisitions,
      debtRepayment,
      debtIssuance,
      totalShareholderReturn,
      shareholderYield,
      dividendPctOfFcf,
      buybackPctOfFcf,
      capexPctOfRevenue,
      dividendPayoutRatio,
      totalPayoutRatio
    ]);

    return {
      totalShareholderReturn,
      shareholderYield,
      dividendPctOfFcf,
      buybackPctOfFcf,
      dividendPayoutRatio,
      totalPayoutRatio
    };
  }

  // ============================================
  // QUERY METHODS
  // ============================================

  /**
   * Get comprehensive capital allocation data for a company
   */
  async getCapitalAllocationOverview(companyId, quarters = 8) {
    const database = await getDatabaseAsync();

    const buybackProgramsResult = await database.query(`
      SELECT * FROM buyback_programs
      WHERE company_id = $1
      ORDER BY announced_date DESC
    `, [companyId]);

    const buybackActivityResult = await database.query(`
      SELECT * FROM buyback_activity
      WHERE company_id = $1
      ORDER BY fiscal_quarter DESC
      LIMIT $2
    `, [companyId, quarters]);

    const dividendHistoryResult = await database.query(`
      SELECT * FROM dividends
      WHERE company_id = $1
      ORDER BY ex_dividend_date DESC
      LIMIT $2
    `, [companyId, quarters * 3]);

    const summaryHistoryResult = await database.query(`
      SELECT * FROM capital_allocation_summary
      WHERE company_id = $1
      ORDER BY fiscal_quarter DESC
      LIMIT $2
    `, [companyId, quarters]);

    const eventsResult = await database.query(`
      SELECT se.*, c.symbol, c.name as company_name
      FROM significant_events se
      JOIN companies c ON se.company_id = c.id
      WHERE se.company_id = $1
      ORDER BY se.event_date DESC
      LIMIT $2
    `, [companyId, 20]);

    const buybackPrograms = buybackProgramsResult.rows;
    const buybackActivity = buybackActivityResult.rows;
    const dividendHistory = dividendHistoryResult.rows;
    const summaryHistory = summaryHistoryResult.rows;
    const events = eventsResult.rows;

    // Calculate TTM totals
    const ttmBuybacks = buybackActivity
      .slice(0, 4)
      .reduce((sum, q) => sum + (q.amount_spent || 0), 0);

    const regularDividends = dividendHistory.filter(d => d.dividend_type === 'regular');
    const dividendInfo = await this.getAnnualDividend(companyId);

    return {
      buybackPrograms: {
        active: buybackPrograms.filter(p => p.status === 'active'),
        completed: buybackPrograms.filter(p => p.status === 'completed'),
        totalAuthorized: buybackPrograms.reduce((sum, p) => sum + (p.authorization_amount || 0), 0)
      },
      buybackActivity: {
        quarterly: buybackActivity,
        ttmTotal: ttmBuybacks
      },
      dividends: {
        history: dividendHistory,
        ...dividendInfo
      },
      capitalAllocation: summaryHistory,
      significantEvents: events.filter(e =>
        ['buyback_announcement', 'dividend_increase', 'dividend_decrease', 'dividend_initiation']
          .includes(e.event_type)
      )
    };
  }

  /**
   * Get companies with highest shareholder yield
   */
  async getTopShareholderYield(limit = 20) {
    const database = await getDatabaseAsync();

    const result = await database.query(`
      SELECT
        c.id, c.symbol, c.name,
        cas.shareholder_yield,
        cas.dividend_pct_of_fcf,
        cas.buyback_pct_of_fcf,
        cas.total_shareholder_return,
        cas.fiscal_quarter
      FROM capital_allocation_summary cas
      JOIN companies c ON cas.company_id = c.id
      WHERE cas.fiscal_quarter = (
        SELECT MAX(fiscal_quarter) FROM capital_allocation_summary
        WHERE company_id = cas.company_id
      )
      AND cas.shareholder_yield IS NOT NULL
      ORDER BY cas.shareholder_yield DESC
      LIMIT $1
    `, [limit]);

    return result.rows;
  }

  /**
   * Get recent dividend aristocrats (companies with long increase streaks)
   */
  async getDividendAristocrats(minYears = 10) {
    const database = await getDatabaseAsync();

    const result = await database.query(`
      SELECT
        c.id, c.symbol, c.name,
        d.consecutive_increases,
        d.dividend_amount,
        d.ex_dividend_date
      FROM dividends d
      JOIN companies c ON d.company_id = c.id
      WHERE d.dividend_type = 'regular'
      AND d.consecutive_increases >= $1
      AND d.ex_dividend_date = (
        SELECT MAX(ex_dividend_date) FROM dividends
        WHERE company_id = d.company_id AND dividend_type = 'regular'
      )
      ORDER BY d.consecutive_increases DESC
    `, [minYears]);

    return result.rows;
  }

  /**
   * Get recent capital allocation events across all companies
   */
  async getRecentCapitalEvents(limit = 50) {
    const database = await getDatabaseAsync();

    const result = await database.query(`
      SELECT se.*, c.symbol, c.name as company_name
      FROM significant_events se
      JOIN companies c ON se.company_id = c.id
      ORDER BY se.event_date DESC
      LIMIT $1
    `, [limit]);

    return result.rows.filter(e =>
      ['buyback_announcement', 'dividend_increase', 'dividend_decrease',
       'dividend_initiation', 'dividend_suspension'].includes(e.event_type)
    );
  }

  // ============================================
  // UTILITY METHODS
  // ============================================

  formatCurrency(amount) {
    if (amount >= 1_000_000_000) {
      return `$${(amount / 1_000_000_000).toFixed(1)}B`;
    } else if (amount >= 1_000_000) {
      return `$${(amount / 1_000_000).toFixed(0)}M`;
    } else {
      return `$${amount.toLocaleString()}`;
    }
  }

  formatNumber(num) {
    if (num >= 1_000_000_000) {
      return `${(num / 1_000_000_000).toFixed(1)}B`;
    } else if (num >= 1_000_000) {
      return `${(num / 1_000_000).toFixed(0)}M`;
    } else {
      return num.toLocaleString();
    }
  }

  daysBetween(date1, date2) {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    return Math.abs(Math.round((d2 - d1) / (1000 * 60 * 60 * 24)));
  }
}

module.exports = CapitalAllocationTracker;

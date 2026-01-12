// src/services/xbrl/xbrlParser.js

/**
 * XBRL Parser
 *
 * Parses pre-parsed xBRL-JSON from filings.xbrl.org into normalized financials.
 * Uses IFRS concept mappings to extract standardized financial metrics.
 *
 * Key advantage: filings.xbrl.org provides PRE-PARSED JSON, so we don't need
 * to parse raw XBRL/iXBRL files!
 */

// IFRS concept to standard field mappings
// Maps IFRS taxonomy concepts to our standard database fields
const IFRS_MAPPINGS = {
  // ==========================================
  // Balance Sheet - Assets
  // ==========================================
  'ifrs-full:Assets': 'total_assets',
  'ifrs-full:CurrentAssets': 'current_assets',
  'ifrs-full:NoncurrentAssets': 'non_current_assets',
  'ifrs-full:CashAndCashEquivalents': 'cash_and_equivalents',
  'ifrs-full:Inventories': 'inventories',
  'ifrs-full:TradeAndOtherCurrentReceivables': 'trade_receivables',
  'ifrs-full:OtherCurrentFinancialAssets': 'other_current_assets',
  'ifrs-full:PropertyPlantAndEquipment': 'property_plant_equipment',
  'ifrs-full:IntangibleAssetsOtherThanGoodwill': 'intangible_assets',
  'ifrs-full:Goodwill': 'goodwill',

  // ==========================================
  // Balance Sheet - Liabilities
  // ==========================================
  'ifrs-full:Liabilities': 'total_liabilities',
  'ifrs-full:CurrentLiabilities': 'current_liabilities',
  'ifrs-full:NoncurrentLiabilities': 'non_current_liabilities',
  'ifrs-full:TradeAndOtherCurrentPayables': 'trade_payables',
  'ifrs-full:CurrentBorrowings': 'short_term_debt',
  'ifrs-full:NoncurrentBorrowings': 'long_term_debt',
  'ifrs-full:Borrowings': 'total_debt',
  'ifrs-full:CurrentProvisions': 'current_provisions',
  'ifrs-full:NoncurrentProvisions': 'non_current_provisions',

  // ==========================================
  // Balance Sheet - Equity
  // ==========================================
  'ifrs-full:Equity': 'total_equity',
  'ifrs-full:EquityAttributableToOwnersOfParent': 'total_equity',
  'ifrs-full:RetainedEarnings': 'retained_earnings',
  'ifrs-full:IssuedCapital': 'share_capital',
  'ifrs-full:SharePremium': 'share_premium',
  'ifrs-full:TreasuryShares': 'treasury_shares',
  'ifrs-full:OtherReserves': 'other_reserves',

  // ==========================================
  // Income Statement
  // ==========================================
  'ifrs-full:Revenue': 'revenue',
  'ifrs-full:RevenueFromContractsWithCustomers': 'revenue',
  'ifrs-full:CostOfSales': 'cost_of_sales',
  'ifrs-full:GrossProfit': 'gross_profit',
  'ifrs-full:DistributionCosts': 'distribution_costs',
  'ifrs-full:AdministrativeExpense': 'admin_expenses',
  'ifrs-full:OtherExpenseByFunction': 'other_expenses',
  'ifrs-full:OtherIncomeExpenseFromSubsidiariesJointlyControlledEntitiesAndAssociates': 'other_income',
  'ifrs-full:ProfitLossFromOperatingActivities': 'operating_income',
  'ifrs-full:OperatingProfitLoss': 'operating_income',
  'ifrs-full:FinanceIncome': 'interest_income',
  'ifrs-full:FinanceCosts': 'interest_expense',
  'ifrs-full:InterestExpense': 'interest_expense',
  'ifrs-full:InterestIncome': 'interest_income',
  'ifrs-full:ProfitLossBeforeTax': 'profit_before_tax',
  'ifrs-full:IncomeTaxExpenseContinuingOperations': 'income_tax_expense',
  'ifrs-full:ProfitLoss': 'net_income',
  'ifrs-full:ProfitLossAttributableToOwnersOfParent': 'net_income',
  'ifrs-full:BasicEarningsLossPerShare': 'eps_basic',
  'ifrs-full:DilutedEarningsLossPerShare': 'eps_diluted',
  'ifrs-full:NumberOfSharesOutstanding': 'shares_outstanding',
  'ifrs-full:DividendsPerShare': 'dividends_per_share',

  // EBITDA components - multiple naming conventions
  'ifrs-full:DepreciationAndAmortisationExpense': 'depreciation_amortization',
  'ifrs-full:DepreciationAmortisationAndImpairmentLossReversalOfImpairmentLossRecognisedInProfitOrLoss': 'depreciation_amortization',
  'ifrs-full:DepreciationExpense': 'depreciation',
  'ifrs-full:AmortisationExpense': 'amortization',
  'ifrs-full:ImpairmentLossRecognisedInProfitOrLoss': 'impairment_loss',
  // Also check indirect cash flow D&A add-backs
  'ifrs-full:AdjustmentsForDepreciationAndAmortisationExpense': 'depreciation_amortization',
  'ifrs-full:AdjustmentsForDepreciationExpense': 'depreciation',

  // ==========================================
  // Cash Flow Statement
  // ==========================================
  'ifrs-full:CashFlowsFromUsedInOperatingActivities': 'operating_cash_flow',
  'ifrs-full:CashFlowsFromUsedInOperatingActivitiesAbstract': 'operating_cash_flow',
  'ifrs-full:CashFlowsFromUsedInInvestingActivities': 'investing_cash_flow',
  'ifrs-full:CashFlowsFromUsedInFinancingActivities': 'financing_cash_flow',
  'ifrs-full:PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities': 'capital_expenditure',
  'ifrs-full:AcquisitionOfPropertyPlantAndEquipment': 'capital_expenditure',
  'ifrs-full:DividendsPaid': 'dividends_paid',
  'ifrs-full:DividendsPaidClassifiedAsFinancingActivities': 'dividends_paid',
  'ifrs-full:PaymentsToAcquireOrRedeemEntitysShares': 'share_repurchases',
  'ifrs-full:ProceedsFromBorrowingsClassifiedAsFinancingActivities': 'debt_proceeds',
  'ifrs-full:RepaymentsOfBorrowingsClassifiedAsFinancingActivities': 'debt_repayments',
};

// UK GAAP / FRS 102 mappings (for smaller UK companies)
const UK_GAAP_MAPPINGS = {
  'uk-bus:TurnoverRevenue': 'revenue',
  'uk-bus:GrossProfit': 'gross_profit',
  'uk-bus:OperatingProfit': 'operating_income',
  'uk-bus:ProfitLossOnOrdinaryActivitiesBeforeTax': 'profit_before_tax',
  'uk-bus:TaxOnProfitOnOrdinaryActivities': 'income_tax_expense',
  'uk-bus:ProfitLoss': 'net_income',
  'uk-bus:FixedAssets': 'non_current_assets',
  'uk-bus:CurrentAssets': 'current_assets',
  'uk-bus:CashBank': 'cash_and_equivalents',
  'uk-bus:Debtors': 'trade_receivables',
  'uk-bus:Stocks': 'inventories',
  'uk-bus:Creditors': 'total_liabilities',
  'uk-bus:CreditorsDueWithinOneYear': 'current_liabilities',
  'uk-bus:CreditorsDueAfterOneYear': 'non_current_liabilities',
  'uk-bus:TotalShareholdersEquity': 'total_equity',
  'uk-bus:ShareCapital': 'share_capital',
  'uk-bus:RetainedEarningsAccumulatedLosses': 'retained_earnings',
};

class XBRLParser {
  constructor(config = {}) {
    this.ifrsMapping = { ...IFRS_MAPPINGS, ...config.additionalMappings };
    this.ukGaapMapping = UK_GAAP_MAPPINGS;
    this.strictMode = config.strictMode || false;

    console.log('✅ XBRLParser initialized');
  }

  /**
   * Parse xBRL-JSON into normalized financial metrics
   * @param {Object} xbrlJson - Pre-parsed xBRL-JSON from filings.xbrl.org
   * @returns {Object} - Normalized financial data with periods
   */
  parseXBRLJson(xbrlJson) {
    if (!xbrlJson) {
      throw new Error('xBRL-JSON data is required');
    }

    const result = {
      entity: this._extractEntityInfo(xbrlJson),
      periods: {},
      rawFacts: {},
      parseWarnings: [],
      parseStats: {
        totalFacts: 0,
        mappedFacts: 0,
        unmappedFacts: 0
      }
    };

    // Extract facts from xBRL-JSON structure
    const facts = xbrlJson.facts || xbrlJson.factSet?.facts || {};

    // Handle filings.xbrl.org format: facts keyed by ID (fact-1, fact-2, etc.)
    // with concept in dimensions.concept
    if (typeof facts === 'object' && !Array.isArray(facts)) {
      for (const [factId, factData] of Object.entries(facts)) {
        // Check if this is the filings.xbrl.org format (concept in dimensions)
        if (factData.dimensions && factData.dimensions.concept) {
          const concept = factData.dimensions.concept;
          this._processFactWithDimensions(concept, factData, result);
        } else if (factId.includes(':')) {
          // Old format: factId is the concept
          this._processFact(factId, factData, result);
        } else if (Array.isArray(factData)) {
          // Array of values for a concept
          for (const item of factData) {
            if (item.dimensions?.concept) {
              this._processFactWithDimensions(item.dimensions.concept, item, result);
            }
          }
        }
      }
    } else if (Array.isArray(facts)) {
      // Array format
      for (const fact of facts) {
        const concept = fact.concept || fact.dimensions?.concept;
        if (concept) {
          this._processFactWithDimensions(concept, fact, result);
        }
      }
    }

    // Post-process: calculate derived metrics
    this._calculateDerivedMetrics(result);

    return result;
  }

  /**
   * Process a fact from filings.xbrl.org format (dimensions-based)
   * @private
   */
  _processFactWithDimensions(concept, factData, result) {
    result.parseStats.totalFacts++;

    // Map concept to standard field
    const standardField = this._mapConcept(concept);

    if (!standardField) {
      result.parseStats.unmappedFacts++;
      // Store unmapped facts for debugging
      if (!result.rawFacts[concept]) {
        result.rawFacts[concept] = [];
      }
      result.rawFacts[concept].push(factData);
      return;
    }

    result.parseStats.mappedFacts++;

    // Extract period from dimensions
    const period = this._extractPeriodFromDimensions(factData.dimensions);
    if (!period) return;

    const periodKey = period.endDate || period.instant;
    if (!periodKey) return;

    // Initialize period if needed
    if (!result.periods[periodKey]) {
      result.periods[periodKey] = {
        endDate: periodKey,
        startDate: period.startDate,
        periodType: this._determinePeriodType(period),
        metrics: {},
        currency: null
      };
    }

    // Extract and store value
    const value = this._parseValue(factData);
    if (value !== null) {
      // Check for extra dimensions (segment, member) - prefer primary/consolidated
      const hasExtraDimensions = this._hasNonStandardDimensions(factData.dimensions);
      const existing = result.periods[periodKey].metrics[standardField];

      // Only overwrite if we don't have a value, or if this has fewer dimensions
      if (existing === undefined || !hasExtraDimensions) {
        result.periods[periodKey].metrics[standardField] = value;
      }

      // Store currency if available
      if (factData.dimensions?.unit) {
        result.periods[periodKey].currency = this._extractCurrencyFromUnit(factData.dimensions.unit);
      }
    }
  }

  /**
   * Check if fact has non-standard dimensions (segments, members)
   * @private
   */
  _hasNonStandardDimensions(dimensions) {
    if (!dimensions) return false;
    const standardKeys = ['concept', 'entity', 'period', 'unit', 'language'];
    return Object.keys(dimensions).some(k => !standardKeys.includes(k));
  }

  /**
   * Extract period from dimensions object
   * @private
   */
  _extractPeriodFromDimensions(dimensions) {
    if (!dimensions?.period) return null;

    const periodStr = dimensions.period;

    // Handle instant format: "2022-03-31T00:00:00"
    if (!periodStr.includes('/')) {
      return { instant: periodStr.split('T')[0] };
    }

    // Handle duration format: "2021-04-01T00:00:00/2022-04-01T00:00:00"
    const [start, end] = periodStr.split('/');
    return {
      startDate: start.split('T')[0],
      endDate: end.split('T')[0]
    };
  }

  /**
   * Extract currency from unit dimension
   * @private
   */
  _extractCurrencyFromUnit(unit) {
    if (!unit) return null;
    // Format: "iso4217:GBP" or just "GBP"
    if (unit.includes(':')) {
      return unit.split(':')[1];
    }
    return unit.length === 3 ? unit : null;
  }

  /**
   * Process a single fact and add to result
   * @private
   */
  _processFact(concept, factData, result) {
    result.parseStats.totalFacts++;

    // Map concept to standard field
    const standardField = this._mapConcept(concept);

    if (!standardField) {
      result.parseStats.unmappedFacts++;
      // Store unmapped facts for debugging
      if (!result.rawFacts[concept]) {
        result.rawFacts[concept] = [];
      }
      result.rawFacts[concept].push(factData);
      return;
    }

    result.parseStats.mappedFacts++;

    // Handle multiple values per concept (different periods, dimensions)
    const values = Array.isArray(factData) ? factData : [factData];

    for (const valueData of values) {
      const period = this._extractPeriod(valueData);
      if (!period) continue;

      const periodKey = period.endDate || period.instant;
      if (!periodKey) continue;

      // Initialize period if needed
      if (!result.periods[periodKey]) {
        result.periods[periodKey] = {
          endDate: periodKey,
          startDate: period.startDate,
          periodType: this._determinePeriodType(period),
          metrics: {}
        };
      }

      // Extract and store value
      const value = this._parseValue(valueData);
      if (value !== null) {
        // Only overwrite if we don't have a value, or if this is a primary dimension
        const existing = result.periods[periodKey].metrics[standardField];
        if (existing === undefined || !this._hasDimensions(valueData)) {
          result.periods[periodKey].metrics[standardField] = value;

          // Store currency if available
          if (valueData.unit || valueData.unitRef) {
            result.periods[periodKey].currency = this._extractCurrency(valueData);
          }
        }
      }
    }
  }

  /**
   * Map XBRL concept to standard field name
   * @private
   */
  _mapConcept(concept) {
    // Try IFRS mapping first
    if (this.ifrsMapping[concept]) {
      return this.ifrsMapping[concept];
    }

    // Try UK GAAP mapping
    if (this.ukGaapMapping[concept]) {
      return this.ukGaapMapping[concept];
    }

    // Try without namespace prefix
    const withoutPrefix = concept.split(':').pop();
    for (const [key, value] of Object.entries(this.ifrsMapping)) {
      if (key.endsWith(`:${withoutPrefix}`)) {
        return value;
      }
    }

    return null;
  }

  /**
   * Extract period information from fact data
   * @private
   */
  _extractPeriod(factData) {
    // Direct period property
    if (factData.period) {
      return {
        startDate: factData.period.startDate || factData.period.start,
        endDate: factData.period.endDate || factData.period.end,
        instant: factData.period.instant
      };
    }

    // Period reference
    if (factData.periodRef || factData.contextRef) {
      // Would need context lookup - simplified for now
      return null;
    }

    // Inline period dates
    if (factData.startDate || factData.endDate || factData.instant) {
      return {
        startDate: factData.startDate,
        endDate: factData.endDate,
        instant: factData.instant
      };
    }

    return null;
  }

  /**
   * Determine if period is annual, quarterly, etc.
   * @private
   */
  _determinePeriodType(period) {
    if (period.instant) {
      return 'instant';
    }

    if (!period.startDate || !period.endDate) {
      return 'unknown';
    }

    const start = new Date(period.startDate);
    const end = new Date(period.endDate);
    const days = Math.round((end - start) / (1000 * 60 * 60 * 24));

    if (days >= 360 && days <= 370) return 'annual';
    if (days >= 180 && days <= 185) return 'semi-annual';
    if (days >= 89 && days <= 92) return 'quarterly';
    if (days >= 28 && days <= 31) return 'monthly';

    return 'other';
  }

  /**
   * Parse value from fact data
   * @private
   */
  _parseValue(factData) {
    let value = factData.value ?? factData.numericValue ?? factData.v;

    if (value === null || value === undefined || value === '') {
      return null;
    }

    // Handle string values
    if (typeof value === 'string') {
      // Remove thousand separators and convert
      value = value.replace(/,/g, '').replace(/\s/g, '');

      // Check for parentheses (negative)
      if (value.startsWith('(') && value.endsWith(')')) {
        value = '-' + value.slice(1, -1);
      }

      value = parseFloat(value);
    }

    // Apply scale/decimals if present
    const decimals = factData.decimals ?? factData.scale;
    if (decimals !== undefined && decimals !== null) {
      // Positive decimals = divide, negative = multiply
      // Actually in XBRL, decimals indicates precision, scale indicates multiplier
      if (factData.scale !== undefined) {
        value = value * Math.pow(10, parseInt(factData.scale, 10));
      }
    }

    return isNaN(value) ? null : value;
  }

  /**
   * Check if fact has dimensional qualifiers
   * @private
   */
  _hasDimensions(factData) {
    return factData.dimensions && Object.keys(factData.dimensions).length > 0;
  }

  /**
   * Extract currency from fact data
   * @private
   */
  _extractCurrency(factData) {
    const unit = factData.unit || factData.unitRef || '';

    // Common patterns
    if (unit.includes('EUR') || unit.includes('euro')) return 'EUR';
    if (unit.includes('GBP') || unit.includes('pound')) return 'GBP';
    if (unit.includes('USD') || unit.includes('dollar')) return 'USD';
    if (unit.includes('CHF')) return 'CHF';

    // ISO 4217 pattern
    const isoMatch = unit.match(/iso4217:(\w{3})/i);
    if (isoMatch) return isoMatch[1].toUpperCase();

    return unit.slice(0, 3).toUpperCase() || 'EUR';
  }

  /**
   * Extract entity information from xBRL-JSON
   * @private
   */
  _extractEntityInfo(xbrlJson) {
    const entity = xbrlJson.entity || xbrlJson.documentInfo?.entity || {};
    const documentInfo = xbrlJson.documentInfo || {};

    return {
      lei: entity.lei || entity.identifier,
      name: entity.name || documentInfo.entityName,
      scheme: entity.scheme || 'lei',
      country: documentInfo.country
    };
  }

  /**
   * Calculate derived metrics from parsed data
   * @private
   */
  _calculateDerivedMetrics(result) {
    for (const [periodKey, periodData] of Object.entries(result.periods)) {
      const m = periodData.metrics;

      // Calculate total D&A from components if not directly available
      if (!m.depreciation_amortization) {
        const depreciation = m.depreciation || 0;
        const amortization = m.amortization || 0;
        if (depreciation || amortization) {
          m.depreciation_amortization = depreciation + amortization;
        }
      }

      // Calculate EBITDA with multiple fallback strategies
      if (!m.ebitda) {
        // Strategy 1: Operating Income + D&A
        if (m.operating_income && m.depreciation_amortization) {
          m.ebitda = m.operating_income + Math.abs(m.depreciation_amortization);
        }
        // Strategy 2: Profit Before Tax + Interest + D&A (approximation)
        else if (m.profit_before_tax && m.interest_expense && m.depreciation_amortization) {
          m.ebitda = m.profit_before_tax + Math.abs(m.interest_expense) + Math.abs(m.depreciation_amortization);
        }
        // Strategy 3: Net Income + Tax + Interest + D&A
        else if (m.net_income && m.income_tax_expense && m.interest_expense && m.depreciation_amortization) {
          m.ebitda = m.net_income + Math.abs(m.income_tax_expense) + Math.abs(m.interest_expense) + Math.abs(m.depreciation_amortization);
        }
      }

      // Free Cash Flow
      if (!m.free_cash_flow && m.operating_cash_flow !== undefined && m.capital_expenditure !== undefined) {
        m.free_cash_flow = m.operating_cash_flow - Math.abs(m.capital_expenditure);
      }

      // Total Debt if not directly available
      if (!m.total_debt && (m.short_term_debt || m.long_term_debt)) {
        m.total_debt = (m.short_term_debt || 0) + (m.long_term_debt || 0);
      }

      // Gross Profit if not directly available
      if (!m.gross_profit && m.revenue && m.cost_of_sales) {
        m.gross_profit = m.revenue - Math.abs(m.cost_of_sales);
      }

      // === Ratios ===

      // Margin ratios
      if (m.revenue && m.revenue !== 0) {
        if (m.gross_profit !== undefined && !m.gross_margin) {
          m.gross_margin = m.gross_profit / m.revenue;
        }
        if (m.operating_income !== undefined && !m.operating_margin) {
          m.operating_margin = m.operating_income / m.revenue;
        }
        if (m.net_income !== undefined && !m.net_margin) {
          m.net_margin = m.net_income / m.revenue;
        }
      }

      // Return ratios
      if (m.net_income !== undefined) {
        if (m.total_equity && m.total_equity !== 0 && !m.roe) {
          m.roe = m.net_income / m.total_equity;
        }
        if (m.total_assets && m.total_assets !== 0 && !m.roa) {
          m.roa = m.net_income / m.total_assets;
        }
      }

      // ROIC = NOPAT / Invested Capital
      if (m.operating_income !== undefined && m.income_tax_expense !== undefined) {
        const taxRate = m.profit_before_tax && m.profit_before_tax !== 0
          ? Math.abs(m.income_tax_expense) / m.profit_before_tax
          : 0.25; // Assume 25% if can't calculate
        const nopat = m.operating_income * (1 - taxRate);
        const investedCapital = (m.total_equity || 0) + (m.total_debt || 0) - (m.cash_and_equivalents || 0);
        if (investedCapital !== 0 && !m.roic) {
          m.roic = nopat / investedCapital;
        }
      }

      // Liquidity ratios
      if (m.current_liabilities && m.current_liabilities !== 0) {
        if (m.current_assets !== undefined && !m.current_ratio) {
          m.current_ratio = m.current_assets / m.current_liabilities;
        }
        if (m.current_assets !== undefined && m.inventories !== undefined && !m.quick_ratio) {
          m.quick_ratio = (m.current_assets - (m.inventories || 0)) / m.current_liabilities;
        }
      }

      // Leverage ratios
      if (m.total_debt !== undefined) {
        if (m.total_equity && m.total_equity !== 0 && !m.debt_to_equity) {
          m.debt_to_equity = m.total_debt / m.total_equity;
        }
        if (m.total_assets && m.total_assets !== 0 && !m.debt_to_assets) {
          m.debt_to_assets = m.total_debt / m.total_assets;
        }
      }

      // Interest coverage
      if (m.operating_income !== undefined && m.interest_expense && m.interest_expense !== 0) {
        if (!m.interest_coverage) {
          m.interest_coverage = m.operating_income / Math.abs(m.interest_expense);
        }
      }

      // Activity ratios
      if (m.revenue && m.total_assets && m.total_assets !== 0 && !m.asset_turnover) {
        m.asset_turnover = m.revenue / m.total_assets;
      }
      if (m.cost_of_sales && m.inventories && m.inventories !== 0 && !m.inventory_turnover) {
        m.inventory_turnover = Math.abs(m.cost_of_sales) / m.inventories;
      }
    }
  }

  /**
   * Get the most recent annual period from parsed data
   * @param {Object} parsedData - Output from parseXBRLJson
   * @returns {Object|null} - Most recent annual period data
   */
  getMostRecentAnnual(parsedData) {
    const annualPeriods = Object.entries(parsedData.periods)
      .filter(([_, data]) => data.periodType === 'annual')
      .sort(([a], [b]) => b.localeCompare(a));

    if (annualPeriods.length === 0) {
      // Fall back to any period if no annual found
      const allPeriods = Object.entries(parsedData.periods)
        .sort(([a], [b]) => b.localeCompare(a));
      return allPeriods.length > 0 ? { period: allPeriods[0][0], ...allPeriods[0][1] } : null;
    }

    return { period: annualPeriods[0][0], ...annualPeriods[0][1] };
  }

  /**
   * Convert parsed data to flat database record format
   * @param {Object} parsedData - Output from parseXBRLJson
   * @param {string} periodKey - Specific period to extract (optional, defaults to most recent)
   * @returns {Object} - Flat object ready for database insertion
   */
  toFlatRecord(parsedData, periodKey = null) {
    let periodData;

    if (periodKey && parsedData.periods[periodKey]) {
      periodData = parsedData.periods[periodKey];
    } else {
      const recent = this.getMostRecentAnnual(parsedData);
      if (!recent) return null;
      periodData = recent;
      periodKey = recent.period;
    }

    const m = periodData.metrics;

    return {
      period_end: periodKey,
      period_type: periodData.periodType,
      currency: periodData.currency || 'EUR',

      // Balance Sheet
      total_assets: m.total_assets || null,
      current_assets: m.current_assets || null,
      non_current_assets: m.non_current_assets || null,
      cash_and_equivalents: m.cash_and_equivalents || null,
      inventories: m.inventories || null,
      trade_receivables: m.trade_receivables || null,
      total_liabilities: m.total_liabilities || null,
      current_liabilities: m.current_liabilities || null,
      non_current_liabilities: m.non_current_liabilities || null,
      trade_payables: m.trade_payables || null,
      total_debt: m.total_debt || null,
      short_term_debt: m.short_term_debt || null,
      long_term_debt: m.long_term_debt || null,
      total_equity: m.total_equity || null,
      retained_earnings: m.retained_earnings || null,
      share_capital: m.share_capital || null,

      // Income Statement
      revenue: m.revenue || null,
      cost_of_sales: m.cost_of_sales || null,
      gross_profit: m.gross_profit || null,
      operating_income: m.operating_income || null,
      ebitda: m.ebitda || null,
      interest_expense: m.interest_expense || null,
      interest_income: m.interest_income || null,
      profit_before_tax: m.profit_before_tax || null,
      income_tax_expense: m.income_tax_expense || null,
      net_income: m.net_income || null,
      eps_basic: m.eps_basic || null,
      eps_diluted: m.eps_diluted || null,
      shares_outstanding: m.shares_outstanding || null,
      dividends_per_share: m.dividends_per_share || null,

      // Cash Flow
      operating_cash_flow: m.operating_cash_flow || null,
      investing_cash_flow: m.investing_cash_flow || null,
      financing_cash_flow: m.financing_cash_flow || null,
      capital_expenditure: m.capital_expenditure || null,
      depreciation_amortization: m.depreciation_amortization || null,
      free_cash_flow: m.free_cash_flow || null,
      dividends_paid: m.dividends_paid || null,
      share_repurchases: m.share_repurchases || null,

      // Ratios
      gross_margin: m.gross_margin || null,
      operating_margin: m.operating_margin || null,
      net_margin: m.net_margin || null,
      roe: m.roe || null,
      roa: m.roa || null,
      roic: m.roic || null,
      current_ratio: m.current_ratio || null,
      quick_ratio: m.quick_ratio || null,
      debt_to_equity: m.debt_to_equity || null,
      debt_to_assets: m.debt_to_assets || null,
      interest_coverage: m.interest_coverage || null,
      asset_turnover: m.asset_turnover || null,
      inventory_turnover: m.inventory_turnover || null
    };
  }
}

module.exports = { XBRLParser, IFRS_MAPPINGS, UK_GAAP_MAPPINGS };

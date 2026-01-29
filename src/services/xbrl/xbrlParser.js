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

  // Borrowings - Standard concepts
  'ifrs-full:CurrentBorrowings': 'short_term_debt',
  'ifrs-full:NoncurrentBorrowings': 'long_term_debt',
  'ifrs-full:Borrowings': 'total_debt',

  // Alternative debt aggregates
  'ifrs-full:FinancialLiabilities': 'total_financial_liabilities',
  'ifrs-full:LoansAndBorrowings': 'total_debt',

  // Other financial liabilities (catch-all for non-standard debt)
  'ifrs-full:OtherFinancialLiabilities': 'other_debt',
  'ifrs-full:OtherCurrentFinancialLiabilities': 'short_term_debt',
  'ifrs-full:OtherNoncurrentFinancialLiabilities': 'long_term_debt',

  // IFRS 16 Lease Liabilities (critical for post-2019 filings)
  'ifrs-full:LeaseLiabilities': 'lease_liabilities',
  'ifrs-full:CurrentLeaseLiabilities': 'short_term_debt',
  'ifrs-full:NoncurrentLeaseLiabilities': 'long_term_debt',

  // Alternative lease naming
  'ifrs-full:LeaseObligations': 'lease_liabilities',
  'ifrs-full:CurrentLeaseObligation': 'short_term_debt',
  'ifrs-full:NoncurrentLeaseObligation': 'long_term_debt',

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

  // Bank/Financial Institution Revenue Alternatives
  // Banks don't report "revenue" - they use interest income and fee income
  'ifrs-full:InterestIncomeExpenseNet': 'net_interest_income',
  'ifrs-full:NetInterestIncome': 'net_interest_income',
  'ifrs-full:InterestRevenueCalculatedUsingEffectiveInterestMethod': 'interest_revenue',
  'ifrs-full:FeeAndCommissionIncome': 'fee_income',
  'ifrs-full:NetFeeAndCommissionIncome': 'net_fee_income',
  'ifrs-full:TradingIncome': 'trading_income',
  'ifrs-full:NetTradingIncome': 'trading_income',

  // Insurance Company Revenue
  'ifrs-full:InsuranceServiceResult': 'insurance_service_result',
  'ifrs-full:InsuranceRevenue': 'insurance_revenue',
  'ifrs-full:PremiumsWrittenNet': 'premiums_written',
  'ifrs-full:GrossInsuranceContractLiabilitiesForRemainingCoverage': 'insurance_liabilities',

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

  // Shares Outstanding - Multiple variants
  'ifrs-full:NumberOfSharesOutstanding': 'shares_outstanding',
  'ifrs-full:WeightedAverageNumberOfSharesOutstandingBasic': 'shares_outstanding',
  'ifrs-full:WeightedAverageNumberOfSharesOutstandingDiluted': 'diluted_shares_outstanding',
  'ifrs-full:SharesIssued': 'shares_issued',
  'ifrs-full:NumberOfIssuedShares': 'shares_issued',
  'ifrs-full:SharesInTreasury': 'treasury_shares',

  'ifrs-full:DividendsPerShare': 'dividends_per_share',

  // EBITDA components - multiple naming conventions
  'ifrs-full:DepreciationAndAmortisationExpense': 'depreciation_amortization',
  'ifrs-full:DepreciationAmortisationAndImpairmentLossReversalOfImpairmentLossRecognisedInProfitOrLoss': 'depreciation_amortization',

  // US spelling variants (some European companies use US IFRS)
  'ifrs-full:DepreciationAndAmortizationExpense': 'depreciation_amortization',

  // Separate D&A components
  'ifrs-full:DepreciationExpense': 'depreciation',
  'ifrs-full:AmortisationExpense': 'amortization',

  // Specific asset class depreciation
  'ifrs-full:DepreciationOfPropertyPlantAndEquipment': 'depreciation',
  'ifrs-full:DepreciationPropertyPlantAndEquipment': 'depreciation',

  // Intangible amortization specifics
  'ifrs-full:AmortisationOfIntangibleAssets': 'amortization',
  'ifrs-full:AmortizationOfIntangibleAssets': 'amortization',

  // Impairment
  'ifrs-full:ImpairmentLossRecognisedInProfitOrLoss': 'impairment_loss',

  // Cash flow statement variants (D&A add-backs in indirect method)
  'ifrs-full:AdjustmentsForDepreciationAndAmortisationExpense': 'depreciation_amortization',
  'ifrs-full:AdjustmentsForDepreciationExpense': 'depreciation',
  'ifrs-full:AdjustmentsForAmortisationExpense': 'amortization',
  'ifrs-full:ChargesAgainstDepreciationAndAmortizationExpense': 'depreciation_amortization',

  // ==========================================
  // Cash Flow Statement
  // ==========================================
  'ifrs-full:CashFlowsFromUsedInOperatingActivities': 'operating_cash_flow',
  'ifrs-full:CashFlowsFromUsedInOperatingActivitiesAbstract': 'operating_cash_flow',
  'ifrs-full:CashFlowsFromUsedInInvestingActivities': 'investing_cash_flow',
  'ifrs-full:CashFlowsFromUsedInFinancingActivities': 'financing_cash_flow',
  'ifrs-full:PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities': 'capital_expenditure',
  'ifrs-full:AcquisitionOfPropertyPlantAndEquipment': 'capital_expenditure',
  // Additional CapEx variants used in EU filings
  'ifrs-full:AdditionsToPropertyPlantAndEquipment': 'capital_expenditure',
  'ifrs-full:IncreaseThroughPurchasePropertyPlantAndEquipment': 'capital_expenditure',
  'ifrs-full:PaymentsForPropertyPlantAndEquipment': 'capital_expenditure',
  'ifrs-full:PaymentsToAcquirePropertyPlantAndEquipment': 'capital_expenditure',
  // Intangible additions (for total CapEx calculation)
  'ifrs-full:AdditionsToIntangibleAssetsOtherThanGoodwill': 'intangible_additions',
  'ifrs-full:PurchaseOfIntangibleAssetsClassifiedAsInvestingActivities': 'intangible_additions',

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
   * Enhanced to better detect semi-annual/interim reporting periods
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

    // Annual: 360-375 days (~12 months, allowing for leap years and fiscal year variations)
    if (days >= 360 && days <= 375) return 'annual';

    // Semi-annual: 170-195 days (~5.5-6.5 months)
    // Expanded range to capture more interim reporting periods:
    // - Jan 1 - Jun 30 = 181 days (standard H1)
    // - Jan 1 - Jul 31 = 212 days (some companies)
    // - Feb 1 - Jul 31 = 181 days
    // - Fiscal half-years may not align with calendar
    if (days >= 170 && days <= 195) return 'semi-annual';

    // Quarterly: 85-95 days (~3 months)
    // Expanded from 89-92 to capture more variations
    if (days >= 85 && days <= 95) return 'quarterly';

    // Monthly: 28-31 days
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

      // Free Cash Flow - Multiple calculation strategies
      if (!m.free_cash_flow) {
        // Strategy 1: OCF - CapEx (standard formula)
        if (m.operating_cash_flow !== undefined && m.capital_expenditure !== undefined) {
          m.free_cash_flow = m.operating_cash_flow - Math.abs(m.capital_expenditure);
        }
        // Strategy 2: OCF + ICF (ICF is typically negative, includes CapEx + acquisitions)
        // This is a reasonable proxy when CapEx is not separately reported
        // Most large EU companies report OCF and ICF but not CapEx separately
        else if (m.operating_cash_flow !== undefined && m.investing_cash_flow !== undefined) {
          m.free_cash_flow = m.operating_cash_flow + m.investing_cash_flow;
        }
      }

      // Total Debt - Enhanced calculation with multiple fallbacks
      if (!m.total_debt) {
        // Method 1: Sum short-term + long-term debt + lease liabilities (IFRS 16)
        if (m.short_term_debt || m.long_term_debt || m.lease_liabilities) {
          m.total_debt = (m.short_term_debt || 0) + (m.long_term_debt || 0) + (m.lease_liabilities || 0);
        }
        // Method 2: Use total_financial_liabilities as fallback
        else if (m.total_financial_liabilities) {
          m.total_debt = m.total_financial_liabilities;
        }
        // Method 3: Use other_debt as last resort
        else if (m.other_debt) {
          m.total_debt = m.other_debt;
        }
      }

      // Also add lease liabilities to existing total_debt if not already included
      if (m.total_debt && m.lease_liabilities && !m.long_term_debt && !m.short_term_debt) {
        // If we only have total_debt directly but also have separate lease liabilities, add them
        m.total_debt = m.total_debt + m.lease_liabilities;
      }

      // Total Assets - Derive from components if not directly available
      if (!m.total_assets) {
        // Method 1: Sum current + non-current assets
        if (m.current_assets || m.non_current_assets) {
          m.total_assets = (m.current_assets || 0) + (m.non_current_assets || 0);
        }
        // Method 2: Calculate from equity + liabilities (accounting equation)
        else if (m.total_equity && m.total_liabilities) {
          m.total_assets = m.total_equity + m.total_liabilities;
        }
      }

      // Total Liabilities - Derive from components if not directly available
      if (!m.total_liabilities) {
        // Method 1: Sum current + non-current liabilities
        if (m.current_liabilities || m.non_current_liabilities) {
          m.total_liabilities = (m.current_liabilities || 0) + (m.non_current_liabilities || 0);
        }
        // Method 2: Calculate from total_assets - total_equity
        else if (m.total_assets && m.total_equity) {
          m.total_liabilities = m.total_assets - m.total_equity;
        }
      }

      // Gross Profit if not directly available
      if (!m.gross_profit && m.revenue && m.cost_of_sales) {
        m.gross_profit = m.revenue - Math.abs(m.cost_of_sales);
      }

      // Shares Outstanding - Enhanced calculation
      if (!m.shares_outstanding) {
        // Method 1: Calculate from issued shares - treasury shares
        if (m.shares_issued && m.treasury_shares) {
          m.shares_outstanding = m.shares_issued - m.treasury_shares;
        }
        // Method 2: Use shares_issued directly if no treasury shares specified
        else if (m.shares_issued) {
          m.shares_outstanding = m.shares_issued;
        }
      }

      // === Bank/Financial Revenue Derivation ===
      // Banks don't report "revenue" - derive from income components
      if (!m.revenue) {
        // Method 1: Net Interest Income + Fee Income (most common for banks)
        if (m.net_interest_income || m.fee_income || m.trading_income) {
          m.revenue = (m.net_interest_income || 0) +
                      (m.fee_income || m.net_fee_income || 0) +
                      (m.trading_income || 0);
          m._revenue_derived_from = 'bank_income';
        }
        // Method 2: Interest Revenue (for simpler financial companies)
        else if (m.interest_revenue) {
          m.revenue = m.interest_revenue;
          m._revenue_derived_from = 'interest_revenue';
        }
        // Method 3: Insurance Revenue/Premiums
        else if (m.insurance_revenue || m.premiums_written) {
          m.revenue = m.insurance_revenue || m.premiums_written;
          m._revenue_derived_from = 'insurance';
        }
      }

      // === Operating Income Derivation ===
      if (!m.operating_income) {
        // Method 1: Profit Before Tax + Interest Expense (excludes financing costs)
        if (m.profit_before_tax !== undefined && m.interest_expense) {
          m.operating_income = m.profit_before_tax + Math.abs(m.interest_expense);
          m._op_income_derived = true;
        }
        // Method 2: Net Income + Tax + Interest (work backwards from bottom line)
        else if (m.net_income !== undefined && m.income_tax_expense && m.interest_expense) {
          m.operating_income = m.net_income +
                               Math.abs(m.income_tax_expense) +
                               Math.abs(m.interest_expense);
          m._op_income_derived = true;
        }
        // Method 3: Revenue - Cost of Sales - Operating Expenses
        else if (m.revenue && m.cost_of_sales && (m.distribution_costs || m.admin_expenses)) {
          const opex = (m.distribution_costs || 0) + (m.admin_expenses || 0) + (m.other_expenses || 0);
          m.operating_income = m.revenue - Math.abs(m.cost_of_sales) - opex;
          m._op_income_derived = true;
        }
      }

      // === Ratios ===

      // Margin ratios with bounds clamping (50x average threshold = ±500%)
      // Average margin is ~10%, so 50x = 500% (5.0 as decimal) is physically impossible
      const MARGIN_BOUNDS = { min: -5, max: 5 }; // ±500% as decimal

      if (m.revenue && m.revenue !== 0) {
        if (m.gross_profit !== undefined && !m.gross_margin) {
          const rawGrossMargin = m.gross_profit / m.revenue;
          m.gross_margin = Math.max(0, Math.min(1, rawGrossMargin)); // 0-100%
        }
        if (m.operating_income !== undefined && !m.operating_margin) {
          const rawOpMargin = m.operating_income / m.revenue;
          m.operating_margin = Math.max(MARGIN_BOUNDS.min, Math.min(MARGIN_BOUNDS.max, rawOpMargin));
        }
        if (m.net_income !== undefined && !m.net_margin) {
          const rawNetMargin = m.net_income / m.revenue;
          m.net_margin = Math.max(MARGIN_BOUNDS.min, Math.min(MARGIN_BOUNDS.max, rawNetMargin));
        }
      }

      // Return ratios with bounds clamping (no minimum thresholds - preserves small-cap data)
      // Bounds prevent extreme values from division edge cases
      const ROE_BOUNDS = { min: -2, max: 3 }; // -200% to 300% as decimal
      const ROA_BOUNDS = { min: -1, max: 1 }; // -100% to 100% as decimal

      if (m.net_income !== undefined) {
        if (m.total_equity && m.total_equity !== 0 && !m.roe) {
          const rawRoe = m.net_income / m.total_equity;
          m.roe = Math.max(ROE_BOUNDS.min, Math.min(ROE_BOUNDS.max, rawRoe));
        }
        if (m.total_assets && m.total_assets !== 0 && !m.roa) {
          const rawRoa = m.net_income / m.total_assets;
          m.roa = Math.max(ROA_BOUNDS.min, Math.min(ROA_BOUNDS.max, rawRoa));
        }
      }

      // ROIC = NOPAT / Invested Capital
      // Bounds clamping prevents extreme values from division edge cases
      const ROIC_BOUNDS = { min: -2, max: 3 }; // -200% to 300% as decimal

      if (m.operating_income !== undefined && m.income_tax_expense !== undefined) {
        const taxRate = m.profit_before_tax && m.profit_before_tax !== 0
          ? Math.abs(m.income_tax_expense) / m.profit_before_tax
          : 0.25; // Assume 25% if can't calculate
        const nopat = m.operating_income * (1 - taxRate);
        const investedCapital = (m.total_equity || 0) + (m.total_debt || 0) - (m.cash_and_equivalents || 0);

        if (investedCapital !== 0 && !m.roic) {
          const rawRoic = nopat / investedCapital;
          // Clamp to reasonable bounds (-200% to 300%)
          m.roic = Math.max(ROIC_BOUNDS.min, Math.min(ROIC_BOUNDS.max, rawRoic));
        }
      }

      // ROCE = Operating Income / Capital Employed
      // Capital Employed = Total Assets - Current Liabilities
      const ROCE_BOUNDS = { min: -2, max: 3 }; // -200% to 300% as decimal

      if (!m.roce && m.operating_income !== undefined && m.total_assets && m.current_liabilities) {
        const capitalEmployed = m.total_assets - m.current_liabilities;
        if (capitalEmployed !== 0) {
          const rawRoce = m.operating_income / capitalEmployed;
          m.roce = Math.max(ROCE_BOUNDS.min, Math.min(ROCE_BOUNDS.max, rawRoce));
        }
      }

      // DuPont Analysis Components
      // Equity Multiplier = Total Assets / Total Equity
      if (!m.equity_multiplier && m.total_assets && m.total_equity && m.total_equity !== 0) {
        m.equity_multiplier = m.total_assets / m.total_equity;
      }

      // DuPont ROE = Net Margin × Asset Turnover × Equity Multiplier
      // First ensure we have asset_turnover calculated
      const assetTurnover = m.asset_turnover || (m.revenue && m.total_assets ? m.revenue / m.total_assets : null);
      if (!m.dupont_roe && m.net_margin !== undefined && assetTurnover && m.equity_multiplier) {
        m.dupont_roe = m.net_margin * assetTurnover * m.equity_multiplier;
      }

      // Liquidity ratios
      if (m.current_liabilities && m.current_liabilities !== 0) {
        if (m.current_assets !== undefined && !m.current_ratio) {
          m.current_ratio = m.current_assets / m.current_liabilities;
        }
        // Quick ratio with fallback for service companies without inventory
        if (m.current_assets !== undefined && !m.quick_ratio) {
          if (m.inventories !== undefined) {
            // Standard: (Current Assets - Inventories) / Current Liabilities
            m.quick_ratio = (m.current_assets - m.inventories) / m.current_liabilities;
          } else {
            // For service companies without inventory, use current assets directly
            // This is effectively the same as assuming inventories = 0
            m.quick_ratio = m.current_assets / m.current_liabilities;
          }
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

      // Bank/Financial specific income
      net_interest_income: m.net_interest_income || null,
      fee_income: m.fee_income || m.net_fee_income || null,
      trading_income: m.trading_income || null,
      insurance_revenue: m.insurance_revenue || m.premiums_written || null,

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
      roce: m.roce || null,
      current_ratio: m.current_ratio || null,
      quick_ratio: m.quick_ratio || null,
      debt_to_equity: m.debt_to_equity || null,
      debt_to_assets: m.debt_to_assets || null,
      interest_coverage: m.interest_coverage || null,
      asset_turnover: m.asset_turnover || null,
      inventory_turnover: m.inventory_turnover || null,

      // DuPont Analysis
      equity_multiplier: m.equity_multiplier || null,
      dupont_roe: m.dupont_roe || null,

      // Operating expense breakdown (IFRS)
      distribution_costs: m.distribution_costs || null,
      admin_expenses: m.admin_expenses || null
    };
  }
}

module.exports = { XBRLParser, IFRS_MAPPINGS, UK_GAAP_MAPPINGS };

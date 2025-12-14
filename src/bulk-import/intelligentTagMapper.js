// src/bulk-import/intelligentTagMapper.js

/**
 * Intelligent XBRL Tag Mapping System
 *
 * Uses pattern matching and semantic analysis to map XBRL tags to canonical names
 * Falls back to auto-categorization for unknown tags
 */

const { TAG_MAPPINGS, TAG_CATEGORIES } = require('./tagMappings');

// ========================================
// PATTERN MATCHING RULES
// ========================================

const PATTERN_RULES = {
  // CASH & EQUIVALENTS
  cashAndEquivalents: {
    patterns: [
      /Cash.*Equivalent/i,
      /Cash.*Restricted/i,
      /CashAndDue/i,
      /RestrictedCash$/i
    ],
    exclude: [/Flow/, /Surrender/, /Operating/, /Investing/, /Financing/],
    canonical: 'CashAndEquivalents',
    statementType: 'balance_sheet'
  },

  // MARKETABLE SECURITIES - CURRENT
  marketableSecuritiesCurrent: {
    patterns: [
      /MarketableSecurities.*Current/i,
      /AvailableForSale.*Current/i,
      /TradingSecurities(?!.*Noncurrent)/i,
      /DebtSecuritiesAvailableForSale.*(?!Noncurrent)/i
    ],
    canonical: 'MarketableSecuritiesCurrent',
    statementType: 'balance_sheet'
  },

  // MARKETABLE SECURITIES - NON-CURRENT
  marketableSecuritiesNoncurrent: {
    patterns: [
      /MarketableSecurities.*Noncurrent/i,
      /HeldToMaturity/i,
      /AvailableForSale.*Noncurrent/i
    ],
    canonical: 'MarketableSecuritiesNoncurrent',
    statementType: 'balance_sheet'
  },

  // OPERATING LEASE ASSETS
  operatingLeaseAssets: {
    patterns: [
      /OperatingLease.*Asset/i,
      /OperatingLeaseRightOfUseAsset/i
    ],
    canonical: 'OperatingLeaseAssets',
    statementType: 'balance_sheet'
  },

  // OPERATING LEASE LIABILITIES - CURRENT
  operatingLeaseLiabilityCurrent: {
    patterns: [
      /OperatingLease.*Liability.*Current/i,
      /OperatingLeaseLiabilityCurrent/i
    ],
    canonical: 'OperatingLeaseLiabilityCurrent',
    statementType: 'balance_sheet'
  },

  // OPERATING LEASE LIABILITIES - NON-CURRENT
  operatingLeaseLiabilityNoncurrent: {
    patterns: [
      /OperatingLease.*Liability.*Noncurrent/i,
      /OperatingLeaseLiabilityNoncurrent/i
    ],
    canonical: 'OperatingLeaseLiabilityNoncurrent',
    statementType: 'balance_sheet'
  },

  // LONG-TERM DEBT VARIANTS
  longTermDebt: {
    patterns: [
      /LongTermDebt(?!.*Current)/i,
      /.*Debt.*Noncurrent/i,
      /SubordinatedDebt/i,
      /LongTermDebtAndCapitalLease.*(?!Current)/i
    ],
    exclude: [/Current/],
    canonical: 'LongTermDebt',
    statementType: 'balance_sheet'
  },

  // SHORT-TERM DEBT
  shortTermDebt: {
    patterns: [
      /DebtCurrent/i,
      /ShortTermBorrowings/i,
      /CommercialPaper/i,
      /LongTermDebt.*Current/i
    ],
    canonical: 'ShortTermDebt',
    statementType: 'balance_sheet'
  },

  // DEFERRED TAX ASSETS
  deferredTaxAssets: {
    patterns: [
      /DeferredTax.*Asset/i,
      /DeferredIncomeTaxAsset/i
    ],
    canonical: 'DeferredTaxAssets',
    statementType: 'balance_sheet'
  },

  // DEFERRED TAX LIABILITIES
  deferredTaxLiabilities: {
    patterns: [
      /DeferredTax.*Liabilit/i,
      /DeferredIncomeTaxLiabilit/i
    ],
    canonical: 'DeferredTaxLiabilities',
    statementType: 'balance_sheet'
  },

  // ADDITIONAL PAID-IN CAPITAL
  additionalPaidInCapital: {
    patterns: [
      /AdditionalPaidInCapital/i,
      /CapitalInExcessOfPar/i
    ],
    canonical: 'AdditionalPaidInCapital',
    statementType: 'balance_sheet'
  },

  // PREFERRED STOCK
  preferredStock: {
    patterns: [
      /PreferredStock(?!.*Share)/i
    ],
    canonical: 'PreferredStock',
    statementType: 'balance_sheet'
  },

  // TREASURY STOCK
  treasuryStock: {
    patterns: [
      /TreasuryStock/i
    ],
    canonical: 'TreasuryStock',
    statementType: 'balance_sheet'
  },

  // OTHER CURRENT ASSETS
  otherCurrentAssets: {
    patterns: [
      /OtherAsset.*Current/i,
      /PrepaidExpense/i
    ],
    canonical: 'OtherCurrentAssets',
    statementType: 'balance_sheet'
  },

  // OTHER NON-CURRENT ASSETS
  otherNoncurrentAssets: {
    patterns: [
      /OtherAsset.*Noncurrent/i,
      /OtherAsset(?!.*Current)/i
    ],
    exclude: [/Current/],
    canonical: 'OtherNoncurrentAssets',
    statementType: 'balance_sheet'
  },

  // OTHER CURRENT LIABILITIES
  otherCurrentLiabilities: {
    patterns: [
      /OtherLiabilit.*Current/i,
      /AccruedLiabilit.*Current/i,
      /EmployeeRelatedLiabilit.*Current/i
    ],
    canonical: 'OtherCurrentLiabilities',
    statementType: 'balance_sheet'
  },

  // OTHER NON-CURRENT LIABILITIES
  otherNoncurrentLiabilities: {
    patterns: [
      /OtherLiabilit.*Noncurrent/i,
      /OtherLiabilit(?!.*Current)/i
    ],
    exclude: [/Current/],
    canonical: 'OtherNoncurrentLiabilities',
    statementType: 'balance_sheet'
  },

  // ========================================
  // INCOME STATEMENT PATTERNS
  // ========================================

  // COMPREHENSIVE INCOME
  comprehensiveIncome: {
    patterns: [
      /ComprehensiveIncome.*NetOfTax/i,
      /ComprehensiveIncome(?!Loss)/i
    ],
    canonical: 'ComprehensiveIncome',
    statementType: 'income_statement'
  },

  // OTHER COMPREHENSIVE INCOME
  otherComprehensiveIncome: {
    patterns: [
      /OtherComprehensiveIncome/i
    ],
    canonical: 'OtherComprehensiveIncome',
    statementType: 'income_statement'
  },

  // NON-OPERATING INCOME/EXPENSE
  nonOperatingIncomeExpense: {
    patterns: [
      /OtherNonoperatingIncome/i,
      /NonoperatingIncome/i,
      /OtherIncome(?!Tax)/i
    ],
    canonical: 'NonOperatingIncomeExpense',
    statementType: 'income_statement'
  },

  // RESTRUCTURING CHARGES
  restructuringCharges: {
    patterns: [
      /RestructuringCharges/i,
      /RestructuringCosts/i
    ],
    canonical: 'RestructuringCharges',
    statementType: 'income_statement'
  },

  // AMORTIZATION OF INTANGIBLES
  amortizationOfIntangibles: {
    patterns: [
      /AmortizationOfIntangible/i
    ],
    canonical: 'AmortizationOfIntangibles',
    statementType: 'income_statement'
  },

  // INTEREST EXPENSE (NON-OPERATING)
  interestExpenseNonOperating: {
    patterns: [
      /InterestExpenseNonoperating/i,
      /InterestExpenseDebt/i
    ],
    canonical: 'InterestExpenseNonOperating',
    statementType: 'income_statement'
  },

  // GAINS/LOSSES ON DEBT EXTINGUISHMENT
  gainsLossesOnDebtExtinguishment: {
    patterns: [
      /GainsLossesOnExtinguishmentOfDebt/i
    ],
    canonical: 'GainsLossesOnDebtExtinguishment',
    statementType: 'income_statement'
  },

  // DIVIDENDS PER SHARE
  dividendsPerShare: {
    patterns: [
      /CommonStockDividendsPerShare/i,
      /DividendsPerShare/i
    ],
    canonical: 'DividendsPerShare',
    statementType: 'income_statement'
  },

  // NON-CONTROLLING INTEREST
  nonControllingInterest: {
    patterns: [
      /NetIncomeLoss.*NoncontrollingInterest/i,
      /NoncontrollingInterest.*NetIncome/i
    ],
    canonical: 'NonControllingInterest',
    statementType: 'income_statement'
  },

  // ========================================
  // CASH FLOW STATEMENT PATTERNS
  // ========================================

  // WORKING CAPITAL CHANGES - INVENTORY
  changeInInventory: {
    patterns: [
      /IncreaseDecreaseInInventor/i
    ],
    canonical: 'ChangeInInventory',
    statementType: 'cash_flow'
  },

  // WORKING CAPITAL CHANGES - ACCOUNTS RECEIVABLE
  changeInAccountsReceivable: {
    patterns: [
      /IncreaseDecreaseInAccountsReceivable/i,
      /IncreaseDecreaseInReceivables/i
    ],
    canonical: 'ChangeInAccountsReceivable',
    statementType: 'cash_flow'
  },

  // WORKING CAPITAL CHANGES - ACCOUNTS PAYABLE
  changeInAccountsPayable: {
    patterns: [
      /IncreaseDecreaseInAccountsPayable/i
    ],
    canonical: 'ChangeInAccountsPayable',
    statementType: 'cash_flow'
  },

  // WORKING CAPITAL CHANGES - ACCRUED LIABILITIES
  changeInAccruedLiabilities: {
    patterns: [
      /IncreaseDecreaseInAccruedLiabilities/i
    ],
    canonical: 'ChangeInAccruedLiabilities',
    statementType: 'cash_flow'
  },

  // WORKING CAPITAL CHANGES - PREPAID & OTHER ASSETS
  changeInPrepaidAndOtherAssets: {
    patterns: [
      /IncreaseDecreaseInPrepaid/i,
      /IncreaseDecreaseInOtherOperatingAssets/i
    ],
    canonical: 'ChangeInPrepaidAndOtherAssets',
    statementType: 'cash_flow'
  },

  // WORKING CAPITAL CHANGES - INCOME TAXES PAYABLE
  changeInIncomeTaxesPayable: {
    patterns: [
      /IncreaseDecreaseInAccruedIncomeTaxesPayable/i,
      /IncreaseDecreaseInIncomeTaxes/i
    ],
    canonical: 'ChangeInIncomeTaxesPayable',
    statementType: 'cash_flow'
  },

  // INTEREST PAID (CASH)
  interestPaid: {
    patterns: [
      /InterestPaid(?!.*Capitalized)/i
    ],
    canonical: 'InterestPaid',
    statementType: 'cash_flow'
  },

  // INCOME TAXES PAID (CASH)
  incomeTaxesPaid: {
    patterns: [
      /IncomeTaxesPaid/i
    ],
    canonical: 'IncomeTaxesPaid',
    statementType: 'cash_flow'
  },

  // FX EFFECT ON CASH
  fxEffectOnCash: {
    patterns: [
      /EffectOfExchangeRateOnCash/i
    ],
    canonical: 'FxEffectOnCash',
    statementType: 'cash_flow'
  },

  // PROCEEDS FROM SALE OF PPE
  proceedsFromSaleOfPPE: {
    patterns: [
      /ProceedsFromSaleOfPropertyPlantAndEquipment/i
    ],
    canonical: 'ProceedsFromSaleOfPPE',
    statementType: 'cash_flow'
  },

  // OTHER INVESTING ACTIVITIES
  otherInvestingActivities: {
    patterns: [
      /PaymentsForProceedsFromOtherInvestingActivities/i
    ],
    canonical: 'OtherInvestingActivities',
    statementType: 'cash_flow'
  },

  // TREASURY STOCK ACQUIRED
  treasuryStockAcquired: {
    patterns: [
      /TreasuryStockValueAcquiredCostMethod/i,
      /PaymentsForRepurchaseOfCommonStock/i
    ],
    canonical: 'TreasuryStockAcquired',
    statementType: 'cash_flow'
  },

  // SHARE-BASED COMPENSATION (CASH FLOW)
  shareBasedCompensationCashFlow: {
    patterns: [
      /AdjustmentsToAdditionalPaidInCapitalSharebasedCompensation/i,
      /StockIssuedDuringPeriodValueShareBasedCompensation/i
    ],
    canonical: 'ShareBasedCompensationCashFlow',
    statementType: 'cash_flow'
  },

  // TAX WITHHOLDING FOR SHARE-BASED COMP
  taxWithholdingForShareBasedComp: {
    patterns: [
      /PaymentsRelatedToTaxWithholdingForShareBasedCompensation/i
    ],
    canonical: 'TaxWithholdingForShareBasedComp',
    statementType: 'cash_flow'
  },

  // DEBT ISSUANCE COSTS
  debtIssuanceCosts: {
    patterns: [
      /PaymentsOfDebtIssuanceCosts/i
    ],
    canonical: 'DebtIssuanceCosts',
    statementType: 'cash_flow'
  }
};

// ========================================
// AUTO-CATEGORIZATION RULES
// ========================================

function inferCategory(tag) {
  const lower = tag.toLowerCase();

  // ASSETS
  if (lower.includes('asset')) {
    if (lower.includes('current')) return { category: 'current_assets', type: 'balance_sheet' };
    if (lower.includes('noncurrent') || lower.includes('long')) return { category: 'noncurrent_assets', type: 'balance_sheet' };
    return { category: 'assets_other', type: 'balance_sheet' };
  }

  // LIABILITIES
  if (lower.includes('liabilit') || lower.includes('payable') || lower.includes('accrued')) {
    if (lower.includes('current')) return { category: 'current_liabilities', type: 'balance_sheet' };
    if (lower.includes('noncurrent') || lower.includes('long')) return { category: 'noncurrent_liabilities', type: 'balance_sheet' };
    return { category: 'liabilities_other', type: 'balance_sheet' };
  }

  // EQUITY
  if (lower.includes('equity') || lower.includes('stock') || lower.includes('capital') || lower.includes('retained')) {
    return { category: 'equity', type: 'balance_sheet' };
  }

  // RECEIVABLES
  if (lower.includes('receivable')) {
    if (lower.includes('current')) return { category: 'current_assets', type: 'balance_sheet' };
    return { category: 'noncurrent_assets', type: 'balance_sheet' };
  }

  // DEBT
  if (lower.includes('debt') || lower.includes('borrowing') || lower.includes('note')) {
    if (lower.includes('current') || lower.includes('short')) return { category: 'current_liabilities', type: 'balance_sheet' };
    if (lower.includes('noncurrent') || lower.includes('long')) return { category: 'noncurrent_liabilities', type: 'balance_sheet' };
    return { category: 'liabilities_other', type: 'balance_sheet' };
  }

  return { category: 'uncategorized', type: 'unknown' };
}

// ========================================
// MAIN MAPPING FUNCTION
// ========================================

class IntelligentTagMapper {
  constructor() {
    this.stats = {
      exactMatches: 0,
      patternMatches: 0,
      autoCategorized: 0,
      unmapped: 0
    };
    this.mappingLog = [];
  }

  /**
   * Map XBRL tag to canonical name
   * @param {string} originalTag - Original XBRL tag name
   * @returns {object} { canonical, statementType, method }
   */
  mapTag(originalTag) {
    // Strategy 1: Exact match from existing mappings
    if (TAG_MAPPINGS[originalTag]) {
      const canonical = TAG_MAPPINGS[originalTag];
      const statementType = TAG_CATEGORIES[canonical] || 'unknown';
      this.stats.exactMatches++;
      return {
        canonical,
        statementType,
        method: 'exact',
        confidence: 1.0
      };
    }

    // Strategy 2: Pattern matching
    for (const [ruleName, rule] of Object.entries(PATTERN_RULES)) {
      // Check if tag matches any pattern
      const matches = rule.patterns.some(pattern => pattern.test(originalTag));

      // Check if tag is excluded
      const excluded = rule.exclude ? rule.exclude.some(pattern => pattern.test(originalTag)) : false;

      if (matches && !excluded) {
        this.stats.patternMatches++;

        // Only log first 1000 mappings to avoid memory issues
        if (this.mappingLog.length < 1000) {
          this.mappingLog.push({
            original: originalTag,
            canonical: rule.canonical,
            method: 'pattern',
            rule: ruleName
          });
        }

        return {
          canonical: rule.canonical,
          statementType: rule.statementType,
          method: 'pattern',
          confidence: 0.9,
          rule: ruleName
        };
      }
    }

    // Strategy 3: Auto-categorization
    const inferred = inferCategory(originalTag);
    if (inferred.category !== 'uncategorized') {
      this.stats.autoCategorized++;
      this.mappingLog.push({
        original: originalTag,
        canonical: originalTag, // Keep original name
        method: 'auto-categorize',
        category: inferred.category
      });

      return {
        canonical: originalTag, // Store with original name
        statementType: inferred.type,
        method: 'auto-categorize',
        confidence: 0.5,
        category: inferred.category
      };
    }

    // Strategy 4: Unknown - but still store it
    this.stats.unmapped++;
    return {
      canonical: originalTag,
      statementType: 'unknown',
      method: 'unmapped',
      confidence: 0.0
    };
  }

  /**
   * Determine if tag should be imported
   */
  shouldImportTag(originalTag) {
    const mapping = this.mapTag(originalTag);
    // Import everything except completely unknown tags
    return mapping.method !== 'unmapped' || mapping.statementType !== 'unknown';
  }

  /**
   * Get mapping statistics
   */
  getStats() {
    return this.stats;
  }

  /**
   * Get mapping log for review
   */
  getMappingLog() {
    return this.mappingLog;
  }
}

module.exports = IntelligentTagMapper;

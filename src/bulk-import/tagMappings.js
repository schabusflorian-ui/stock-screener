// src/bulk-import/tagMappings.js

/**
 * XBRL Tag Mappings
 *
 * Maps variant XBRL tags to canonical names for consistent querying
 * SEC companies use different tag names for the same concepts
 */

// ========================================
// TAG MAPPINGS: Original → Canonical
// ========================================

const TAG_MAPPINGS = {
  // ========================================
  // REVENUE
  // ========================================
  'RevenueFromContractWithCustomerExcludingAssessedTax': 'Revenue',
  'RevenueFromContractWithCustomerIncludingAssessedTax': 'Revenue',
  'Revenues': 'Revenue',
  'SalesRevenueNet': 'Revenue',
  'SalesRevenueGoodsNet': 'Revenue',
  'SalesRevenueServicesNet': 'Revenue',
  'RevenuesNetOfInterestExpense': 'Revenue',
  'RegulatedAndUnregulatedOperatingRevenue': 'Revenue',
  'FinancialServicesRevenue': 'Revenue',
  'InterestAndDividendIncomeOperating': 'Revenue',

  // ========================================
  // NET INCOME
  // ========================================
  'NetIncomeLoss': 'NetIncome',
  'ProfitLoss': 'NetIncome',
  'NetIncomeLossAvailableToCommonStockholdersBasic': 'NetIncome',
  'NetIncomeLossAttributableToParent': 'NetIncome',
  'IncomeLossFromContinuingOperations': 'NetIncome',
  'IncomeLossFromContinuingOperationsIncludingPortionAttributableToNoncontrollingInterest': 'NetIncome',

  // ========================================
  // COST OF REVENUE
  // ========================================
  'CostOfRevenue': 'CostOfRevenue',
  'CostOfGoodsAndServicesSold': 'CostOfRevenue',
  'CostOfGoodsSold': 'CostOfRevenue',
  'CostOfServices': 'CostOfRevenue',

  // ========================================
  // GROSS PROFIT
  // ========================================
  'GrossProfit': 'GrossProfit',
  'GrossProfitLoss': 'GrossProfit',

  // ========================================
  // OPERATING INCOME
  // ========================================
  'OperatingIncomeLoss': 'OperatingIncome',
  'IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest': 'OperatingIncome',

  // ========================================
  // OPERATING EXPENSES
  // ========================================
  'ResearchAndDevelopmentExpense': 'ResearchAndDevelopment',
  'SellingGeneralAndAdministrativeExpense': 'SellingGeneralAndAdministrative',
  'SellingAndMarketingExpense': 'SellingAndMarketing',
  'GeneralAndAdministrativeExpense': 'GeneralAndAdministrative',

  // ========================================
  // ASSETS
  // ========================================
  'Assets': 'TotalAssets',
  'AssetsCurrent': 'CurrentAssets',
  'AssetsNoncurrent': 'NoncurrentAssets',
  'CashAndCashEquivalentsAtCarryingValue': 'CashAndEquivalents',
  'Cash': 'CashAndEquivalents',
  'CashCashEquivalentsAndShortTermInvestments': 'CashAndEquivalents',
  'AccountsReceivableNetCurrent': 'AccountsReceivable',
  'AccountsReceivableNet': 'AccountsReceivable',
  'ReceivablesNetCurrent': 'AccountsReceivable',
  'InventoryNet': 'Inventory',
  'PropertyPlantAndEquipmentNet': 'PropertyPlantEquipment',
  'PropertyPlantAndEquipmentGross': 'PropertyPlantEquipmentGross',
  'AccumulatedDepreciationDepletionAndAmortizationPropertyPlantAndEquipment': 'AccumulatedDepreciation',
  'Goodwill': 'Goodwill',
  'IntangibleAssetsNetExcludingGoodwill': 'IntangibleAssets',
  'FiniteLivedIntangibleAssetsNet': 'IntangibleAssets',

  // ========================================
  // LIABILITIES
  // ========================================
  'Liabilities': 'TotalLiabilities',
  'LiabilitiesCurrent': 'CurrentLiabilities',
  'LiabilitiesNoncurrent': 'NoncurrentLiabilities',
  'AccountsPayableCurrent': 'AccountsPayable',
  'AccountsPayableAndAccruedLiabilitiesCurrent': 'AccountsPayable',
  'AccruedLiabilitiesCurrent': 'AccruedLiabilities',
  'DeferredRevenueCurrent': 'DeferredRevenue',
  'ContractWithCustomerLiabilityCurrent': 'DeferredRevenue',
  'LongTermDebtNoncurrent': 'LongTermDebt',
  'LongTermDebt': 'LongTermDebt',
  'LongTermDebtCurrent': 'ShortTermDebt',
  'ShortTermBorrowings': 'ShortTermDebt',

  // ========================================
  // EQUITY
  // ========================================
  'StockholdersEquity': 'ShareholderEquity',
  'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest': 'ShareholderEquity',
  'CommonStockValue': 'CommonStock',
  'CommonStockSharesOutstanding': 'CommonStockSharesOutstanding',
  'CommonStockSharesIssued': 'CommonStockSharesIssued',
  'TreasuryStockValue': 'TreasuryStock',
  'RetainedEarningsAccumulatedDeficit': 'RetainedEarnings',
  'AccumulatedOtherComprehensiveIncomeLossNetOfTax': 'AccumulatedOCI',

  // ========================================
  // CASH FLOW - OPERATING
  // ========================================
  'NetCashProvidedByUsedInOperatingActivities': 'OperatingCashFlow',
  'NetCashProvidedByUsedInOperatingActivitiesContinuingOperations': 'OperatingCashFlow',
  'DepreciationDepletionAndAmortization': 'Depreciation',
  'DepreciationAndAmortization': 'Depreciation',
  'ShareBasedCompensation': 'StockBasedCompensation',
  'DeferredIncomeTaxExpenseBenefit': 'DeferredTaxes',

  // ========================================
  // CASH FLOW - INVESTING
  // ========================================
  'NetCashProvidedByUsedInInvestingActivities': 'InvestingCashFlow',
  'PaymentsToAcquirePropertyPlantAndEquipment': 'CapitalExpenditures',
  'PaymentsToAcquireProductiveAssets': 'CapitalExpenditures',
  'PaymentsToAcquireBusinessesNetOfCashAcquired': 'Acquisitions',

  // ========================================
  // CASH FLOW - FINANCING
  // ========================================
  'NetCashProvidedByUsedInFinancingActivities': 'FinancingCashFlow',
  'PaymentsOfDividends': 'Dividends',
  'PaymentsOfDividendsCommonStock': 'Dividends',
  'ProceedsFromIssuanceOfCommonStock': 'StockIssuance',
  'PaymentsForRepurchaseOfCommonStock': 'StockRepurchase',
  'RepaymentsOfLongTermDebt': 'DebtRepayment',
  'ProceedsFromIssuanceOfLongTermDebt': 'DebtIssuance',

  // ========================================
  // EARNINGS PER SHARE
  // ========================================
  'EarningsPerShareBasic': 'EPSBasic',
  'EarningsPerShareDiluted': 'EPSDiluted',
  'WeightedAverageNumberOfSharesOutstandingBasic': 'WeightedAverageSharesBasic',
  'WeightedAverageNumberOfDilutedSharesOutstanding': 'WeightedAverageSharesDiluted',

  // ========================================
  // OTHER KEY METRICS
  // ========================================
  'InterestExpense': 'InterestExpense',
  'InterestIncomeExpenseNet': 'InterestExpenseNet',
  'IncomeTaxExpenseBenefit': 'IncomeTaxExpense',
  'EffectiveIncomeTaxRateContinuingOperations': 'EffectiveTaxRate'
};

// ========================================
// STATEMENT TYPE CLASSIFICATION
// ========================================

const TAG_CATEGORIES = {
  // Income Statement
  'Revenue': 'income_statement',
  'NetIncome': 'income_statement',
  'CostOfRevenue': 'income_statement',
  'GrossProfit': 'income_statement',
  'OperatingIncome': 'income_statement',
  'ResearchAndDevelopment': 'income_statement',
  'SellingGeneralAndAdministrative': 'income_statement',
  'SellingAndMarketing': 'income_statement',
  'GeneralAndAdministrative': 'income_statement',
  'InterestExpense': 'income_statement',
  'InterestExpenseNet': 'income_statement',
  'IncomeTaxExpense': 'income_statement',
  'EffectiveTaxRate': 'income_statement',
  'EPSBasic': 'income_statement',
  'EPSDiluted': 'income_statement',
  'WeightedAverageSharesBasic': 'income_statement',
  'WeightedAverageSharesDiluted': 'income_statement',

  // Balance Sheet
  'TotalAssets': 'balance_sheet',
  'CurrentAssets': 'balance_sheet',
  'NoncurrentAssets': 'balance_sheet',
  'CashAndEquivalents': 'balance_sheet',
  'AccountsReceivable': 'balance_sheet',
  'Inventory': 'balance_sheet',
  'PropertyPlantEquipment': 'balance_sheet',
  'PropertyPlantEquipmentGross': 'balance_sheet',
  'AccumulatedDepreciation': 'balance_sheet',
  'Goodwill': 'balance_sheet',
  'IntangibleAssets': 'balance_sheet',
  'TotalLiabilities': 'balance_sheet',
  'CurrentLiabilities': 'balance_sheet',
  'NoncurrentLiabilities': 'balance_sheet',
  'AccountsPayable': 'balance_sheet',
  'AccruedLiabilities': 'balance_sheet',
  'DeferredRevenue': 'balance_sheet',
  'LongTermDebt': 'balance_sheet',
  'ShortTermDebt': 'balance_sheet',
  'ShareholderEquity': 'balance_sheet',
  'CommonStock': 'balance_sheet',
  'CommonStockSharesOutstanding': 'balance_sheet',
  'CommonStockSharesIssued': 'balance_sheet',
  'TreasuryStock': 'balance_sheet',
  'RetainedEarnings': 'balance_sheet',
  'AccumulatedOCI': 'balance_sheet',

  // Cash Flow Statement
  'OperatingCashFlow': 'cash_flow',
  'InvestingCashFlow': 'cash_flow',
  'FinancingCashFlow': 'cash_flow',
  'Depreciation': 'cash_flow',
  'StockBasedCompensation': 'cash_flow',
  'DeferredTaxes': 'cash_flow',
  'CapitalExpenditures': 'cash_flow',
  'Acquisitions': 'cash_flow',
  'Dividends': 'cash_flow',
  'StockIssuance': 'cash_flow',
  'StockRepurchase': 'cash_flow',
  'DebtRepayment': 'cash_flow',
  'DebtIssuance': 'cash_flow'
};

// ========================================
// PRIORITY LEVELS (higher = more preferred)
// ========================================

const TAG_PRIORITIES = {
  // Revenue
  'RevenueFromContractWithCustomerExcludingAssessedTax': 100,
  'Revenues': 90,
  'SalesRevenueNet': 80,

  // Net Income
  'NetIncomeLoss': 100,
  'NetIncomeLossAvailableToCommonStockholdersBasic': 90,
  'ProfitLoss': 80,

  // Assets
  'Assets': 100,
  'CashAndCashEquivalentsAtCarryingValue': 100,
  'Cash': 80,

  // Default priority
  'default': 50
};

/**
 * Get canonical tag name
 */
function getCanonicalTag(originalTag) {
  return TAG_MAPPINGS[originalTag] || originalTag;
}

/**
 * Get statement type for tag
 */
function getStatementType(canonicalTag) {
  return TAG_CATEGORIES[canonicalTag] || 'unknown';
}

/**
 * Get priority for tag
 */
function getTagPriority(originalTag) {
  return TAG_PRIORITIES[originalTag] || TAG_PRIORITIES['default'];
}

/**
 * Check if tag should be imported
 */
function shouldImportTag(originalTag) {
  const canonical = getCanonicalTag(originalTag);
  const category = getStatementType(canonical);
  return category !== 'unknown';
}

/**
 * Get all canonical tags
 */
function getAllCanonicalTags() {
  return Object.keys(TAG_CATEGORIES);
}

/**
 * Get all original tags for a canonical tag
 */
function getOriginalTags(canonicalTag) {
  return Object.entries(TAG_MAPPINGS)
    .filter(([_, canonical]) => canonical === canonicalTag)
    .map(([original, _]) => original);
}

/**
 * Insert tag mappings into database
 */
function insertTagMappings(database) {
  console.log('\n📋 Inserting tag mappings into database...');

  const stmt = database.prepare(`
    INSERT OR REPLACE INTO tag_mappings
    (original_tag, canonical_tag, statement_type, priority)
    VALUES (?, ?, ?, ?)
  `);

  const insertMany = database.transaction((mappings) => {
    for (const [original, canonical] of Object.entries(mappings)) {
      const statementType = getStatementType(canonical);
      const priority = getTagPriority(original);
      stmt.run(original, canonical, statementType, priority);
    }
  });

  insertMany(TAG_MAPPINGS);

  const count = database.prepare('SELECT COUNT(*) as count FROM tag_mappings').get();
  console.log(`✅ Inserted ${count.count} tag mappings\n`);

  return count.count;
}

module.exports = {
  TAG_MAPPINGS,
  TAG_CATEGORIES,
  TAG_PRIORITIES,
  getCanonicalTag,
  getStatementType,
  getTagPriority,
  shouldImportTag,
  getAllCanonicalTags,
  getOriginalTags,
  insertTagMappings
};

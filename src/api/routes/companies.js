// src/api/routes/companies.js
const express = require('express');
const router = express.Router();
const db = require('../../database');
const newsService = require('../../services/newsService');

const database = db.getDatabase();

/**
 * GET /api/companies
 * List all companies
 */
router.get('/', (req, res) => {
  try {
    const companies = database.prepare(`
      SELECT 
        c.*,
        COUNT(DISTINCT f.fiscal_date_ending) as years_of_data,
        MAX(f.fiscal_date_ending) as latest_data
      FROM companies c
      LEFT JOIN financial_data f ON c.id = f.company_id
      WHERE c.is_active = 1
      GROUP BY c.id
      ORDER BY c.symbol
    `).all();
    
    res.json({
      count: companies.length,
      companies
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/companies/:symbol
 * Get single company details
 */
router.get('/:symbol', (req, res) => {
  try {
    const { symbol } = req.params;
    
    const company = database.prepare(`
      SELECT * FROM companies WHERE symbol = ? COLLATE NOCASE
    `).get(symbol.toUpperCase());
    
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }
    
    // Get latest metrics
    const metrics = database.prepare(`
      SELECT * FROM calculated_metrics
      WHERE company_id = ?
      ORDER BY fiscal_period DESC
      LIMIT 1
    `).get(company.id);
    
    res.json({
      company,
      latest_metrics: metrics
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/companies/:symbol/financials
 * Get all financial statements
 */
router.get('/:symbol/financials', (req, res) => {
  try {
    const { symbol } = req.params;
    
    const company = database.prepare(
      'SELECT id FROM companies WHERE symbol = ? COLLATE NOCASE'
    ).get(symbol.toUpperCase());
    
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }
    
    const financials = database.prepare(`
      SELECT 
        statement_type,
        fiscal_date_ending,
        fiscal_year,
        period_type,
        data
      FROM financial_data
      WHERE company_id = ?
      ORDER BY fiscal_date_ending DESC
    `).all(company.id);
    
    // Parse JSON data
    const parsed = financials.map(f => ({
      ...f,
      data: JSON.parse(f.data)
    }));
    
    // Group by statement type
    const grouped = {
      balance_sheet: parsed.filter(f => f.statement_type === 'balance_sheet'),
      income_statement: parsed.filter(f => f.statement_type === 'income_statement'),
      cash_flow: parsed.filter(f => f.statement_type === 'cash_flow')
    };
    
    res.json(grouped);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/companies/:symbol/metrics
 * Get all calculated metrics (historical)
 * Query params:
 *   - limit: number of records (default 20)
 *   - period_type: 'annual', 'quarterly', or 'all' (default 'annual')
 */
router.get('/:symbol/metrics', (req, res) => {
  try {
    const { symbol } = req.params;
    const { limit = 20, period_type = 'annual' } = req.query;

    const company = database.prepare(
      'SELECT id FROM companies WHERE symbol = ? COLLATE NOCASE'
    ).get(symbol.toUpperCase());

    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    let query;
    let params;

    if (period_type === 'all') {
      query = `
        SELECT * FROM calculated_metrics
        WHERE company_id = ?
        ORDER BY fiscal_period DESC
        LIMIT ?
      `;
      params = [company.id, parseInt(limit)];
    } else {
      query = `
        SELECT * FROM calculated_metrics
        WHERE company_id = ? AND period_type = ?
        ORDER BY fiscal_period DESC
        LIMIT ?
      `;
      params = [company.id, period_type, parseInt(limit)];
    }

    const metrics = database.prepare(query).all(...params);

    // Get available period types for this company
    const periodTypes = database.prepare(`
      SELECT DISTINCT period_type, COUNT(*) as count
      FROM calculated_metrics
      WHERE company_id = ?
      GROUP BY period_type
    `).all(company.id);

    res.json({
      symbol: symbol.toUpperCase(),
      count: metrics.length,
      period_type,
      available_periods: periodTypes,
      metrics
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/companies/:symbol/breakdown
 * Get detailed financial breakdown for analysis
 * Query params:
 *   - period_type: 'annual' or 'quarterly' (default 'annual')
 *   - limit: number of periods (default 10)
 */
router.get('/:symbol/breakdown', (req, res) => {
  try {
    const { symbol } = req.params;
    const { period_type = 'annual', limit = 10 } = req.query;

    const company = database.prepare(
      'SELECT id FROM companies WHERE symbol = ? COLLATE NOCASE'
    ).get(symbol.toUpperCase());

    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    // Get income statement data with extracted fields and full JSON
    const incomeStatements = database.prepare(`
      SELECT
        fiscal_date_ending,
        fiscal_year,
        fiscal_period,
        period_type,
        total_revenue,
        cost_of_revenue,
        gross_profit,
        operating_income,
        net_income,
        data
      FROM financial_data
      WHERE company_id = ?
        AND statement_type = 'income_statement'
        AND period_type = ?
      ORDER BY fiscal_date_ending DESC
      LIMIT ?
    `).all(company.id, period_type, parseInt(limit));

    // Process and enrich the data
    const breakdown = incomeStatements.map(stmt => {
      const fullData = JSON.parse(stmt.data);
      const revenue = stmt.total_revenue || parseFloat(fullData.revenue) || 0;

      // Extract cost components
      const costOfRevenue = stmt.cost_of_revenue || parseFloat(fullData.costOfRevenue) || 0;
      const grossProfit = stmt.gross_profit || parseFloat(fullData.grossProfit) || 0;
      const operatingIncome = stmt.operating_income || parseFloat(fullData.operatingIncome) || 0;
      const netIncome = stmt.net_income || parseFloat(fullData.netIncome) || 0;

      // Operating expenses breakdown
      const researchAndDevelopment = parseFloat(fullData.researchAndDevelopment) || parseFloat(fullData.ResearchAndDevelopmentExpense) || 0;
      const sellingGeneralAdmin = parseFloat(fullData.sellingGeneralAndAdministrative) || parseFloat(fullData.SellingGeneralAndAdministrativeExpense) || 0;
      const depreciation = parseFloat(fullData.depreciation) || parseFloat(fullData.DepreciationAndAmortization) || 0;
      const interestExpense = parseFloat(fullData.interestExpense) || parseFloat(fullData.InterestExpense) || 0;
      const incomeTaxExpense = parseFloat(fullData.incomeTaxExpense) || parseFloat(fullData.IncomeTaxExpenseBenefit) || 0;

      // Calculate derived values
      const operatingExpenses = grossProfit - operatingIncome;
      const otherExpenses = operatingIncome - netIncome - incomeTaxExpense;

      // Calculate percentages of revenue
      const calcPercent = (value) => revenue > 0 ? (value / revenue) * 100 : 0;

      return {
        period: stmt.fiscal_date_ending,
        fiscal_year: stmt.fiscal_year,
        fiscal_period: stmt.fiscal_period,
        period_type: stmt.period_type,

        // Absolute values
        revenue,
        costOfRevenue,
        grossProfit,
        operatingExpenses,
        operatingIncome,
        netIncome,

        // Cost breakdown
        costs: {
          costOfRevenue,
          researchAndDevelopment,
          sellingGeneralAdmin,
          depreciation,
          interestExpense,
          incomeTaxExpense,
          otherExpenses: Math.max(0, otherExpenses)
        },

        // Margin percentages
        margins: {
          grossMargin: calcPercent(grossProfit),
          operatingMargin: calcPercent(operatingIncome),
          netMargin: calcPercent(netIncome),
          costOfRevenuePercent: calcPercent(costOfRevenue),
          rdPercent: calcPercent(researchAndDevelopment),
          sgaPercent: calcPercent(sellingGeneralAdmin),
          taxRate: operatingIncome > 0 ? (incomeTaxExpense / operatingIncome) * 100 : 0
        },

        // EPS data if available
        eps: {
          basic: parseFloat(fullData.ePSBasic) || parseFloat(fullData.EarningsPerShareBasic) || null,
          diluted: parseFloat(fullData.ePSDiluted) || parseFloat(fullData.EarningsPerShareDiluted) || null
        }
      };
    });

    // Get available periods
    const availablePeriods = database.prepare(`
      SELECT DISTINCT period_type, COUNT(*) as count
      FROM financial_data
      WHERE company_id = ? AND statement_type = 'income_statement'
      GROUP BY period_type
    `).all(company.id);

    res.json({
      symbol: symbol.toUpperCase(),
      period_type,
      count: breakdown.length,
      available_periods: availablePeriods,
      breakdown
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/companies/:symbol/balance-sheet
 * Get detailed balance sheet breakdown
 * Query params:
 *   - period_type: 'annual' or 'quarterly' (default 'annual')
 *   - limit: number of periods (default 10)
 */
router.get('/:symbol/balance-sheet', (req, res) => {
  try {
    const { symbol } = req.params;
    const { period_type = 'annual', limit = 10 } = req.query;

    const company = database.prepare(
      'SELECT id FROM companies WHERE symbol = ? COLLATE NOCASE'
    ).get(symbol.toUpperCase());

    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    const balanceSheets = database.prepare(`
      SELECT
        fiscal_date_ending,
        fiscal_year,
        fiscal_period,
        period_type,
        total_assets,
        total_liabilities,
        shareholder_equity,
        current_assets,
        current_liabilities,
        cash_and_equivalents,
        long_term_debt,
        short_term_debt,
        data
      FROM financial_data
      WHERE company_id = ?
        AND statement_type = 'balance_sheet'
        AND period_type = ?
      ORDER BY fiscal_date_ending DESC
      LIMIT ?
    `).all(company.id, period_type, parseInt(limit));

    const breakdown = balanceSheets.map(stmt => {
      const fullData = JSON.parse(stmt.data);

      // Assets breakdown
      const totalAssets = stmt.total_assets || parseFloat(fullData.totalAssets) || parseFloat(fullData.Assets) || 0;
      const currentAssets = stmt.current_assets || parseFloat(fullData.currentAssets) || parseFloat(fullData.AssetsCurrent) || 0;
      const noncurrentAssets = parseFloat(fullData.noncurrentAssets) || parseFloat(fullData.AssetsNoncurrent) || (totalAssets - currentAssets);

      // Current assets breakdown
      const cashAndEquivalents = stmt.cash_and_equivalents || parseFloat(fullData.cashAndEquivalents) || parseFloat(fullData.CashAndCashEquivalentsAtCarryingValue) || 0;
      const accountsReceivable = parseFloat(fullData.accountsReceivable) || parseFloat(fullData.AccountsReceivableNetCurrent) || 0;
      const inventory = parseFloat(fullData.inventory) || parseFloat(fullData.InventoryNet) || 0;
      const otherCurrentAssets = Math.max(0, currentAssets - cashAndEquivalents - accountsReceivable - inventory);

      // Non-current assets breakdown
      const propertyPlantEquipment = parseFloat(fullData.propertyPlantEquipment) || parseFloat(fullData.PropertyPlantAndEquipmentNet) || 0;
      const goodwill = parseFloat(fullData.goodwill) || parseFloat(fullData.Goodwill) || 0;
      const intangibleAssets = parseFloat(fullData.intangibleAssets) || parseFloat(fullData.IntangibleAssetsNetExcludingGoodwill) || 0;
      const longTermInvestments = parseFloat(fullData.longTermInvestments) || parseFloat(fullData.LongTermInvestments) || parseFloat(fullData.MarketableSecuritiesNoncurrent) || 0;
      const otherNoncurrentAssets = Math.max(0, noncurrentAssets - propertyPlantEquipment - goodwill - intangibleAssets - longTermInvestments);

      // Liabilities breakdown
      const totalLiabilities = stmt.total_liabilities || parseFloat(fullData.totalLiabilities) || parseFloat(fullData.Liabilities) || 0;
      const currentLiabilities = stmt.current_liabilities || parseFloat(fullData.currentLiabilities) || parseFloat(fullData.LiabilitiesCurrent) || 0;
      const noncurrentLiabilities = parseFloat(fullData.noncurrentLiabilities) || parseFloat(fullData.LiabilitiesNoncurrent) || (totalLiabilities - currentLiabilities);

      // Current liabilities breakdown
      const accountsPayable = parseFloat(fullData.accountsPayable) || parseFloat(fullData.AccountsPayableCurrent) || 0;
      const shortTermDebt = stmt.short_term_debt || parseFloat(fullData.shortTermDebt) || parseFloat(fullData.LongTermDebtCurrent) || parseFloat(fullData.ShortTermBorrowings) || 0;
      const deferredRevenue = parseFloat(fullData.deferredRevenue) || parseFloat(fullData.ContractWithCustomerLiabilityCurrent) || 0;
      const otherCurrentLiabilities = Math.max(0, currentLiabilities - accountsPayable - shortTermDebt - deferredRevenue);

      // Non-current liabilities breakdown
      const longTermDebt = stmt.long_term_debt || parseFloat(fullData.longTermDebt) || parseFloat(fullData.LongTermDebtNoncurrent) || 0;
      const deferredTaxLiabilities = parseFloat(fullData.deferredTaxLiabilities) || parseFloat(fullData.DeferredIncomeTaxLiabilitiesNet) || 0;
      const otherNoncurrentLiabilities = Math.max(0, noncurrentLiabilities - longTermDebt - deferredTaxLiabilities);

      // Equity breakdown
      const shareholderEquity = stmt.shareholder_equity || parseFloat(fullData.shareholderEquity) || parseFloat(fullData.StockholdersEquity) || 0;
      const retainedEarnings = parseFloat(fullData.retainedEarnings) || parseFloat(fullData.RetainedEarningsAccumulatedDeficit) || 0;
      const commonStock = parseFloat(fullData.commonStock) || parseFloat(fullData.CommonStockValue) || 0;
      const treasuryStock = parseFloat(fullData.treasuryStock) || parseFloat(fullData.TreasuryStockValue) || 0;
      const accumulatedOtherComprehensiveIncome = parseFloat(fullData.accumulatedOtherComprehensiveIncome) || parseFloat(fullData.AccumulatedOtherComprehensiveIncomeLossNetOfTax) || 0;

      // Calculate ratios
      const currentRatio = currentLiabilities > 0 ? currentAssets / currentLiabilities : 0;
      const quickRatio = currentLiabilities > 0 ? (currentAssets - inventory) / currentLiabilities : 0;
      const debtToEquity = shareholderEquity > 0 ? totalLiabilities / shareholderEquity : 0;
      const debtToAssets = totalAssets > 0 ? totalLiabilities / totalAssets : 0;
      const totalDebt = shortTermDebt + longTermDebt;
      const netDebt = totalDebt - cashAndEquivalents;

      return {
        period: stmt.fiscal_date_ending,
        fiscal_year: stmt.fiscal_year,
        fiscal_period: stmt.fiscal_period,
        period_type: stmt.period_type,

        // Summary totals
        summary: {
          totalAssets,
          totalLiabilities,
          shareholderEquity,
          totalDebt,
          netDebt,
          workingCapital: currentAssets - currentLiabilities
        },

        // Assets breakdown
        assets: {
          total: totalAssets,
          current: {
            total: currentAssets,
            cashAndEquivalents,
            accountsReceivable,
            inventory,
            other: otherCurrentAssets
          },
          noncurrent: {
            total: noncurrentAssets,
            propertyPlantEquipment,
            goodwill,
            intangibleAssets,
            longTermInvestments,
            other: otherNoncurrentAssets
          }
        },

        // Liabilities breakdown
        liabilities: {
          total: totalLiabilities,
          current: {
            total: currentLiabilities,
            accountsPayable,
            shortTermDebt,
            deferredRevenue,
            other: otherCurrentLiabilities
          },
          noncurrent: {
            total: noncurrentLiabilities,
            longTermDebt,
            deferredTaxLiabilities,
            other: otherNoncurrentLiabilities
          }
        },

        // Equity breakdown
        equity: {
          total: shareholderEquity,
          commonStock,
          retainedEarnings,
          treasuryStock,
          accumulatedOtherComprehensiveIncome
        },

        // Financial ratios
        ratios: {
          currentRatio,
          quickRatio,
          debtToEquity,
          debtToAssets,
          equityRatio: totalAssets > 0 ? shareholderEquity / totalAssets : 0,
          cashRatio: currentLiabilities > 0 ? cashAndEquivalents / currentLiabilities : 0
        }
      };
    });

    res.json({
      symbol: symbol.toUpperCase(),
      period_type,
      count: breakdown.length,
      breakdown
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/companies/:symbol/cash-flow
 * Get detailed cash flow statement breakdown
 * Query params:
 *   - period_type: 'annual' or 'quarterly' (default 'annual')
 *   - limit: number of periods (default 10)
 */
router.get('/:symbol/cash-flow', (req, res) => {
  try {
    const { symbol } = req.params;
    const { period_type = 'annual', limit = 10 } = req.query;

    const company = database.prepare(
      'SELECT id FROM companies WHERE symbol = ? COLLATE NOCASE'
    ).get(symbol.toUpperCase());

    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    // Get cash flow statements
    const cashFlows = database.prepare(`
      SELECT
        fiscal_date_ending,
        fiscal_year,
        fiscal_period,
        period_type,
        operating_cashflow,
        capital_expenditures,
        data
      FROM financial_data
      WHERE company_id = ?
        AND statement_type = 'cash_flow'
        AND period_type = ?
      ORDER BY fiscal_date_ending DESC
      LIMIT ?
    `).all(company.id, period_type, parseInt(limit));

    // Also get corresponding income statement data for context
    const incomeData = database.prepare(`
      SELECT
        fiscal_date_ending,
        net_income,
        data
      FROM financial_data
      WHERE company_id = ?
        AND statement_type = 'income_statement'
        AND period_type = ?
      ORDER BY fiscal_date_ending DESC
      LIMIT ?
    `).all(company.id, period_type, parseInt(limit));

    // Create a map for quick lookup
    const incomeMap = {};
    incomeData.forEach(inc => {
      incomeMap[inc.fiscal_date_ending] = inc;
    });

    const breakdown = cashFlows.map(stmt => {
      const fullData = JSON.parse(stmt.data);
      const incomeStmt = incomeMap[stmt.fiscal_date_ending];
      const netIncome = incomeStmt?.net_income || 0;

      // Operating activities
      const operatingCashFlow = stmt.operating_cashflow || parseFloat(fullData.operatingCashFlow) || parseFloat(fullData.NetCashProvidedByUsedInOperatingActivities) || 0;
      const depreciation = parseFloat(fullData.depreciation) || parseFloat(fullData.DepreciationDepletionAndAmortization) || 0;
      const stockBasedCompensation = parseFloat(fullData.stockBasedCompensation) || parseFloat(fullData.ShareBasedCompensation) || 0;
      const deferredIncomeTax = parseFloat(fullData.deferredIncomeTax) || parseFloat(fullData.DeferredIncomeTaxExpenseBenefit) || 0;
      const changeInWorkingCapital = parseFloat(fullData.changeInWorkingCapital) || parseFloat(fullData.IncreaseDecreaseInOperatingCapital) || 0;
      const changeInReceivables = parseFloat(fullData.changeInReceivables) || parseFloat(fullData.IncreaseDecreaseInAccountsReceivable) || 0;
      const changeInInventory = parseFloat(fullData.changeInInventory) || parseFloat(fullData.IncreaseDecreaseInInventories) || 0;
      const changeInPayables = parseFloat(fullData.changeInPayables) || parseFloat(fullData.IncreaseDecreaseInAccountsPayable) || 0;

      // Investing activities
      const investingCashFlow = parseFloat(fullData.investingCashFlow) || parseFloat(fullData.NetCashProvidedByUsedInInvestingActivities) || 0;
      const capitalExpenditures = stmt.capital_expenditures || parseFloat(fullData.capitalExpenditures) || parseFloat(fullData.PaymentsToAcquirePropertyPlantAndEquipment) || 0;
      const acquisitions = parseFloat(fullData.acquisitions) || parseFloat(fullData.PaymentsToAcquireBusinessesNetOfCashAcquired) || 0;
      const investmentPurchases = parseFloat(fullData.investmentPurchases) || parseFloat(fullData.PaymentsToAcquireInvestments) || 0;
      const investmentSales = parseFloat(fullData.investmentSales) || parseFloat(fullData.ProceedsFromSaleOfInvestments) || parseFloat(fullData.ProceedsFromMaturitiesPrepaymentsAndCallsOfAvailableForSaleSecurities) || 0;

      // Financing activities
      const financingCashFlow = parseFloat(fullData.financingCashFlow) || parseFloat(fullData.NetCashProvidedByUsedInFinancingActivities) || 0;
      const dividends = parseFloat(fullData.dividends) || parseFloat(fullData.PaymentsOfDividends) || 0;
      const stockRepurchase = parseFloat(fullData.stockRepurchase) || parseFloat(fullData.PaymentsForRepurchaseOfCommonStock) || 0;
      const debtRepayment = parseFloat(fullData.debtRepayment) || parseFloat(fullData.RepaymentsOfLongTermDebt) || 0;
      const debtIssuance = parseFloat(fullData.debtIssuance) || parseFloat(fullData.ProceedsFromIssuanceOfLongTermDebt) || 0;
      const stockIssuance = parseFloat(fullData.stockIssuance) || parseFloat(fullData.ProceedsFromIssuanceOfCommonStock) || 0;

      // Calculate derived metrics
      const freeCashFlow = operatingCashFlow - Math.abs(capitalExpenditures);
      const netChangeInCash = operatingCashFlow + investingCashFlow + financingCashFlow;
      const capitalReturned = dividends + stockRepurchase;

      // Calculate quality metrics
      const cashFlowToNetIncome = netIncome !== 0 ? operatingCashFlow / netIncome : 0;
      const capexToOperatingCF = operatingCashFlow !== 0 ? Math.abs(capitalExpenditures) / operatingCashFlow : 0;
      const fcfToOperatingCF = operatingCashFlow !== 0 ? freeCashFlow / operatingCashFlow : 0;

      return {
        period: stmt.fiscal_date_ending,
        fiscal_year: stmt.fiscal_year,
        fiscal_period: stmt.fiscal_period,
        period_type: stmt.period_type,

        // Summary
        summary: {
          operatingCashFlow,
          investingCashFlow,
          financingCashFlow,
          netChangeInCash,
          freeCashFlow,
          netIncome,
          capitalReturned
        },

        // Operating activities breakdown
        operating: {
          total: operatingCashFlow,
          netIncome,
          adjustments: {
            depreciation,
            stockBasedCompensation,
            deferredIncomeTax,
            otherNonCash: operatingCashFlow - netIncome - depreciation - stockBasedCompensation - deferredIncomeTax - changeInWorkingCapital
          },
          workingCapitalChanges: {
            total: changeInWorkingCapital,
            receivables: changeInReceivables,
            inventory: changeInInventory,
            payables: changeInPayables
          }
        },

        // Investing activities breakdown
        investing: {
          total: investingCashFlow,
          capitalExpenditures: -Math.abs(capitalExpenditures), // Show as negative
          acquisitions: -Math.abs(acquisitions),
          investmentPurchases: -Math.abs(investmentPurchases),
          investmentSales: Math.abs(investmentSales),
          other: investingCashFlow + Math.abs(capitalExpenditures) + Math.abs(acquisitions) + Math.abs(investmentPurchases) - Math.abs(investmentSales)
        },

        // Financing activities breakdown
        financing: {
          total: financingCashFlow,
          dividends: -Math.abs(dividends),
          stockRepurchase: -Math.abs(stockRepurchase),
          debtRepayment: -Math.abs(debtRepayment),
          debtIssuance: Math.abs(debtIssuance),
          stockIssuance: Math.abs(stockIssuance),
          other: financingCashFlow + Math.abs(dividends) + Math.abs(stockRepurchase) + Math.abs(debtRepayment) - Math.abs(debtIssuance) - Math.abs(stockIssuance)
        },

        // Quality metrics
        quality: {
          cashFlowToNetIncome, // Should be > 1 ideally
          capexToOperatingCF, // Lower is better (more discretionary CF)
          fcfToOperatingCF, // Higher is better
          fcfConversion: netIncome !== 0 ? freeCashFlow / netIncome : 0
        }
      };
    });

    res.json({
      symbol: symbol.toUpperCase(),
      period_type,
      count: breakdown.length,
      breakdown
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/companies/:symbol/analysis
 * Get comprehensive analysis data including quality scores, peer comparison, valuation history
 * Query params:
 *   - period_type: 'annual' or 'quarterly' (default 'annual')
 */
router.get('/:symbol/analysis', (req, res) => {
  try {
    const { symbol } = req.params;
    const { period_type = 'annual' } = req.query;

    const company = database.prepare(
      'SELECT * FROM companies WHERE symbol = ? COLLATE NOCASE'
    ).get(symbol.toUpperCase());

    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    // Get financial data for scores calculation
    const balanceSheets = database.prepare(`
      SELECT fiscal_date_ending, fiscal_year, data,
             total_assets, total_liabilities, shareholder_equity,
             current_assets, current_liabilities, long_term_debt
      FROM financial_data
      WHERE company_id = ? AND statement_type = 'balance_sheet' AND period_type = ?
      ORDER BY fiscal_date_ending DESC
      LIMIT 5
    `).all(company.id, period_type);

    const incomeStatements = database.prepare(`
      SELECT fiscal_date_ending, fiscal_year, data,
             total_revenue, net_income, operating_income, gross_profit
      FROM financial_data
      WHERE company_id = ? AND statement_type = 'income_statement' AND period_type = ?
      ORDER BY fiscal_date_ending DESC
      LIMIT 5
    `).all(company.id, period_type);

    const cashFlows = database.prepare(`
      SELECT fiscal_date_ending, fiscal_year, data,
             operating_cashflow, capital_expenditures
      FROM financial_data
      WHERE company_id = ? AND statement_type = 'cash_flow' AND period_type = ?
      ORDER BY fiscal_date_ending DESC
      LIMIT 5
    `).all(company.id, period_type);

    // Get historical metrics for valuation history
    const metricsHistory = database.prepare(`
      SELECT * FROM calculated_metrics
      WHERE company_id = ? AND period_type = ?
      ORDER BY fiscal_period DESC
      LIMIT 10
    `).all(company.id, period_type);

    // Calculate Piotroski F-Score (0-9 points)
    const piotroskiScore = calculatePiotroskiScore(balanceSheets, incomeStatements, cashFlows);

    // Calculate Altman Z-Score
    const altmanZScore = calculateAltmanZScore(balanceSheets, incomeStatements, company.market_cap);

    // Get peer companies (same industry)
    const peers = database.prepare(`
      SELECT c.id, c.symbol, c.name, c.market_cap,
             m.roic, m.roe, m.net_margin, m.debt_to_equity, m.fcf_yield,
             m.pe_ratio, m.pb_ratio, m.revenue_growth_yoy
      FROM companies c
      JOIN calculated_metrics m ON c.id = m.company_id
      WHERE c.industry = ? AND c.symbol != ? AND c.is_active = 1
        AND m.period_type = ?
        AND m.fiscal_period = (
          SELECT MAX(fiscal_period) FROM calculated_metrics
          WHERE company_id = c.id AND period_type = ?
        )
      ORDER BY c.market_cap DESC
      LIMIT 10
    `).all(company.industry, symbol.toUpperCase(), period_type, period_type);

    // Get sector averages
    const sectorAvg = database.prepare(`
      SELECT
        AVG(m.roic) as avg_roic,
        AVG(m.roe) as avg_roe,
        AVG(m.net_margin) as avg_net_margin,
        AVG(m.debt_to_equity) as avg_debt_to_equity,
        AVG(m.pe_ratio) as avg_pe,
        AVG(m.pb_ratio) as avg_pb,
        COUNT(DISTINCT c.id) as company_count
      FROM companies c
      JOIN calculated_metrics m ON c.id = m.company_id
      WHERE c.sector = ? AND c.is_active = 1 AND m.period_type = ?
        AND m.fiscal_period = (
          SELECT MAX(fiscal_period) FROM calculated_metrics
          WHERE company_id = c.id AND period_type = ?
        )
    `).get(company.sector, period_type, period_type);

    // Calculate capital allocation from cash flow
    const capitalAllocation = calculateCapitalAllocation(cashFlows);

    // Build valuation history
    const valuationHistory = metricsHistory.map(m => ({
      period: m.fiscal_period,
      pe_ratio: m.pe_ratio,
      pb_ratio: m.pb_ratio,
      ps_ratio: m.ps_ratio,
      ev_ebitda: m.ev_ebitda,
      fcf_yield: m.fcf_yield,
      earnings_yield: m.earnings_yield
    }));

    res.json({
      symbol: symbol.toUpperCase(),
      company: {
        name: company.name,
        sector: company.sector,
        industry: company.industry,
        market_cap: company.market_cap
      },
      qualityScores: {
        piotroski: piotroskiScore,
        altmanZ: altmanZScore
      },
      capitalAllocation,
      valuationHistory,
      peerComparison: {
        peers,
        sectorAverage: sectorAvg
      },
      latestMetrics: metricsHistory[0] || null
    });
  } catch (error) {
    console.error('Analysis error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Helper: Calculate Piotroski F-Score
function calculatePiotroskiScore(balanceSheets, incomeStatements, cashFlows) {
  if (balanceSheets.length < 2 || incomeStatements.length < 2 || cashFlows.length < 1) {
    return { score: null, components: {}, interpretation: 'Insufficient data' };
  }

  const current = {
    bs: balanceSheets[0],
    is: incomeStatements[0],
    cf: cashFlows[0]
  };
  const prior = {
    bs: balanceSheets[1],
    is: incomeStatements[1]
  };

  // Parse JSON data
  const currentBSData = JSON.parse(current.bs.data);
  const priorBSData = JSON.parse(prior.bs.data);
  const currentISData = JSON.parse(current.is.data);
  const priorISData = JSON.parse(prior.is.data);
  const currentCFData = JSON.parse(current.cf.data);

  // Extract values
  const netIncome = current.is.net_income || parseFloat(currentISData.netIncome) || 0;
  const totalAssets = current.bs.total_assets || parseFloat(currentBSData.totalAssets) || 1;
  const priorTotalAssets = prior.bs.total_assets || parseFloat(priorBSData.totalAssets) || 1;
  const avgAssets = (totalAssets + priorTotalAssets) / 2;

  const operatingCashFlow = current.cf.operating_cashflow || parseFloat(currentCFData.operatingCashFlow) || 0;

  const currentLiabilities = current.bs.current_liabilities || parseFloat(currentBSData.currentLiabilities) || 1;
  const priorCurrentLiabilities = prior.bs.current_liabilities || parseFloat(priorBSData.currentLiabilities) || 1;
  const currentAssets = current.bs.current_assets || parseFloat(currentBSData.currentAssets) || 0;
  const priorCurrentAssets = prior.bs.current_assets || parseFloat(priorBSData.currentAssets) || 0;

  const longTermDebt = current.bs.long_term_debt || parseFloat(currentBSData.longTermDebt) || 0;
  const priorLongTermDebt = prior.bs.long_term_debt || parseFloat(priorBSData.longTermDebt) || 0;

  const grossProfit = current.is.gross_profit || parseFloat(currentISData.grossProfit) || 0;
  const priorGrossProfit = prior.is.gross_profit || parseFloat(priorISData.grossProfit) || 0;
  const revenue = current.is.total_revenue || parseFloat(currentISData.revenue) || 1;
  const priorRevenue = prior.is.total_revenue || parseFloat(priorISData.revenue) || 1;

  const sharesOutstanding = parseFloat(currentBSData.commonSharesOutstanding) || parseFloat(currentBSData.CommonStockSharesOutstanding) || 1;
  const priorSharesOutstanding = parseFloat(priorBSData.commonSharesOutstanding) || parseFloat(priorBSData.CommonStockSharesOutstanding) || 1;

  // Calculate ratios
  const roa = netIncome / avgAssets;
  const priorROA = (prior.is.net_income || parseFloat(priorISData.netIncome) || 0) / priorTotalAssets;
  const currentRatio = currentAssets / currentLiabilities;
  const priorCurrentRatio = priorCurrentAssets / priorCurrentLiabilities;
  const grossMargin = grossProfit / revenue;
  const priorGrossMargin = priorGrossProfit / priorRevenue;
  const assetTurnover = revenue / avgAssets;
  const priorAssetTurnover = priorRevenue / priorTotalAssets;

  // Score components (1 point each if condition is met)
  const components = {
    // Profitability (4 points)
    positiveNetIncome: netIncome > 0 ? 1 : 0,
    positiveROA: roa > 0 ? 1 : 0,
    positiveCFO: operatingCashFlow > 0 ? 1 : 0,
    cfoGreaterThanNetIncome: operatingCashFlow > netIncome ? 1 : 0, // Accrual quality

    // Leverage & Liquidity (3 points)
    decreasingLeverage: longTermDebt <= priorLongTermDebt ? 1 : 0,
    increasingCurrentRatio: currentRatio >= priorCurrentRatio ? 1 : 0,
    noNewShares: sharesOutstanding <= priorSharesOutstanding ? 1 : 0,

    // Operating Efficiency (2 points)
    increasingGrossMargin: grossMargin >= priorGrossMargin ? 1 : 0,
    increasingAssetTurnover: assetTurnover >= priorAssetTurnover ? 1 : 0
  };

  const score = Object.values(components).reduce((sum, val) => sum + val, 0);

  let interpretation;
  if (score >= 8) interpretation = 'Strong - High quality stock';
  else if (score >= 6) interpretation = 'Good - Above average quality';
  else if (score >= 4) interpretation = 'Average - Mixed signals';
  else if (score >= 2) interpretation = 'Weak - Below average quality';
  else interpretation = 'Very Weak - Potential value trap';

  return {
    score,
    maxScore: 9,
    components,
    interpretation,
    period: current.is.fiscal_date_ending
  };
}

// Helper: Calculate Altman Z-Score
function calculateAltmanZScore(balanceSheets, incomeStatements, marketCap) {
  if (balanceSheets.length < 1 || incomeStatements.length < 1) {
    return { score: null, interpretation: 'Insufficient data' };
  }

  const bs = balanceSheets[0];
  const is = incomeStatements[0];
  const bsData = JSON.parse(bs.data);
  const isData = JSON.parse(is.data);

  const totalAssets = bs.total_assets || parseFloat(bsData.totalAssets) || 1;
  const totalLiabilities = bs.total_liabilities || parseFloat(bsData.totalLiabilities) || 0;
  const currentAssets = bs.current_assets || parseFloat(bsData.currentAssets) || 0;
  const currentLiabilities = bs.current_liabilities || parseFloat(bsData.currentLiabilities) || 0;
  const retainedEarnings = parseFloat(bsData.retainedEarnings) || parseFloat(bsData.RetainedEarningsAccumulatedDeficit) || 0;

  const revenue = is.total_revenue || parseFloat(isData.revenue) || 0;
  const operatingIncome = is.operating_income || parseFloat(isData.operatingIncome) || 0;

  // Use EBIT approximation
  const ebit = operatingIncome;

  // Working capital
  const workingCapital = currentAssets - currentLiabilities;

  // Market value of equity (use market cap if available, else book value)
  const bookEquity = totalAssets - totalLiabilities;
  const marketEquity = marketCap || bookEquity;

  // Altman Z-Score formula (for public manufacturing companies)
  // Z = 1.2*A + 1.4*B + 3.3*C + 0.6*D + 1.0*E
  const A = workingCapital / totalAssets;  // Working Capital / Total Assets
  const B = retainedEarnings / totalAssets; // Retained Earnings / Total Assets
  const C = ebit / totalAssets;             // EBIT / Total Assets
  const D = marketEquity / totalLiabilities; // Market Value Equity / Total Liabilities
  const E = revenue / totalAssets;          // Sales / Total Assets

  const zScore = (1.2 * A) + (1.4 * B) + (3.3 * C) + (0.6 * D) + (1.0 * E);

  let interpretation, zone;
  if (zScore > 2.99) {
    interpretation = 'Safe Zone - Low bankruptcy risk';
    zone = 'safe';
  } else if (zScore >= 1.81) {
    interpretation = 'Grey Zone - Moderate risk, needs monitoring';
    zone = 'grey';
  } else {
    interpretation = 'Distress Zone - High bankruptcy risk';
    zone = 'distress';
  }

  return {
    score: parseFloat(zScore.toFixed(2)),
    zone,
    components: {
      workingCapitalRatio: parseFloat(A.toFixed(4)),
      retainedEarningsRatio: parseFloat(B.toFixed(4)),
      ebitRatio: parseFloat(C.toFixed(4)),
      marketToDebtRatio: parseFloat(D.toFixed(4)),
      assetTurnover: parseFloat(E.toFixed(4))
    },
    interpretation,
    period: bs.fiscal_date_ending
  };
}

// Helper: Calculate Capital Allocation
function calculateCapitalAllocation(cashFlows) {
  if (cashFlows.length < 1) {
    return null;
  }

  const allocations = cashFlows.map(cf => {
    const data = JSON.parse(cf.data);

    const operatingCF = cf.operating_cashflow || parseFloat(data.operatingCashFlow) || 0;
    const capex = Math.abs(cf.capital_expenditures || parseFloat(data.capitalExpenditures) || parseFloat(data.PaymentsToAcquirePropertyPlantAndEquipment) || 0);
    const dividends = Math.abs(parseFloat(data.dividends) || parseFloat(data.PaymentsOfDividends) || 0);
    const buybacks = Math.abs(parseFloat(data.stockRepurchase) || parseFloat(data.PaymentsForRepurchaseOfCommonStock) || 0);
    const debtRepayment = Math.abs(parseFloat(data.debtRepayment) || parseFloat(data.RepaymentsOfLongTermDebt) || 0);
    const debtIssuance = parseFloat(data.debtIssuance) || parseFloat(data.ProceedsFromIssuanceOfLongTermDebt) || 0;
    const acquisitions = Math.abs(parseFloat(data.acquisitions) || parseFloat(data.PaymentsToAcquireBusinessesNetOfCashAcquired) || 0);

    const fcf = operatingCF - capex;
    const totalReturned = dividends + buybacks;
    const netDebtChange = debtIssuance - debtRepayment;

    return {
      period: cf.fiscal_date_ending,
      operatingCashFlow: operatingCF,
      capex: -capex,
      freeCashFlow: fcf,
      dividends: -dividends,
      buybacks: -buybacks,
      totalReturned: -totalReturned,
      debtRepayment: -debtRepayment,
      debtIssuance,
      netDebtChange,
      acquisitions: -acquisitions,
      // Percentages of FCF
      dividendPayoutRatio: fcf > 0 ? (dividends / fcf) * 100 : null,
      buybackRatio: fcf > 0 ? (buybacks / fcf) * 100 : null,
      reinvestmentRate: fcf > 0 ? (capex / fcf) * 100 : null
    };
  });

  return allocations;
}

/**
 * GET /api/companies/:symbol/news
 * Get news, SEC filings, and analyst estimates
 */
router.get('/:symbol/news', async (req, res) => {
  try {
    const { symbol } = req.params;

    const company = database.prepare(
      'SELECT * FROM companies WHERE symbol = ? COLLATE NOCASE'
    ).get(symbol.toUpperCase());

    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    // Get CIK if we have it (for SEC filings)
    const cik = company.cik || null;

    const newsData = await newsService.getCompanyNewsAndEvents(symbol, cik);

    res.json(newsData);
  } catch (error) {
    console.error('News API error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
// src/services/portfolio/investorService.js
// Service for managing famous investors and fetching 13F filings from SEC EDGAR

const db = require('../../database').db;
const { SEC_13F_CONFIG, HOLDING_CHANGE_TYPES } = require('../../constants/portfolio');

// Rate limiting for SEC requests
let lastRequestTime = 0;
const rateLimitedFetch = async (url, options = {}) => {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  if (timeSinceLastRequest < SEC_13F_CONFIG.RATE_LIMIT_MS) {
    await new Promise(resolve => setTimeout(resolve, SEC_13F_CONFIG.RATE_LIMIT_MS - timeSinceLastRequest));
  }
  lastRequestTime = Date.now();

  const headers = {
    'User-Agent': SEC_13F_CONFIG.USER_AGENT,
    'Accept': 'application/json, application/xml, text/xml, */*',
    ...options.headers
  };

  const response = await fetch(url, { ...options, headers });
  if (!response.ok) {
    throw new Error(`SEC request failed: ${response.status} ${response.statusText}`);
  }
  return response;
};

// ============================================
// Investor CRUD Operations
// ============================================

/**
 * Get all famous investors
 */
function getAllInvestors() {
  const stmt = db.prepare(`
    SELECT
      fi.*,
      (SELECT COUNT(*) FROM investor_holdings ih WHERE ih.investor_id = fi.id AND ih.filing_date = fi.latest_filing_date) as current_positions
    FROM famous_investors fi
    WHERE fi.is_active = 1
    ORDER BY fi.display_order ASC
  `);
  return stmt.all();
}

/**
 * Get single investor by ID with stats
 */
function getInvestor(id) {
  const investor = db.prepare(`
    SELECT * FROM famous_investors WHERE id = ?
  `).get(id);

  if (!investor) return null;

  // Get filing history
  const filings = db.prepare(`
    SELECT * FROM investor_filings
    WHERE investor_id = ?
    ORDER BY filing_date DESC
    LIMIT 8
  `).all(id);

  // Get change summary from latest filing
  const changeSummary = db.prepare(`
    SELECT
      change_type,
      COUNT(*) as count,
      SUM(market_value) as total_value
    FROM investor_holdings
    WHERE investor_id = ? AND filing_date = ?
    GROUP BY change_type
  `).all(id, investor.latest_filing_date);

  return {
    ...investor,
    filings,
    changeSummary
  };
}

/**
 * Get investor by CIK
 */
function getInvestorByCik(cik) {
  return db.prepare('SELECT * FROM famous_investors WHERE cik = ?').get(cik);
}

// ============================================
// Holdings Operations
// ============================================

/**
 * Get latest holdings for an investor
 * Consolidates multiple entries for the same CUSIP (voting authority splits)
 * Includes current price and performance since filing
 * Enhanced with first appearance date tracking for entry point analysis
 */
function getLatestHoldings(investorId, { limit = 100, sortBy = 'market_value', sortOrder = 'DESC', includePerformance = true } = {}) {
  const investor = db.prepare('SELECT latest_filing_date FROM famous_investors WHERE id = ?').get(investorId);
  if (!investor || !investor.latest_filing_date) {
    return { holdings: [], filingDate: null, totalValue: 0 };
  }

  const validSortColumns = ['market_value', 'shares', 'portfolio_weight', 'shares_change_pct', 'security_name', 'gain_loss_pct', 'entry_gain_loss_pct'];
  const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'market_value';
  const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  // Consolidate holdings by CUSIP (13F filings report separate entries for voting authority)
  // Include current price, filing date price, AND first appearance date for entry point tracking
  const holdings = db.prepare(`
    SELECT
      MIN(ih.id) as id,
      ih.investor_id,
      ih.company_id,
      ih.filing_date,
      ih.report_date,
      ih.cusip,
      MAX(ih.security_name) as security_name,
      SUM(ih.shares) as shares,
      SUM(ih.market_value) as market_value,
      SUM(ih.portfolio_weight) as portfolio_weight,
      SUM(ih.prev_shares) as prev_shares,
      SUM(ih.shares_change) as shares_change,
      CASE
        WHEN SUM(ih.prev_shares) > 0 THEN (SUM(ih.shares_change) * 100.0 / SUM(ih.prev_shares))
        ELSE 0
      END as shares_change_pct,
      SUM(ih.value_change) as value_change,
      MAX(ih.change_type) as change_type,
      MAX(ih.created_at) as created_at,
      c.symbol,
      c.name as company_name,
      c.sector,
      c.industry,
      c.market_cap,
      -- Get current price (latest available)
      (SELECT dp.close FROM daily_prices dp
       WHERE dp.company_id = c.id
       ORDER BY dp.date DESC LIMIT 1) as current_price,
      -- Get price on or near filing date
      (SELECT dp.close FROM daily_prices dp
       WHERE dp.company_id = c.id AND dp.date <= ih.filing_date
       ORDER BY dp.date DESC LIMIT 1) as filing_price,
      -- Get latest price date
      (SELECT dp.date FROM daily_prices dp
       WHERE dp.company_id = c.id
       ORDER BY dp.date DESC LIMIT 1) as price_date,
      -- FIRST APPEARANCE DATE TRACKING: When this position first appeared in any filing
      (SELECT MIN(ih2.filing_date) FROM investor_holdings ih2
       WHERE ih2.investor_id = ih.investor_id AND ih2.cusip = ih.cusip) as first_filing_date,
      -- Get price on or near first filing date (entry price estimate)
      (SELECT dp.close FROM daily_prices dp
       WHERE dp.company_id = c.id
       AND dp.date <= (SELECT MIN(ih2.filing_date) FROM investor_holdings ih2
                       WHERE ih2.investor_id = ih.investor_id AND ih2.cusip = ih.cusip)
       ORDER BY dp.date DESC LIMIT 1) as entry_price
    FROM investor_holdings ih
    LEFT JOIN companies c ON ih.company_id = c.id
    WHERE ih.investor_id = ? AND ih.filing_date = ?
    GROUP BY ih.cusip
    ORDER BY ${sortColumn} ${order}
    LIMIT ?
  `).all(investorId, investor.latest_filing_date, limit);

  // Calculate performance metrics for each holding
  // Now includes both filing-based and entry-point-based performance
  const holdingsWithPerformance = holdings.map(h => {
    let gain_loss_pct = null;
    let gain_loss_value = null;
    let current_value = null;
    let entry_gain_loss_pct = null;
    let entry_gain_loss_value = null;
    let holding_period_days = null;

    // Performance since latest filing
    if (h.current_price && h.filing_price && h.filing_price > 0) {
      gain_loss_pct = ((h.current_price - h.filing_price) / h.filing_price) * 100;
      current_value = h.shares * h.current_price;
      gain_loss_value = current_value - h.market_value;
    }

    // Performance since first appearance (entry point tracking)
    if (h.current_price && h.entry_price && h.entry_price > 0) {
      entry_gain_loss_pct = ((h.current_price - h.entry_price) / h.entry_price) * 100;
      entry_gain_loss_value = current_value ? (current_value - (h.shares * h.entry_price)) : null;
    }

    // Calculate holding period in days
    if (h.first_filing_date) {
      const firstDate = new Date(h.first_filing_date);
      const today = new Date();
      holding_period_days = Math.floor((today - firstDate) / (1000 * 60 * 60 * 24));
    }

    return {
      ...h,
      gain_loss_pct,
      gain_loss_value,
      current_value,
      entry_gain_loss_pct,
      entry_gain_loss_value,
      holding_period_days
    };
  });

  // Re-sort if sorting by performance columns (not handled by SQL)
  if (sortBy === 'gain_loss_pct') {
    holdingsWithPerformance.sort((a, b) => {
      const aVal = a.gain_loss_pct ?? -Infinity;
      const bVal = b.gain_loss_pct ?? -Infinity;
      return order === 'DESC' ? bVal - aVal : aVal - bVal;
    });
  } else if (sortBy === 'entry_gain_loss_pct') {
    holdingsWithPerformance.sort((a, b) => {
      const aVal = a.entry_gain_loss_pct ?? -Infinity;
      const bVal = b.entry_gain_loss_pct ?? -Infinity;
      return order === 'DESC' ? bVal - aVal : aVal - bVal;
    });
  }

  const totalValue = holdings.reduce((sum, h) => sum + (h.market_value || 0), 0);
  const totalCurrentValue = holdingsWithPerformance.reduce((sum, h) => sum + (h.current_value || 0), 0);
  const totalGainLoss = totalCurrentValue - totalValue;
  const totalGainLossPct = totalValue > 0 ? (totalGainLoss / totalValue) * 100 : 0;

  return {
    holdings: holdingsWithPerformance,
    filingDate: investor.latest_filing_date,
    totalValue,
    totalCurrentValue: totalCurrentValue || null,
    totalGainLoss: totalGainLoss || null,
    totalGainLossPct: totalGainLossPct || null,
    positionsCount: holdings.length
  };
}

/**
 * Get holding changes from latest filing
 * Consolidates by CUSIP for accurate change tracking
 */
function getHoldingChanges(investorId) {
  const investor = db.prepare('SELECT latest_filing_date FROM famous_investors WHERE id = ?').get(investorId);
  if (!investor || !investor.latest_filing_date) {
    return { new: [], increased: [], decreased: [], sold: [], unchanged: [] };
  }

  // Consolidate by CUSIP to get accurate totals
  const holdings = db.prepare(`
    SELECT
      ih.cusip,
      MAX(ih.security_name) as security_name,
      ih.company_id,
      SUM(ih.shares) as shares,
      SUM(ih.market_value) as market_value,
      SUM(ih.portfolio_weight) as portfolio_weight,
      SUM(ih.prev_shares) as prev_shares,
      SUM(ih.shares_change) as shares_change,
      CASE
        WHEN SUM(ih.prev_shares) > 0 THEN (SUM(ih.shares_change) * 100.0 / SUM(ih.prev_shares))
        ELSE 0
      END as shares_change_pct,
      SUM(ih.value_change) as value_change,
      MAX(ih.change_type) as change_type,
      c.symbol,
      c.name as company_name,
      c.sector
    FROM investor_holdings ih
    LEFT JOIN companies c ON ih.company_id = c.id
    WHERE ih.investor_id = ? AND ih.filing_date = ?
    GROUP BY ih.cusip
    ORDER BY SUM(ih.market_value) DESC
  `).all(investorId, investor.latest_filing_date);

  return {
    new: holdings.filter(h => h.change_type === HOLDING_CHANGE_TYPES.NEW),
    increased: holdings.filter(h => h.change_type === HOLDING_CHANGE_TYPES.INCREASED),
    decreased: holdings.filter(h => h.change_type === HOLDING_CHANGE_TYPES.DECREASED),
    sold: holdings.filter(h => h.change_type === HOLDING_CHANGE_TYPES.SOLD),
    unchanged: holdings.filter(h => h.change_type === HOLDING_CHANGE_TYPES.UNCHANGED)
  };
}

/**
 * Get investors who own a specific stock
 */
function getInvestorsByStock(companyId) {
  return db.prepare(`
    SELECT
      fi.id,
      fi.name,
      fi.fund_name,
      fi.investment_style,
      ih.shares,
      ih.market_value,
      ih.portfolio_weight,
      ih.change_type,
      ih.shares_change_pct,
      ih.filing_date
    FROM investor_holdings ih
    JOIN famous_investors fi ON ih.investor_id = fi.id
    WHERE ih.company_id = ?
      AND ih.filing_date = fi.latest_filing_date
      AND fi.is_active = 1
    ORDER BY ih.market_value DESC
  `).all(companyId);
}

/**
 * Get investors by stock symbol
 */
function getInvestorsBySymbol(symbol) {
  const company = db.prepare('SELECT id FROM companies WHERE symbol = ? COLLATE NOCASE').get(symbol);
  if (!company) return [];
  return getInvestorsByStock(company.id);
}

/**
 * Get holdings history for an investor
 */
function getHoldingsHistory(investorId, { periods = 4 } = {}) {
  const filings = db.prepare(`
    SELECT DISTINCT filing_date
    FROM investor_holdings
    WHERE investor_id = ?
    ORDER BY filing_date DESC
    LIMIT ?
  `).all(investorId, periods);

  const history = filings.map(f => {
    const holdings = db.prepare(`
      SELECT
        ih.*,
        c.symbol,
        c.name as company_name
      FROM investor_holdings ih
      LEFT JOIN companies c ON ih.company_id = c.id
      WHERE ih.investor_id = ? AND ih.filing_date = ?
      ORDER BY ih.market_value DESC
    `).all(investorId, f.filing_date);

    return {
      filingDate: f.filing_date,
      holdings,
      totalValue: holdings.reduce((sum, h) => sum + (h.market_value || 0), 0),
      positionsCount: holdings.length
    };
  });

  return history;
}

/**
 * Get portfolio performance based on actual stock price changes
 * This calculates weighted returns for each quarter using holdings and price data
 * Also includes S&P 500 comparison for alpha calculation
 */
function getPortfolioReturns(investorId, { limit = 50 } = {}) {
  // Get all report dates for this investor
  const dates = db.prepare(`
    SELECT DISTINCT report_date
    FROM investor_holdings
    WHERE investor_id = ?
    ORDER BY report_date ASC
    LIMIT ?
  `).all(investorId, limit);

  if (dates.length < 2) {
    return { returns: [], summary: null, benchmark: null };
  }

  const quarterlyReturns = [];

  for (let i = 0; i < dates.length - 1; i++) {
    const startDate = dates[i].report_date;
    const endDate = dates[i + 1].report_date;

    // Get holdings at start of period with weights
    const holdings = db.prepare(`
      SELECT
        c.id as company_id,
        c.symbol,
        SUM(h.market_value) as position_value
      FROM investor_holdings h
      JOIN companies c ON h.company_id = c.id
      WHERE h.investor_id = ? AND h.report_date = ?
        AND c.symbol IS NOT NULL
      GROUP BY c.id
    `).all(investorId, startDate);

    if (holdings.length === 0) continue;

    const totalValue = holdings.reduce((sum, h) => sum + h.position_value, 0);

    // Calculate weighted return for this quarter
    let weightedReturn = 0;
    let matchedWeight = 0;

    for (const holding of holdings) {
      const weight = holding.position_value / totalValue;

      // Get prices at start and end of period
      const startPrice = db.prepare(`
        SELECT close FROM daily_prices
        WHERE company_id = ? AND date <= ?
        ORDER BY date DESC LIMIT 1
      `).get(holding.company_id, startDate);

      const endPrice = db.prepare(`
        SELECT close FROM daily_prices
        WHERE company_id = ? AND date <= ?
        ORDER BY date DESC LIMIT 1
      `).get(holding.company_id, endDate);

      if (startPrice?.close && endPrice?.close && startPrice.close > 0) {
        const stockReturn = (endPrice.close - startPrice.close) / startPrice.close;
        weightedReturn += weight * stockReturn;
        matchedWeight += weight;
      }
    }

    // Normalize if we didn't match all holdings
    if (matchedWeight > 0 && matchedWeight < 0.5) {
      // Skip quarters where we couldn't match at least 50% of holdings
      continue;
    }

    quarterlyReturns.push({
      startDate,
      endDate,
      return: weightedReturn * 100,
      positions: holdings.length
    });
  }

  // Get S&P 500 returns for the same periods
  const benchmarkReturns = [];
  for (const qtr of quarterlyReturns) {
    const spyReturn = getSpyReturn(qtr.startDate, qtr.endDate);
    benchmarkReturns.push({
      startDate: qtr.startDate,
      endDate: qtr.endDate,
      return: spyReturn
    });
  }

  // Calculate summary statistics
  if (quarterlyReturns.length === 0) {
    return { returns: [], summary: null, benchmark: null };
  }

  // Calculate cumulative returns
  let portfolioCumulative = 1.0;
  let benchmarkCumulative = 1.0;

  const returnsWithBenchmark = quarterlyReturns.map((qtr, i) => {
    portfolioCumulative *= (1 + qtr.return / 100);
    const benchReturn = benchmarkReturns[i]?.return || 0;
    benchmarkCumulative *= (1 + benchReturn / 100);

    return {
      ...qtr,
      benchmarkReturn: benchReturn,
      alpha: qtr.return - benchReturn,
      cumulativeReturn: (portfolioCumulative - 1) * 100,
      cumulativeBenchmark: (benchmarkCumulative - 1) * 100
    };
  });

  const avgQuarterlyReturn = quarterlyReturns.reduce((sum, q) => sum + q.return, 0) / quarterlyReturns.length;
  const avgBenchmarkReturn = benchmarkReturns.reduce((sum, q) => sum + (q.return || 0), 0) / benchmarkReturns.length;
  const annualizedReturn = (Math.pow(1 + avgQuarterlyReturn / 100, 4) - 1) * 100;
  const annualizedBenchmark = (Math.pow(1 + avgBenchmarkReturn / 100, 4) - 1) * 100;

  const summary = {
    periodCount: quarterlyReturns.length,
    startDate: quarterlyReturns[0].startDate,
    endDate: quarterlyReturns[quarterlyReturns.length - 1].endDate,
    totalReturn: (portfolioCumulative - 1) * 100,
    benchmarkTotalReturn: (benchmarkCumulative - 1) * 100,
    avgQuarterlyReturn,
    avgBenchmarkReturn,
    annualizedReturn,
    annualizedBenchmark,
    alpha: annualizedReturn - annualizedBenchmark,
    positiveQuarters: quarterlyReturns.filter(q => q.return > 0).length,
    negativeQuarters: quarterlyReturns.filter(q => q.return < 0).length,
    bestQuarter: Math.max(...quarterlyReturns.map(q => q.return)),
    worstQuarter: Math.min(...quarterlyReturns.map(q => q.return))
  };

  return {
    returns: returnsWithBenchmark,
    summary
  };
}

/**
 * Get S&P 500 (SPY) return between two dates
 */
function getSpyReturn(startDate, endDate) {
  // Try to get SPY prices from daily_prices
  const spyCompany = db.prepare(`SELECT id FROM companies WHERE symbol = 'SPY'`).get();

  if (!spyCompany) {
    // Fallback to index_prices table
    const startPrice = db.prepare(`
      SELECT close FROM index_prices
      WHERE symbol = 'SPY' AND date <= ?
      ORDER BY date DESC LIMIT 1
    `).get(startDate);

    const endPrice = db.prepare(`
      SELECT close FROM index_prices
      WHERE symbol = 'SPY' AND date <= ?
      ORDER BY date DESC LIMIT 1
    `).get(endDate);

    if (startPrice?.close && endPrice?.close && startPrice.close > 0) {
      return ((endPrice.close - startPrice.close) / startPrice.close) * 100;
    }
    return null;
  }

  const startPrice = db.prepare(`
    SELECT close FROM daily_prices
    WHERE company_id = ? AND date <= ?
    ORDER BY date DESC LIMIT 1
  `).get(spyCompany.id, startDate);

  const endPrice = db.prepare(`
    SELECT close FROM daily_prices
    WHERE company_id = ? AND date <= ?
    ORDER BY date DESC LIMIT 1
  `).get(spyCompany.id, endDate);

  if (startPrice?.close && endPrice?.close && startPrice.close > 0) {
    return ((endPrice.close - startPrice.close) / startPrice.close) * 100;
  }
  return null;
}

/**
 * Get portfolio value history for performance charts
 * Returns quarterly portfolio values over time with period-over-period returns
 */
function getPortfolioValueHistory(investorId, { limit = 40 } = {}) {
  // Get filing-level summaries for performance chart
  const filings = db.prepare(`
    SELECT
      if.filing_date,
      if.report_date,
      if.total_value,
      if.positions_count,
      if.new_positions,
      if.increased_positions,
      if.decreased_positions,
      if.sold_positions,
      if.unchanged_positions
    FROM investor_filings if
    WHERE if.investor_id = ?
      AND if.total_value > 0
      AND if.positions_count > 5
    ORDER BY if.filing_date ASC
    LIMIT ?
  `).all(investorId, limit);

  if (filings.length === 0) {
    return { history: [], summary: null };
  }

  // Calculate period-over-period returns
  const historyWithReturns = filings.map((f, index) => {
    let qoq_return = null;
    let qoq_value_change = null;

    if (index > 0) {
      const prevValue = filings[index - 1].total_value;
      if (prevValue > 0) {
        qoq_value_change = f.total_value - prevValue;
        qoq_return = ((f.total_value - prevValue) / prevValue) * 100;
      }
    }

    return {
      date: f.filing_date,
      reportDate: f.report_date,
      value: f.total_value,
      positionsCount: f.positions_count,
      newPositions: f.new_positions,
      increasedPositions: f.increased_positions,
      decreasedPositions: f.decreased_positions,
      soldPositions: f.sold_positions,
      unchangedPositions: f.unchanged_positions,
      qoqReturn: qoq_return,
      qoqValueChange: qoq_value_change
    };
  });

  // Calculate summary statistics
  const returns = historyWithReturns
    .filter(h => h.qoqReturn !== null)
    .map(h => h.qoqReturn);

  const summary = {
    periodCount: filings.length,
    startDate: filings[0].filing_date,
    endDate: filings[filings.length - 1].filing_date,
    startValue: filings[0].total_value,
    endValue: filings[filings.length - 1].total_value,
    totalReturn: filings[0].total_value > 0
      ? ((filings[filings.length - 1].total_value - filings[0].total_value) / filings[0].total_value) * 100
      : null,
    avgQuarterlyReturn: returns.length > 0
      ? returns.reduce((sum, r) => sum + r, 0) / returns.length
      : null,
    bestQuarter: returns.length > 0
      ? { value: Math.max(...returns), index: returns.indexOf(Math.max(...returns)) }
      : null,
    worstQuarter: returns.length > 0
      ? { value: Math.min(...returns), index: returns.indexOf(Math.min(...returns)) }
      : null,
    positiveQuarters: returns.filter(r => r > 0).length,
    negativeQuarters: returns.filter(r => r < 0).length
  };

  // Add best/worst quarter dates
  if (summary.bestQuarter) {
    summary.bestQuarter.date = historyWithReturns[summary.bestQuarter.index + 1]?.date;
  }
  if (summary.worstQuarter) {
    summary.worstQuarter.date = historyWithReturns[summary.worstQuarter.index + 1]?.date;
  }

  return { history: historyWithReturns, summary };
}

// ============================================
// 13F Fetching and Parsing
// ============================================

/**
 * Fetch latest 13F filing for an investor
 */
async function fetch13F(investorId) {
  const investor = getInvestor(investorId);
  if (!investor) {
    throw new Error(`Investor not found: ${investorId}`);
  }

  console.log(`📄 Fetching 13F for ${investor.name} (CIK: ${investor.cik})`);

  try {
    // Get filing list from SEC EDGAR
    const filings = await getFilingsList(investor.cik);
    if (!filings || filings.length === 0) {
      console.log(`⚠️ No 13F filings found for ${investor.name}`);
      return { success: false, message: 'No filings found' };
    }

    const latestFiling = filings[0];
    console.log(`📥 Found filing: ${latestFiling.filingDate}`);

    // Check if we already have this filing
    const existingFiling = db.prepare(`
      SELECT id FROM investor_filings
      WHERE investor_id = ? AND accession_number = ?
    `).get(investorId, latestFiling.accessionNumber);

    if (existingFiling) {
      console.log(`✅ Filing already processed`);
      return { success: true, message: 'Filing already exists', existing: true };
    }

    // Fetch and parse the filing
    const holdings = await parseInfoTable(investor.cik, latestFiling.accessionNumber);
    console.log(`📊 Parsed ${holdings.length} positions`);

    // Get previous holdings for comparison
    const previousHoldings = getPreviousHoldings(investorId);

    // Match CUSIPs to companies and calculate changes
    const processedHoldings = await processHoldings(holdings, previousHoldings);

    // Store holdings
    storeHoldings(investorId, latestFiling, processedHoldings);

    console.log(`✅ Stored ${processedHoldings.length} holdings for ${investor.name}`);

    return {
      success: true,
      filingDate: latestFiling.filingDate,
      positionsCount: processedHoldings.length,
      totalValue: processedHoldings.reduce((sum, h) => sum + h.value, 0)
    };

  } catch (error) {
    console.error(`❌ Error fetching 13F for ${investor.name}:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Get list of 13F filings for a CIK
 */
async function getFilingsList(cik) {
  const cleanCik = cik.replace(/^0+/, '');
  const url = `https://data.sec.gov/submissions/CIK${cik}.json`;

  const response = await rateLimitedFetch(url);
  const data = await response.json();

  const filings = [];
  const recent = data.filings?.recent || {};

  if (recent.form && recent.accessionNumber && recent.filingDate) {
    for (let i = 0; i < recent.form.length; i++) {
      if (recent.form[i] === '13F-HR' || recent.form[i] === '13F-HR/A') {
        filings.push({
          form: recent.form[i],
          accessionNumber: recent.accessionNumber[i],
          filingDate: recent.filingDate[i],
          reportDate: recent.reportDate?.[i] || recent.filingDate[i]
        });
      }
    }
  }

  return filings;
}

/**
 * Parse 13F infotable XML
 */
async function parseInfoTable(cik, accessionNumber) {
  const cleanAccession = accessionNumber.replace(/-/g, '');
  const baseUrl = `https://www.sec.gov/Archives/edgar/data/${cik.replace(/^0+/, '')}/${cleanAccession}`;

  // First get the index to find the infotable file
  const indexUrl = `${baseUrl}/index.json`;
  const indexResponse = await rateLimitedFetch(indexUrl);
  const indexData = await indexResponse.json();

  const items = indexData.directory?.item || [];

  // Find the infotable file - try multiple patterns
  let infoTableFile = items.find(
    item => item.name?.toLowerCase().includes('infotable') &&
            (item.name?.endsWith('.xml') || item.name?.endsWith('.XML'))
  );

  // If no infotable named file, look for XML files that aren't primary_doc
  if (!infoTableFile) {
    infoTableFile = items.find(
      item => item.name?.endsWith('.xml') &&
              !item.name?.toLowerCase().includes('primary_doc') &&
              !item.name?.includes('-index')
    );
  }

  // Last resort: check primary_doc.xml
  if (!infoTableFile) {
    infoTableFile = items.find(
      item => item.name?.toLowerCase() === 'primary_doc.xml'
    );
  }

  if (!infoTableFile) {
    throw new Error('Could not find infotable in filing');
  }

  console.log(`📑 Parsing ${infoTableFile.name}`);
  const infoTableUrl = `${baseUrl}/${infoTableFile.name}`;
  const xmlResponse = await rateLimitedFetch(infoTableUrl);
  const xmlText = await xmlResponse.text();

  // Parse XML to extract holdings
  const holdings = parseInfoTableXml(xmlText);
  return holdings;
}

/**
 * Parse infotable XML text into holdings array
 */
function parseInfoTableXml(xmlText) {
  const holdings = [];

  // Extract infoTable entries using regex (simple XML parsing)
  const entryRegex = /<infoTable[^>]*>([\s\S]*?)<\/infoTable>/gi;
  const entries = xmlText.match(entryRegex) || [];

  for (const entry of entries) {
    const getValue = (tag) => {
      const regex = new RegExp(`<${tag}[^>]*>([^<]*)<\/${tag}>`, 'i');
      const match = entry.match(regex);
      return match ? match[1].trim() : null;
    };

    const cusip = getValue('cusip');
    const nameOfIssuer = getValue('nameOfIssuer');
    const value = parseFloat(getValue('value')) * 1000; // Value is in thousands
    const shares = parseFloat(getValue('sshPrnamt') || getValue('shrsOrPrnAmt>sshPrnamt'));

    if (cusip && value) {
      holdings.push({
        cusip,
        securityName: nameOfIssuer,
        value,
        shares: shares || 0
      });
    }
  }

  // If regex parsing failed, try alternative format
  if (holdings.length === 0) {
    const altEntryRegex = /<ns1:infoTable[^>]*>([\s\S]*?)<\/ns1:infoTable>/gi;
    const altEntries = xmlText.match(altEntryRegex) || [];

    for (const entry of altEntries) {
      const getValue = (tag) => {
        const regex = new RegExp(`<ns1:${tag}[^>]*>([^<]*)<\/ns1:${tag}>`, 'i');
        const match = entry.match(regex);
        return match ? match[1].trim() : null;
      };

      const cusip = getValue('cusip');
      const nameOfIssuer = getValue('nameOfIssuer');
      const value = parseFloat(getValue('value')) * 1000;
      const shares = parseFloat(getValue('sshPrnamt'));

      if (cusip && value) {
        holdings.push({
          cusip,
          securityName: nameOfIssuer,
          value,
          shares: shares || 0
        });
      }
    }
  }

  return holdings;
}

/**
 * Get previous holdings for comparison
 */
function getPreviousHoldings(investorId) {
  const investor = db.prepare('SELECT latest_filing_date FROM famous_investors WHERE id = ?').get(investorId);
  if (!investor?.latest_filing_date) return new Map();

  const holdings = db.prepare(`
    SELECT cusip, shares, market_value
    FROM investor_holdings
    WHERE investor_id = ? AND filing_date = ?
  `).all(investorId, investor.latest_filing_date);

  return new Map(holdings.map(h => [h.cusip, h]));
}

/**
 * Process holdings - match to companies and calculate changes
 */
async function processHoldings(holdings, previousHoldings) {
  const processed = [];
  const unmappedSecurities = [];
  const totalValue = holdings.reduce((sum, h) => sum + h.value, 0);

  for (const holding of holdings) {
    // Try to find company by CUSIP
    let companyId = null;
    const cusipMapping = db.prepare('SELECT company_id, symbol FROM cusip_mapping WHERE cusip = ?').get(holding.cusip);

    if (cusipMapping?.company_id) {
      companyId = cusipMapping.company_id;
    } else {
      // Try to match by name
      const company = findCompanyByName(holding.securityName);
      if (company) {
        companyId = company.id;
        // Save mapping for future
        db.prepare(`
          INSERT OR REPLACE INTO cusip_mapping (cusip, symbol, company_id, security_name)
          VALUES (?, ?, ?, ?)
        `).run(holding.cusip, company.symbol, company.id, holding.securityName);
      } else {
        // Track unmapped security
        unmappedSecurities.push({
          cusip: holding.cusip,
          securityName: holding.securityName,
          value: holding.value,
          shares: holding.shares
        });
      }
    }

    // Calculate change from previous period
    const prev = previousHoldings.get(holding.cusip);
    let changeType = HOLDING_CHANGE_TYPES.NEW;
    let sharesChange = 0;
    let sharesChangePct = 0;
    let valueChange = 0;
    let prevShares = null;

    if (prev) {
      prevShares = prev.shares;
      sharesChange = holding.shares - prev.shares;
      sharesChangePct = prev.shares > 0 ? (sharesChange / prev.shares) * 100 : 0;
      valueChange = holding.value - prev.market_value;

      if (Math.abs(sharesChangePct) < 1) {
        changeType = HOLDING_CHANGE_TYPES.UNCHANGED;
      } else if (sharesChange > 0) {
        changeType = HOLDING_CHANGE_TYPES.INCREASED;
      } else {
        changeType = HOLDING_CHANGE_TYPES.DECREASED;
      }
    }

    processed.push({
      cusip: holding.cusip,
      securityName: holding.securityName,
      companyId,
      shares: holding.shares,
      value: holding.value,
      weight: totalValue > 0 ? (holding.value / totalValue) * 100 : 0,
      prevShares,
      sharesChange,
      sharesChangePct,
      valueChange,
      changeType
    });
  }

  // Add sold positions
  for (const [cusip, prev] of previousHoldings) {
    if (!holdings.find(h => h.cusip === cusip)) {
      const cusipMapping = db.prepare('SELECT company_id FROM cusip_mapping WHERE cusip = ?').get(cusip);
      processed.push({
        cusip,
        securityName: prev.security_name || 'Unknown',
        companyId: cusipMapping?.company_id,
        shares: 0,
        value: 0,
        weight: 0,
        prevShares: prev.shares,
        sharesChange: -prev.shares,
        sharesChangePct: -100,
        valueChange: -prev.market_value,
        changeType: HOLDING_CHANGE_TYPES.SOLD
      });
    }
  }

  // Log unmapped securities summary
  if (unmappedSecurities.length > 0) {
    const unmappedValue = unmappedSecurities.reduce((sum, u) => sum + u.value, 0);
    console.log(`⚠️ ${unmappedSecurities.length} unmapped securities worth $${(unmappedValue / 1000000).toFixed(1)}M`);
  }

  // Store unmapped securities for tracking
  storeUnmappedSecurities(unmappedSecurities);

  return processed;
}

/**
 * Store unmapped securities for later review/mapping
 */
function storeUnmappedSecurities(securities) {
  if (securities.length === 0) return;

  // Ensure table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS unmapped_securities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cusip TEXT UNIQUE NOT NULL,
      security_name TEXT,
      last_value REAL,
      last_shares REAL,
      occurrence_count INTEGER DEFAULT 1,
      first_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      manually_reviewed INTEGER DEFAULT 0,
      notes TEXT
    )
  `);

  const upsert = db.prepare(`
    INSERT INTO unmapped_securities (cusip, security_name, last_value, last_shares)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(cusip) DO UPDATE SET
      security_name = excluded.security_name,
      last_value = excluded.last_value,
      last_shares = excluded.last_shares,
      occurrence_count = occurrence_count + 1,
      last_seen_at = CURRENT_TIMESTAMP
  `);

  for (const security of securities) {
    upsert.run(security.cusip, security.securityName, security.value, security.shares);
  }
}

/**
 * Find company by name (fuzzy match)
 */
function findCompanyByName(name) {
  if (!name) return null;

  // Clean up the name for matching
  const cleanName = name.toUpperCase()
    .replace(/\s+(INC|CORP|CO|LTD|LLC|PLC|CLASS\s+[A-Z]|CL\s+[A-Z]|COM|COMMON|NEW)\.?$/i, '')
    .replace(/[^A-Z0-9\s]/g, '')
    .trim();

  // Try exact match first
  let company = db.prepare(`
    SELECT id, symbol FROM companies
    WHERE UPPER(name) LIKE ?
    LIMIT 1
  `).get(`%${cleanName}%`);

  if (!company) {
    // Try matching on first word(s)
    const firstWords = cleanName.split(/\s+/).slice(0, 2).join(' ');
    company = db.prepare(`
      SELECT id, symbol FROM companies
      WHERE UPPER(name) LIKE ?
      LIMIT 1
    `).get(`${firstWords}%`);
  }

  return company;
}

/**
 * Store holdings in database
 */
function storeHoldings(investorId, filing, holdings) {
  const insertHolding = db.prepare(`
    INSERT INTO investor_holdings (
      investor_id, company_id, filing_date, report_date, cusip, security_name,
      shares, market_value, portfolio_weight, prev_shares, shares_change,
      shares_change_pct, value_change, change_type
    ) VALUES (
      @investorId, @companyId, @filingDate, @reportDate, @cusip, @securityName,
      @shares, @value, @weight, @prevShares, @sharesChange,
      @sharesChangePct, @valueChange, @changeType
    )
  `);

  const insertFiling = db.prepare(`
    INSERT OR REPLACE INTO investor_filings (
      investor_id, filing_date, report_date, accession_number, filing_url,
      total_value, positions_count, new_positions, increased_positions,
      decreased_positions, sold_positions, unchanged_positions
    ) VALUES (
      @investorId, @filingDate, @reportDate, @accessionNumber, @filingUrl,
      @totalValue, @positionsCount, @newPositions, @increasedPositions,
      @decreasedPositions, @soldPositions, @unchangedPositions
    )
  `);

  const updateInvestor = db.prepare(`
    UPDATE famous_investors SET
      latest_filing_date = ?,
      latest_filing_url = ?,
      latest_portfolio_value = ?,
      latest_positions_count = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);

  const transaction = db.transaction(() => {
    // Count change types
    const counts = {
      new: 0,
      increased: 0,
      decreased: 0,
      sold: 0,
      unchanged: 0
    };

    for (const h of holdings) {
      insertHolding.run({
        investorId,
        companyId: h.companyId,
        filingDate: filing.filingDate,
        reportDate: filing.reportDate,
        cusip: h.cusip,
        securityName: h.securityName,
        shares: h.shares,
        value: h.value,
        weight: h.weight,
        prevShares: h.prevShares,
        sharesChange: h.sharesChange,
        sharesChangePct: h.sharesChangePct,
        valueChange: h.valueChange,
        changeType: h.changeType
      });

      if (h.changeType) counts[h.changeType]++;
    }

    const totalValue = holdings.reduce((sum, h) => sum + h.value, 0);
    const activePositions = holdings.filter(h => h.changeType !== HOLDING_CHANGE_TYPES.SOLD).length;

    // Build proper SEC filing URL with accession number for direct access
    const accessionFormatted = filing.accessionNumber?.replace(/-/g, '') || '';
    const filingUrl = filing.accessionNumber
      ? `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${filing.cik}&type=13F-HR&dateb=&owner=include&count=40&search_text=`
      : `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${filing.cik}&type=13F-HR`;

    insertFiling.run({
      investorId,
      filingDate: filing.filingDate,
      reportDate: filing.reportDate,
      accessionNumber: filing.accessionNumber,
      filingUrl,
      totalValue,
      positionsCount: activePositions,
      newPositions: counts.new,
      increasedPositions: counts.increased,
      decreasedPositions: counts.decreased,
      soldPositions: counts.sold,
      unchangedPositions: counts.unchanged
    });

    updateInvestor.run(
      filing.filingDate,
      `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${filing.cik}&type=13F-HR`,
      totalValue,
      activePositions,
      investorId
    );
  });

  transaction();
}

/**
 * Fetch 13F for all active investors
 */
async function fetchAll13Fs() {
  const investors = getAllInvestors();
  const results = [];

  for (const investor of investors) {
    try {
      const result = await fetch13F(investor.id);
      results.push({ investor: investor.name, ...result });
      // Add delay between investors
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      results.push({ investor: investor.name, success: false, error: error.message });
    }
  }

  return results;
}

// ============================================
// Portfolio Cloning
// ============================================

/**
 * Clone investor portfolio to a new portfolio
 * Note: Actual portfolio creation is done by Agent 1's PortfolioService
 * This function prepares the clone data
 */
function prepareClone(investorId, options = {}) {
  const {
    amount = 10000,
    minWeight = 0,
    maxPositions = null,
    excludeSymbols = []
  } = options;

  const { holdings, filingDate, totalValue } = getLatestHoldings(investorId, { limit: 1000 });

  if (!holdings.length) {
    throw new Error('No holdings found for investor');
  }

  // Filter and sort holdings
  let filteredHoldings = holdings
    .filter(h => h.symbol && h.portfolio_weight >= minWeight)
    .filter(h => !excludeSymbols.includes(h.symbol))
    .sort((a, b) => b.portfolio_weight - a.portfolio_weight);

  if (maxPositions) {
    filteredHoldings = filteredHoldings.slice(0, maxPositions);
  }

  // Normalize weights
  const totalWeight = filteredHoldings.reduce((sum, h) => sum + h.portfolio_weight, 0);

  // Calculate trades
  const trades = filteredHoldings.map(h => {
    const normalizedWeight = h.portfolio_weight / totalWeight;
    const tradeValue = amount * normalizedWeight;

    return {
      symbol: h.symbol,
      companyId: h.company_id,
      weight: normalizedWeight * 100,
      targetValue: tradeValue,
      originalWeight: h.portfolio_weight
    };
  });

  // Increment follower count
  db.prepare('UPDATE famous_investors SET followers_count = followers_count + 1 WHERE id = ?').run(investorId);

  return {
    investorId,
    investorName: getInvestor(investorId).name,
    filingDate,
    amount,
    trades,
    positionsCount: trades.length,
    excludedCount: holdings.length - filteredHoldings.length
  };
}

// ============================================
// Statistics and Analytics
// ============================================

/**
 * Get investor statistics
 * Consolidates by CUSIP for accurate sector allocation and top positions
 */
function getInvestorStats(investorId) {
  const investor = getInvestor(investorId);
  if (!investor) return null;

  // Get sector allocation (consolidated by CUSIP first, then by sector)
  const sectorAllocation = db.prepare(`
    SELECT
      sector,
      SUM(total_value) as total_value,
      SUM(total_weight) as total_weight,
      COUNT(*) as positions
    FROM (
      SELECT
        c.sector,
        ih.cusip,
        SUM(ih.market_value) as total_value,
        SUM(ih.portfolio_weight) as total_weight
      FROM investor_holdings ih
      LEFT JOIN companies c ON ih.company_id = c.id
      WHERE ih.investor_id = ? AND ih.filing_date = ?
      GROUP BY ih.cusip, c.sector
    )
    GROUP BY sector
    ORDER BY total_value DESC
  `).all(investorId, investor.latest_filing_date);

  // Get top positions (consolidated by CUSIP)
  const topPositions = db.prepare(`
    SELECT
      ih.cusip,
      MAX(ih.security_name) as security_name,
      ih.company_id,
      SUM(ih.shares) as shares,
      SUM(ih.market_value) as market_value,
      SUM(ih.portfolio_weight) as portfolio_weight,
      c.symbol,
      c.name as company_name
    FROM investor_holdings ih
    LEFT JOIN companies c ON ih.company_id = c.id
    WHERE ih.investor_id = ? AND ih.filing_date = ?
    GROUP BY ih.cusip
    ORDER BY SUM(ih.portfolio_weight) DESC
    LIMIT 10
  `).all(investorId, investor.latest_filing_date);

  return {
    ...investor,
    sectorAllocation,
    topPositions
  };
}

/**
 * Get stocks most owned by famous investors
 */
function getMostOwnedStocks(limit = 20) {
  return db.prepare(`
    SELECT
      c.id,
      c.symbol,
      c.name,
      c.sector,
      COUNT(DISTINCT ih.investor_id) as investor_count,
      SUM(ih.market_value) as total_value,
      AVG(ih.portfolio_weight) as avg_weight,
      GROUP_CONCAT(DISTINCT fi.name) as investors
    FROM investor_holdings ih
    JOIN companies c ON ih.company_id = c.id
    JOIN famous_investors fi ON ih.investor_id = fi.id
    WHERE ih.filing_date = fi.latest_filing_date
      AND ih.change_type != 'sold'
    GROUP BY c.id
    HAVING investor_count >= 2
    ORDER BY investor_count DESC, total_value DESC
    LIMIT ?
  `).all(limit);
}

/**
 * Get recent investor activity (new buys, sells)
 */
function getRecentActivity(limit = 50) {
  return db.prepare(`
    SELECT
      ih.*,
      c.symbol,
      c.name as company_name,
      fi.name as investor_name,
      fi.fund_name
    FROM investor_holdings ih
    JOIN famous_investors fi ON ih.investor_id = fi.id
    LEFT JOIN companies c ON ih.company_id = c.id
    WHERE ih.filing_date = fi.latest_filing_date
      AND ih.change_type IN ('new', 'increased', 'sold')
    ORDER BY
      CASE ih.change_type WHEN 'new' THEN 1 WHEN 'sold' THEN 2 ELSE 3 END,
      ih.market_value DESC
    LIMIT ?
  `).all(limit);
}

// ============================================
// Unmapped Securities Management
// ============================================

/**
 * Get all unmapped securities
 */
function getUnmappedSecurities({ limit = 100, sortBy = 'last_value', onlyUnreviewed = false } = {}) {
  let query = `
    SELECT * FROM unmapped_securities
    ${onlyUnreviewed ? 'WHERE manually_reviewed = 0' : ''}
    ORDER BY ${sortBy === 'occurrence_count' ? 'occurrence_count' : 'last_value'} DESC
    LIMIT ?
  `;

  try {
    return db.prepare(query).all(limit);
  } catch (e) {
    // Table might not exist yet
    return [];
  }
}

/**
 * Get unmapped securities summary
 */
function getUnmappedSecuritiesSummary() {
  try {
    const stats = db.prepare(`
      SELECT
        COUNT(*) as total_count,
        SUM(last_value) as total_value,
        SUM(CASE WHEN manually_reviewed = 0 THEN 1 ELSE 0 END) as unreviewed_count,
        SUM(CASE WHEN manually_reviewed = 0 THEN last_value ELSE 0 END) as unreviewed_value,
        MAX(last_seen_at) as last_updated
      FROM unmapped_securities
    `).get();
    return stats || { total_count: 0, total_value: 0, unreviewed_count: 0, unreviewed_value: 0 };
  } catch (e) {
    return { total_count: 0, total_value: 0, unreviewed_count: 0, unreviewed_value: 0 };
  }
}

/**
 * Map an unmapped security to a company
 */
function mapSecurityToCompany(cusip, companyId, symbol) {
  // Add to cusip_mapping
  const security = db.prepare('SELECT security_name FROM unmapped_securities WHERE cusip = ?').get(cusip);

  db.prepare(`
    INSERT OR REPLACE INTO cusip_mapping (cusip, symbol, company_id, security_name)
    VALUES (?, ?, ?, ?)
  `).run(cusip, symbol, companyId, security?.security_name);

  // Mark as reviewed
  db.prepare(`
    UPDATE unmapped_securities SET manually_reviewed = 1, notes = 'Mapped to ' || ? WHERE cusip = ?
  `).run(symbol, cusip);

  return { success: true, cusip, mappedTo: symbol };
}

/**
 * Mark unmapped security as reviewed (skip)
 */
function markSecurityReviewed(cusip, notes = null) {
  db.prepare(`
    UPDATE unmapped_securities SET manually_reviewed = 1, notes = ? WHERE cusip = ?
  `).run(notes || 'Manually skipped', cusip);

  return { success: true, cusip };
}

/**
 * Delete unmapped security entry
 */
function deleteUnmappedSecurity(cusip) {
  const result = db.prepare('DELETE FROM unmapped_securities WHERE cusip = ?').run(cusip);
  return { success: result.changes > 0, cusip };
}

module.exports = {
  // Investor operations
  getAllInvestors,
  getInvestor,
  getInvestorByCik,

  // Holdings operations
  getLatestHoldings,
  getHoldingChanges,
  getInvestorsByStock,
  getInvestorsBySymbol,
  getHoldingsHistory,
  getPortfolioValueHistory,
  getPortfolioReturns,

  // 13F fetching
  fetch13F,
  fetchAll13Fs,

  // Portfolio cloning
  prepareClone,

  // Statistics
  getInvestorStats,
  getMostOwnedStocks,
  getRecentActivity,

  // Unmapped securities
  getUnmappedSecurities,
  getUnmappedSecuritiesSummary,
  mapSecurityToCompany,
  markSecurityReviewed,
  deleteUnmappedSecurity
};

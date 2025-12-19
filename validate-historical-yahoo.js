/**
 * Validate historical revenue/earnings data against Yahoo Finance
 * and investigate formula differences
 */

const db = require('./src/database').getDatabase();

async function validateHistoricalData() {
  const yf = await import('yahoo-finance2');
  const YahooFinance = yf.default;
  const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

  const companies = ['AAPL', 'MSFT', 'GOOGL', 'NVDA', 'AMZN'];

  console.log('='.repeat(70));
  console.log('HISTORICAL DATA VALIDATION: Our SEC Data vs Yahoo Finance');
  console.log('='.repeat(70));

  for (const symbol of companies) {
    console.log(`\n${'━'.repeat(70)}`);
    console.log(`${symbol}`);
    console.log('━'.repeat(70));

    try {
      // Get Yahoo historical data
      const summary = await yahooFinance.quoteSummary(symbol, {
        modules: ['earnings', 'financialData', 'defaultKeyStatistics', 'incomeStatementHistory']
      });

      const yahooYearly = summary.earnings?.financialsChart?.yearly || [];
      const fd = summary.financialData || {};
      const ks = summary.defaultKeyStatistics || {};

      // Get our historical data
      const ourData = db.prepare(`
        SELECT
          f.fiscal_year,
          f.fiscal_date_ending,
          MAX(CASE WHEN json_extract(f.data, '$.totalRevenue') IS NOT NULL
              THEN json_extract(f.data, '$.totalRevenue')
              ELSE json_extract(f.data, '$.Revenues') END) as revenue,
          MAX(CASE WHEN json_extract(f.data, '$.netIncome') IS NOT NULL
              THEN json_extract(f.data, '$.netIncome')
              ELSE json_extract(f.data, '$.NetIncomeLoss') END) as net_income,
          MAX(json_extract(f.data, '$.grossProfit')) as gross_profit,
          MAX(json_extract(f.data, '$.operatingIncome')) as operating_income,
          MAX(json_extract(f.data, '$.totalAssets')) as total_assets,
          MAX(CASE WHEN json_extract(f.data, '$.stockholdersEquity') IS NOT NULL
              THEN json_extract(f.data, '$.stockholdersEquity')
              ELSE json_extract(f.data, '$.StockholdersEquity') END) as equity
        FROM financial_data f
        JOIN companies c ON c.id = f.company_id
        WHERE c.symbol = ?
          AND f.period_type = 'annual'
          AND f.statement_type IN ('income_statement', 'balance_sheet')
        GROUP BY f.fiscal_year
        ORDER BY f.fiscal_year DESC
        LIMIT 5
      `).all(symbol);

      // Compare historical revenue/earnings
      console.log('\n1. HISTORICAL REVENUE & EARNINGS COMPARISON:');
      console.log('   Year     Our Revenue      Yahoo Revenue    Diff%    Our Earnings    Yahoo Earnings   Diff%');
      console.log('   ' + '-'.repeat(90));

      for (const yahooYear of yahooYearly) {
        const year = yahooYear.date;
        const ourYear = ourData.find(d => d.fiscal_year == year);

        if (ourYear && ourYear.revenue) {
          const ourRev = ourYear.revenue / 1e9;
          const yahooRev = yahooYear.revenue / 1e9;
          const revDiff = ((ourRev - yahooRev) / yahooRev * 100).toFixed(1);

          const ourEarn = ourYear.net_income / 1e9;
          const yahooEarn = yahooYear.earnings / 1e9;
          const earnDiff = ((ourEarn - yahooEarn) / yahooEarn * 100).toFixed(1);

          const revMatch = Math.abs(parseFloat(revDiff)) < 2 ? '✓' : '✗';
          const earnMatch = Math.abs(parseFloat(earnDiff)) < 5 ? '✓' : '✗';

          console.log(`   ${year}     $${ourRev.toFixed(1)}B          $${yahooRev.toFixed(1)}B          ${revDiff}% ${revMatch}   $${ourEarn.toFixed(1)}B          $${yahooEarn.toFixed(1)}B          ${earnDiff}% ${earnMatch}`);
        } else {
          console.log(`   ${year}     N/A               $${(yahooYear.revenue/1e9).toFixed(1)}B                    N/A              $${(yahooYear.earnings/1e9).toFixed(1)}B`);
        }
      }

      // Compare current TTM metrics
      console.log('\n2. CURRENT TTM METRICS COMPARISON:');

      // Get our TTM metrics
      const ourMetrics = db.prepare(`
        SELECT * FROM calculated_metrics m
        JOIN companies c ON c.id = m.company_id
        WHERE c.symbol = ? AND m.period_type = 'quarterly'
        ORDER BY m.fiscal_period DESC
        LIMIT 4
      `).all(symbol);

      if (ourMetrics.length >= 4) {
        const avg = (key) => {
          const vals = ourMetrics.map(m => m[key]).filter(v => v != null);
          return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
        };

        const comparisons = [
          { name: 'Gross Margin', ours: avg('gross_margin'), yahoo: fd.grossMargins ? fd.grossMargins * 100 : null },
          { name: 'Operating Margin', ours: avg('operating_margin'), yahoo: fd.operatingMargins ? fd.operatingMargins * 100 : null },
          { name: 'Net Margin', ours: avg('net_margin'), yahoo: fd.profitMargins ? fd.profitMargins * 100 : null },
          { name: 'ROE', ours: avg('roe'), yahoo: fd.returnOnEquity ? fd.returnOnEquity * 100 : null },
          { name: 'ROA', ours: avg('roa'), yahoo: fd.returnOnAssets ? fd.returnOnAssets * 100 : null },
          { name: 'Current Ratio', ours: ourMetrics[0].current_ratio, yahoo: fd.currentRatio },
          { name: 'Quick Ratio', ours: ourMetrics[0].quick_ratio, yahoo: fd.quickRatio },
          { name: 'Debt/Equity', ours: ourMetrics[0].debt_to_equity, yahoo: fd.debtToEquity ? fd.debtToEquity / 100 : null },
        ];

        console.log('   Metric              Ours        Yahoo       Diff%    Status');
        console.log('   ' + '-'.repeat(60));

        for (const c of comparisons) {
          if (c.ours != null && c.yahoo != null) {
            const diff = c.yahoo !== 0 ? ((c.ours - c.yahoo) / Math.abs(c.yahoo) * 100) : 0;
            const status = Math.abs(diff) < 15 ? '✓ CLOSE' : Math.abs(diff) < 30 ? '⚠ DIFF' : '✗ MAJOR';
            console.log(`   ${c.name.padEnd(18)} ${c.ours.toFixed(2).padStart(8)}    ${c.yahoo.toFixed(2).padStart(8)}    ${diff.toFixed(1).padStart(6)}%   ${status}`);
          } else {
            console.log(`   ${c.name.padEnd(18)} ${(c.ours?.toFixed(2) || 'N/A').padStart(8)}    ${(c.yahoo?.toFixed(2) || 'N/A').padStart(8)}    N/A`);
          }
        }
      }

      // Delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 600));

    } catch (error) {
      console.log(`   Error: ${error.message}`);
    }
  }

  // Formula investigation
  console.log('\n' + '='.repeat(70));
  console.log('FORMULA INVESTIGATION');
  console.log('='.repeat(70));

  console.log(`
Based on the comparisons above, here are the likely formula differences:

1. OPERATING MARGIN:
   - Our formula: Operating Income / Revenue
   - Yahoo likely uses: EBIT / Revenue (includes non-operating items)
   - OR: Yahoo excludes certain items like stock-based compensation

2. ROA (Return on Assets):
   - Our formula: Net Income / Total Assets (point-in-time)
   - Yahoo likely uses: Net Income / Average Total Assets (avg of 2 periods)
   - This explains why our ROA is often higher

3. ROE (Return on Equity):
   - Our formula: Net Income / Shareholders' Equity (point-in-time)
   - Yahoo likely uses: Net Income / Average Shareholders' Equity
   - For companies with growing/shrinking equity, this creates differences

4. GROSS MARGIN for Financials:
   - Banks/insurers don't have traditional COGS
   - Our formula: (Revenue - COGS) / Revenue = 100% when COGS is null
   - Yahoo: Returns null or uses different calculation for financials

5. DEBT-TO-EQUITY:
   - Our formula: Total Debt / Shareholders' Equity
   - Yahoo likely uses: Total Debt / Total Equity (may include minority interests)
   - Different debt definitions (include/exclude leases, etc.)
`);
}

validateHistoricalData().catch(console.error);

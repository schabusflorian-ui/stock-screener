/**
 * Quiver Quantitative Service
 *
 * Fetches and processes congressional trading data, government contracts,
 * and lobbying activity from Quiver Quantitative API.
 *
 * Features:
 * - Congressional stock trades with signal scoring
 * - Government contract tracking
 * - Politician track record analysis
 * - Time-decay weighted signals
 *
 * API: https://www.quiverquant.com/
 * Requires: QUIVER_API_KEY (optional for some endpoints)
 */

const https = require('https');
const { getDatabaseAsync, isUsingPostgres } = require('../../lib/db');

class QuiverQuantitativeService {
  constructor() {
    // No database parameter needed - using getDatabaseAsync()
    this.apiKey = process.env.QUIVER_API_KEY;
    this.baseUrl = 'api.quiverquant.com';

    // Signal weights
    this.TRANSACTION_WEIGHTS = {
      // Purchase signals (positive)
      purchase: {
        tiny: 0.5,      // $1K - $15K
        small: 1.0,     // $15K - $50K
        medium: 2.0,    // $50K - $100K
        large: 2.5,     // $100K - $250K
        xlarge: 3.0     // $250K+
      },
      // Sale signals (less informative, generally negative but smaller weight)
      sale: {
        tiny: -0.1,
        small: -0.3,
        medium: -0.5,
        large: -0.7,
        xlarge: -1.0
      }
    };

    // Time decay factor (half-life in days)
    this.TIME_DECAY_HALFLIFE = 30;
  }

  /**
   * Fetch data from Quiver API
   */
  async fetchApi(endpoint) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: this.baseUrl,
        path: endpoint,
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      };

      if (this.apiKey) {
        options.headers['Authorization'] = `Bearer ${this.apiKey}`;
      }

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            if (res.statusCode === 401) {
              reject(new Error('Quiver API key required or invalid'));
              return;
            }
            if (res.statusCode === 429) {
              reject(new Error('Quiver API rate limit exceeded'));
              return;
            }
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`Failed to parse Quiver response: ${e.message}`));
          }
        });
      });

      req.on('error', reject);
      req.setTimeout(30000, () => {
        req.destroy();
        reject(new Error('Quiver API request timeout'));
      });
      req.end();
    });
  }

  /**
   * Calculate signal score for a transaction
   */
  calculateTransactionSignal(type, amountLow, amountHigh, transactionDate, politicianScore = 0) {
    // Determine amount tier
    const avgAmount = (amountLow + amountHigh) / 2;
    let tier;
    if (avgAmount < 15000) tier = 'tiny';
    else if (avgAmount < 50000) tier = 'small';
    else if (avgAmount < 100000) tier = 'medium';
    else if (avgAmount < 250000) tier = 'large';
    else tier = 'xlarge';

    // Base signal from transaction type and size
    const normalizedType = type.toLowerCase().includes('purchase') ? 'purchase' : 'sale';
    let signal = this.TRANSACTION_WEIGHTS[normalizedType][tier] || 0;

    // Apply time decay
    const daysAgo = (Date.now() - new Date(transactionDate).getTime()) / (1000 * 60 * 60 * 24);
    const decayFactor = Math.exp(-daysAgo * Math.LN2 / this.TIME_DECAY_HALFLIFE);
    signal *= decayFactor;

    // Adjust by politician track record (if available)
    if (politicianScore && politicianScore !== 0) {
      // Boost signal if politician has good track record
      signal *= (1 + politicianScore * 0.5);
    }

    return signal;
  }

  /**
   * Fetch and store congressional trades for a symbol
   */
  async fetchCongressionalTrades(symbol) {
    console.log(`  Fetching congressional trades for ${symbol}...`);

    try {
      const database = await getDatabaseAsync();

      // Try free endpoint first (historical data)
      const data = await this.fetchApi(`/beta/historical/congresstrading/${symbol}`);

      if (!Array.isArray(data) || data.length === 0) {
        console.log(`    No congressional trades found for ${symbol}`);
        return { trades: 0, signal: 0 };
      }

      const companyResult = await database.query(
        'SELECT id FROM companies WHERE symbol = $1',
        [symbol]
      );
      const companyRow = companyResult.rows[0];
      const companyId = companyRow?.id || null;

      let totalSignal = 0;
      let tradeCount = 0;

      for (const trade of data) {
        // Get or create politician
        const politicianResult = await database.query(
          'SELECT id, track_record_score FROM congressional_politicians WHERE name = $1',
          [trade.Representative]
        );
        const politicianRow = politicianResult.rows[0];
        let politicianId = politicianRow?.id;
        const politicianScore = politicianRow?.track_record_score || 0;

        if (!politicianId) {
          const insertResult = await database.query(`
            INSERT INTO congressional_politicians (
              name, title, state, party, chamber, district, in_office
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT(name, chamber) DO UPDATE SET
              title = excluded.title,
              state = excluded.state,
              party = excluded.party,
              updated_at = CURRENT_TIMESTAMP
            RETURNING id
          `, [
            trade.Representative,
            trade.House === 'Senate' ? 'Senator' : 'Representative',
            trade.District?.substring(0, 2) || null,
            trade.Party || null,
            trade.House || null,
            trade.District || null,
            1
          ]);
          politicianId = insertResult.rows[0].id;
        }

        // Parse amounts
        const amountLow = this.parseAmount(trade.Range, 'low');
        const amountHigh = this.parseAmount(trade.Range, 'high');

        // Calculate signal
        const signal = this.calculateTransactionSignal(
          trade.Transaction,
          amountLow,
          amountHigh,
          trade.TransactionDate,
          politicianScore
        );

        // Store trade
        await database.query(`
          INSERT INTO congressional_trades (
            politician_id, company_id, ticker,
            transaction_date, filing_date, transaction_type,
            asset_type, amount_min, amount_max, asset_description, amount_range, source
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          ON CONFLICT(politician_id, transaction_date, asset_description, amount_range) DO UPDATE SET
            filing_date = excluded.filing_date,
            amount_min = excluded.amount_min,
            amount_max = excluded.amount_max
        `, [
          politicianId,
          companyId,
          symbol,
          trade.TransactionDate,
          trade.DisclosureDate || trade.TransactionDate,
          trade.Transaction.toLowerCase().includes('purchase') ? 'purchase' : 'sale',
          trade.AssetType || 'Stock',
          amountLow,
          amountHigh,
          trade.AssetDescription || null,
          trade.Range || null,
          'quiver'
        ]);

        totalSignal += signal;
        tradeCount++;
      }

      console.log(`    Stored ${tradeCount} trades, net signal: ${totalSignal.toFixed(2)}`);
      return { trades: tradeCount, signal: totalSignal };

    } catch (error) {
      console.error(`    Error fetching trades for ${symbol}: ${error.message}`);
      return { trades: 0, signal: 0, error: error.message };
    }
  }

  /**
   * Parse Quiver amount range string
   */
  parseAmount(range, type) {
    if (!range) return 0;

    // Common ranges: "$1,001 - $15,000", "$15,001 - $50,000", etc.
    const cleanRange = range.replace(/\$/g, '').replace(/,/g, '');
    const parts = cleanRange.split('-').map(p => parseInt(p.trim()) || 0);

    if (type === 'low') return parts[0] || 0;
    if (type === 'high') return parts[1] || parts[0] || 0;
    return (parts[0] + (parts[1] || parts[0])) / 2;
  }

  /**
   * Fetch government contracts for a symbol
   */
  async fetchGovernmentContracts(symbol) {
    console.log(`  Fetching government contracts for ${symbol}...`);

    try {
      const database = await getDatabaseAsync();

      const data = await this.fetchApi(`/beta/historical/govcontracts/${symbol}`);

      if (!Array.isArray(data) || data.length === 0) {
        console.log(`    No government contracts found for ${symbol}`);
        return { contracts: 0, totalValue: 0, signal: 0 };
      }

      const companyResult = await database.query(
        'SELECT id FROM companies WHERE symbol = $1',
        [symbol]
      );
      const companyRow = companyResult.rows[0];
      const companyId = companyRow?.id || null;

      // Get market cap for relative sizing
      let marketCap = 0;
      if (companyId) {
        const marketCapResult = await database.query(
          'SELECT market_cap FROM price_metrics WHERE company_id = $1',
          [companyId]
        );
        const marketCapRow = marketCapResult.rows[0];
        marketCap = marketCapRow?.market_cap || 0;
      }

      let totalValue = 0;
      let contractCount = 0;
      let totalSignal = 0;

      for (const contract of data) {
        const amount = contract.Amount || 0;
        totalValue += amount;

        // Calculate signal based on contract value relative to market cap
        let signal = 0;
        if (marketCap > 0) {
          const ratio = amount / marketCap;
          if (ratio > 0.10) signal = 1.0;       // >10% of market cap - huge
          else if (ratio > 0.05) signal = 0.8;  // 5-10%
          else if (ratio > 0.01) signal = 0.5;  // 1-5%
          else if (ratio > 0.001) signal = 0.2; // 0.1-1%
          else signal = 0.1;                    // <0.1%
        } else {
          // No market cap - use absolute thresholds
          if (amount > 1000000000) signal = 1.0;      // >$1B
          else if (amount > 100000000) signal = 0.7;  // >$100M
          else if (amount > 10000000) signal = 0.4;   // >$10M
          else signal = 0.1;
        }

        // Time decay
        const daysAgo = (Date.now() - new Date(contract.Date).getTime()) / (1000 * 60 * 60 * 24);
        const decayFactor = Math.exp(-daysAgo * Math.LN2 / 60); // 60 day half-life for contracts
        signal *= decayFactor;

        await database.query(`
          INSERT INTO government_contracts (
            company_id, symbol, contract_id, agency, description,
            amount, award_date, completion_date, contract_type,
            naics_code, psc_code, is_competitive, source, signal_score
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
          ON CONFLICT(contract_id) DO UPDATE SET
            amount = excluded.amount,
            signal_score = excluded.signal_score
        `, [
          companyId,
          symbol,
          contract.Id || `${symbol}-${contract.Date}-${amount}`,
          contract.Agency || 'Unknown',
          contract.Description || null,
          amount,
          contract.Date,
          null,
          null,
          null,
          null,
          null,
          'quiver',
          signal
        ]);

        totalSignal += signal;
        contractCount++;
      }

      console.log(`    Stored ${contractCount} contracts, total value: $${(totalValue / 1e6).toFixed(1)}M`);
      return { contracts: contractCount, totalValue, signal: totalSignal };

    } catch (error) {
      console.error(`    Error fetching contracts for ${symbol}: ${error.message}`);
      return { contracts: 0, totalValue: 0, signal: 0, error: error.message };
    }
  }

  /**
   * Calculate aggregate congressional signal for a symbol
   */
  async getCongressSignal(symbol, lookbackDays = '-90 days') {
    const database = await getDatabaseAsync();

    // Parse lookbackDays string and build dialect-aware date filter
    let dateCondition;
    if (isUsingPostgres()) {
      const match = lookbackDays.match(/^-(\d+)\s+days?$/);
      const days = match ? match[1] : '90';
      dateCondition = `ct.transaction_date >= CURRENT_DATE - INTERVAL '${days} days'`;
    } else {
      dateCondition = `ct.transaction_date >= date('now', '${lookbackDays}')`;
    }

    const result = await database.query(`
      SELECT ct.*, cp.track_record_score
      FROM congressional_trades ct
      LEFT JOIN congressional_politicians cp ON ct.politician_id = cp.id
      WHERE ct.ticker = $1
        AND ${dateCondition}
      ORDER BY ct.transaction_date DESC
    `, [symbol]);
    const trades = result.rows;

    if (trades.length === 0) {
      return {
        signal: null,
        buyCount: 0,
        sellCount: 0,
        netAmount: 0,
        confidence: 0,
        politicians: []
      };
    }

    let totalSignal = 0;
    let buyCount = 0;
    let sellCount = 0;
    let netAmount = 0;
    const politicians = new Set();

    for (const trade of trades) {
      totalSignal += trade.signal_score || 0;

      if (trade.transaction_type === 'purchase') {
        buyCount++;
        netAmount += ((trade.amount_min || 0) + (trade.amount_max || 0)) / 2;
      } else {
        sellCount++;
        netAmount -= ((trade.amount_min || 0) + (trade.amount_max || 0)) / 2;
      }

      if (trade.politician_id) {
        politicians.add(trade.politician_id);
      }
    }

    // Multiple politicians buying is a stronger signal
    const consensusFactor = Math.min(politicians.size / 3, 2);
    totalSignal *= consensusFactor;

    // Normalize to -1 to +1 range
    const normalizedSignal = Math.max(-1, Math.min(1, totalSignal / 5));

    // Confidence based on trade count
    const confidence = Math.min(trades.length / 5, 1);

    return {
      signal: normalizedSignal,
      rawSignal: totalSignal,
      buyCount,
      sellCount,
      netAmount,
      tradeCount: trades.length,
      confidence,
      politicians: Array.from(politicians)
    };
  }

  /**
   * Get government contract signal for a symbol
   */
  async getContractSignal(symbol, lookbackDays = '-365 days') {
    const database = await getDatabaseAsync();

    // Build dialect-aware date filter
    const dateCondition = isUsingPostgres()
      ? `award_date >= CURRENT_DATE + INTERVAL '${lookbackDays}'`
      : `award_date >= date('now', '${lookbackDays}')`;

    const result = await database.query(`
      SELECT * FROM government_contracts
      WHERE symbol = $1
        AND ${dateCondition}
      ORDER BY award_date DESC
    `, [symbol]);
    const contracts = result.rows;

    if (contracts.length === 0) {
      return {
        signal: null,
        contractCount: 0,
        totalValue: 0,
        confidence: 0
      };
    }

    let totalSignal = 0;
    let totalValue = 0;

    for (const contract of contracts) {
      totalSignal += contract.signal_score || 0;
      totalValue += contract.amount || 0;
    }

    // Normalize to 0 to +1 range (contracts are always bullish)
    const normalizedSignal = Math.min(1, totalSignal / 3);

    // Confidence based on contract count and value
    const confidence = Math.min(contracts.length / 3, 1);

    return {
      signal: normalizedSignal,
      rawSignal: totalSignal,
      contractCount: contracts.length,
      totalValue,
      confidence
    };
  }

  /**
   * Get top congressional buys across all symbols
   */
  async getTopCongressBuys(lookbackDays = '-30 days', limit = 20) {
    const database = await getDatabaseAsync();

    // Parse lookbackDays string (e.g., "-30 days" -> 30)
    // For PostgreSQL, we need CURRENT_DATE - INTERVAL '30 days'
    // For SQLite, we use date('now', '-30 days')
    let dateCondition;
    if (isUsingPostgres()) {
      // Parse "-30 days" or "-90 days" etc.
      const match = lookbackDays.match(/^-(\d+)\s+days?$/);
      const days = match ? match[1] : '30';
      dateCondition = `ct.transaction_date >= CURRENT_DATE - INTERVAL '${days} days'`;
    } else {
      dateCondition = `ct.transaction_date >= date('now', '${lookbackDays}')`;
    }

    // Note: PostgreSQL doesn't have GROUP_CONCAT, use STRING_AGG instead
    const aggregateFunction = isUsingPostgres()
      ? `STRING_AGG(DISTINCT p.full_name, ', ')`
      : `GROUP_CONCAT(DISTINCT p.full_name)`;

    const result = await database.query(`
      SELECT
        COALESCE(ct.ticker, c.symbol) as symbol,
        c.name as company_name,
        COUNT(CASE WHEN ct.transaction_type = 'purchase' THEN 1 END) as buy_count,
        COUNT(CASE WHEN ct.transaction_type = 'sale' THEN 1 END) as sell_count,
        COUNT(CASE WHEN ct.transaction_type = 'purchase' THEN 1 END) as buy_signal,
        ${aggregateFunction} as politicians,
        MAX(ct.transaction_date) as latest_trade,
        SUM(COALESCE(ct.amount_max, 0)) as total_amount
      FROM congressional_trades ct
      LEFT JOIN companies c ON ct.company_id = c.id
      LEFT JOIN politicians p ON ct.politician_id = p.id
      WHERE ${dateCondition}
      GROUP BY COALESCE(ct.ticker, c.symbol), c.name
      HAVING COUNT(CASE WHEN ct.transaction_type = 'purchase' THEN 1 END) > 0
      ORDER BY buy_signal DESC
      LIMIT $1
    `, [limit]);

    return result.rows;
  }

  /**
   * Update politician track records based on stock performance
   */
  async updatePoliticianTrackRecords() {
    console.log('\n📊 Updating politician track records...\n');

    const database = await getDatabaseAsync();

    const politiciansResult = await database.query(`
      SELECT DISTINCT politician_id
      FROM congressional_trades
      WHERE politician_id IS NOT NULL
    `);
    const politicians = politiciansResult.rows;

    for (const pol of politicians) {
      try {
        // Build dialect-aware date calculations
        const dateFilter = isUsingPostgres()
          ? `ct.transaction_date >= CURRENT_DATE - INTERVAL '2 years'`
          : `ct.transaction_date >= date('now', '-2 years')`;

        const date30Condition = isUsingPostgres()
          ? `dp_30.date = ct.transaction_date + INTERVAL '30 days'`
          : `date(dp_30.date) = date(ct.transaction_date, '+30 days')`;

        const date90Condition = isUsingPostgres()
          ? `dp_90.date = ct.transaction_date + INTERVAL '90 days'`
          : `date(dp_90.date) = date(ct.transaction_date, '+90 days')`;

        const tradeDateCondition = isUsingPostgres()
          ? `dp.date = ct.transaction_date`
          : `date(dp.date) = date(ct.transaction_date)`;

        // Get all trades for this politician in last 2 years
        const tradesResult = await database.query(`
          SELECT
            ct.ticker as symbol,
            ct.transaction_date,
            ct.transaction_type,
            ct.amount_min as amount_low,
            ct.amount_max as amount_high,
            dp.close as trade_price,
            dp_30.close as price_30d,
            dp_90.close as price_90d
          FROM congressional_trades ct
          LEFT JOIN companies c ON ct.company_id = c.id
          LEFT JOIN daily_prices dp ON dp.company_id = c.id
            AND ${tradeDateCondition}
          LEFT JOIN daily_prices dp_30 ON dp_30.company_id = c.id
            AND ${date30Condition}
          LEFT JOIN daily_prices dp_90 ON dp_90.company_id = c.id
            AND ${date90Condition}
          WHERE ct.politician_id = $1
            AND ${dateFilter}
            AND ct.transaction_type = 'purchase'
        `, [pol.politician_id]);
        const trades = tradesResult.rows;

        if (trades.length === 0) continue;

        const returns30d = [];
        const returns90d = [];

        for (const trade of trades) {
          if (trade.trade_price && trade.price_30d) {
            returns30d.push((trade.price_30d - trade.trade_price) / trade.trade_price);
          }
          if (trade.trade_price && trade.price_90d) {
            returns90d.push((trade.price_90d - trade.trade_price) / trade.trade_price);
          }
        }

        const avgReturn30d = returns30d.length > 0
          ? returns30d.reduce((a, b) => a + b, 0) / returns30d.length
          : null;

        const avgReturn90d = returns90d.length > 0
          ? returns90d.reduce((a, b) => a + b, 0) / returns90d.length
          : null;

        // Calculate track record score (-1 to +1)
        // Based on: consistent positive returns, beat market, etc.
        let trackScore = 0;
        if (avgReturn30d !== null) {
          if (avgReturn30d > 0.10) trackScore += 0.5;
          else if (avgReturn30d > 0.05) trackScore += 0.3;
          else if (avgReturn30d > 0) trackScore += 0.1;
          else trackScore -= 0.2;
        }
        if (avgReturn90d !== null) {
          if (avgReturn90d > 0.20) trackScore += 0.5;
          else if (avgReturn90d > 0.10) trackScore += 0.3;
          else if (avgReturn90d > 0) trackScore += 0.1;
          else trackScore -= 0.2;
        }

        trackScore = Math.max(-1, Math.min(1, trackScore));

        await database.query(`
          UPDATE congressional_politicians SET
            total_trades = $1,
            avg_return_30d = $2,
            avg_return_90d = $3,
            track_record_score = $4,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = $5
        `, [
          trades.length,
          avgReturn30d,
          avgReturn90d,
          trackScore,
          pol.politician_id
        ]);

      } catch (error) {
        console.error(`  Error updating politician ${pol.politician_id}: ${error.message}`);
      }
    }

    console.log('  Track records updated.\n');
  }

  /**
   * Batch fetch data for multiple symbols
   */
  async batchFetch(symbols, options = {}) {
    const { fetchTrades = true, fetchContracts = true, delayMs = 500 } = options;

    console.log(`\n📊 Batch fetching Quiver data for ${symbols.length} symbols...\n`);

    const results = {};

    for (const symbol of symbols) {
      results[symbol] = { trades: null, contracts: null };

      if (fetchTrades) {
        results[symbol].trades = await this.fetchCongressionalTrades(symbol);
        await new Promise(r => setTimeout(r, delayMs));
      }

      if (fetchContracts) {
        results[symbol].contracts = await this.fetchGovernmentContracts(symbol);
        await new Promise(r => setTimeout(r, delayMs));
      }
    }

    return results;
  }
}

module.exports = { QuiverQuantitativeService };

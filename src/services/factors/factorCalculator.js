// src/services/factors/factorCalculator.js
// Calculates factor scores for individual stocks

const crypto = require('crypto');
const { getDatabaseAsync } = require('../../lib/db');

/**
 * FactorCalculator
 *
 * Computes factor scores for stocks based on:
 * - Value: P/E, P/B, earnings yield, FCF yield
 * - Quality: ROE, ROIC, margins, balance sheet
 * - Growth: Revenue growth, earnings growth
 * - Momentum: Price returns over various periods
 * - Size: Market capitalization
 * - Volatility: Price volatility, beta
 */
class FactorCalculator {
  constructor() {
    // No db needed - using getDatabaseAsync()
  }

  /**
   * Calculate factor scores for all stocks at a given date
   */
  async calculateAllFactorScores(scoreDate, options = {}) {
    const { verbose = false, universeFilter = null } = options;

    if (verbose) {
      console.log(`📊 Calculating factor scores for ${scoreDate}...`);
    }

    // Get all stocks with metrics at this date
    const stocks = await this._getStocksWithMetrics(scoreDate, universeFilter);

    if (stocks.length === 0) {
      if (verbose) console.log('  No stocks with metrics found');
      return { calculated: 0, date: scoreDate };
    }

    if (verbose) {
      console.log(`  Found ${stocks.length} stocks with metrics`);
    }

    // Calculate raw factor values
    const factorValues = [];
    for (const stock of stocks) {
      const factors = await this._calculateRawFactors(stock, scoreDate);
      factorValues.push(factors);
    }

    // Calculate percentile ranks for each factor
    const rankedFactors = this._calculatePercentileRanks(factorValues);

    // Calculate composite scores
    const finalScores = rankedFactors.map(stock => this._calculateCompositeScores(stock));

    // Store scores in database
    const database = await getDatabaseAsync();
    for (const score of finalScores) {
      await database.query(`
        INSERT INTO stock_factor_scores (
          company_id, symbol, score_date,
          value_score, size_score, momentum_score,
          quality_score, profitability_score, investment_score,
          growth_score, volatility_score, beta,
          dividend_score, leverage_score, liquidity_score,
          value_growth_blend, defensive_score,
          value_percentile, quality_percentile, momentum_percentile,
          growth_percentile, size_percentile,
          universe_size, calculation_version, created_at
        ) VALUES (
          $1, $2, $3,
          $4, $5, $6,
          $7, $8, $9,
          $10, $11, $12,
          $13, $14, $15,
          $16, $17,
          $18, $19, $20,
          $21, $22,
          $23, $24, CURRENT_TIMESTAMP
        )
        ON CONFLICT (company_id, score_date) DO UPDATE SET
          value_score = EXCLUDED.value_score,
          size_score = EXCLUDED.size_score,
          momentum_score = EXCLUDED.momentum_score,
          quality_score = EXCLUDED.quality_score,
          profitability_score = EXCLUDED.profitability_score,
          investment_score = EXCLUDED.investment_score,
          growth_score = EXCLUDED.growth_score,
          volatility_score = EXCLUDED.volatility_score,
          beta = EXCLUDED.beta,
          dividend_score = EXCLUDED.dividend_score,
          leverage_score = EXCLUDED.leverage_score,
          liquidity_score = EXCLUDED.liquidity_score,
          value_growth_blend = EXCLUDED.value_growth_blend,
          defensive_score = EXCLUDED.defensive_score,
          value_percentile = EXCLUDED.value_percentile,
          quality_percentile = EXCLUDED.quality_percentile,
          momentum_percentile = EXCLUDED.momentum_percentile,
          growth_percentile = EXCLUDED.growth_percentile,
          size_percentile = EXCLUDED.size_percentile,
          universe_size = EXCLUDED.universe_size,
          calculation_version = EXCLUDED.calculation_version
      `, [
        score.company_id,
        score.symbol,
        scoreDate,
        score.value_score,
        score.size_score,
        score.momentum_score,
        score.quality_score,
        score.profitability_score,
        score.investment_score,
        score.growth_score,
        score.volatility_score,
        score.beta,
        score.dividend_score,
        score.leverage_score,
        score.liquidity_score,
        score.value_growth_blend,
        score.defensive_score,
        score.value_score,
        score.quality_score,
        score.momentum_score,
        score.growth_score,
        score.size_score,
        stocks.length,
        '1.0'
      ]);
    }

    if (verbose) {
      console.log(`  ✅ Calculated ${finalScores.length} factor scores`);
    }

    return { calculated: finalScores.length, date: scoreDate };
  }

  /**
   * Get stocks with metrics at a specific date
   */
  async _getStocksWithMetrics(scoreDate, universeFilter = null) {
    const database = await getDatabaseAsync();

    let query = `
      SELECT
        c.id as company_id,
        c.symbol,
        c.sector,
        c.market_cap,
        cm.pe_ratio,
        cm.pb_ratio,
        cm.ps_ratio,
        cm.earnings_yield,
        cm.fcf_yield,
        cm.dividend_yield,
        cm.roe,
        cm.roic,
        cm.roa,
        cm.gross_margin,
        cm.operating_margin,
        cm.net_margin,
        cm.revenue_growth_yoy,
        cm.earnings_growth_yoy,
        cm.fcf_growth_yoy,
        cm.debt_to_equity,
        cm.debt_to_assets,
        cm.current_ratio,
        cm.interest_coverage,
        cm.asset_turnover,
        pm.avg_volume_30d,
        pm.last_price
      FROM companies c
      JOIN calculated_metrics cm ON c.id = cm.company_id
      LEFT JOIN price_metrics pm ON c.id = pm.company_id
      WHERE cm.fiscal_period <= $1
        AND c.market_cap IS NOT NULL
        AND c.market_cap > 0
    `;

    const params = [scoreDate];
    let paramCount = 1;

    if (universeFilter) {
      if (universeFilter.minMarketCap) {
        paramCount++;
        query += ` AND c.market_cap >= $${paramCount}`;
        params.push(universeFilter.minMarketCap);
      }
      if (universeFilter.sector) {
        paramCount++;
        query += ` AND c.sector = $${paramCount}`;
        params.push(universeFilter.sector);
      }
    }

    query += `
      GROUP BY c.id, c.symbol, c.sector, c.market_cap, cm.pe_ratio, cm.pb_ratio, cm.ps_ratio,
               cm.earnings_yield, cm.fcf_yield, cm.dividend_yield, cm.roe, cm.roic, cm.roa,
               cm.gross_margin, cm.operating_margin, cm.net_margin, cm.revenue_growth_yoy,
               cm.earnings_growth_yoy, cm.fcf_growth_yoy, cm.debt_to_equity, cm.debt_to_assets,
               cm.current_ratio, cm.interest_coverage, cm.asset_turnover, pm.avg_volume_30d,
               pm.last_price, cm.fiscal_period
      HAVING cm.fiscal_period = MAX(cm.fiscal_period)
    `;

    const result = await database.query(query, params);
    return result.rows;
  }

  /**
   * Calculate raw factor values for a single stock
   */
  async _calculateRawFactors(stock, scoreDate) {
    // Get momentum data
    const momentum = await this._calculateMomentum(stock.company_id, scoreDate);

    // Get volatility data
    const volatility = await this._calculateVolatility(stock.company_id, scoreDate);

    // Calculate liquidity metrics
    const liquidity = this._calculateLiquidity(stock);

    return {
      company_id: stock.company_id,
      symbol: stock.symbol,
      sector: stock.sector,

      // Raw values for ranking
      raw_value: {
        pe_ratio: stock.pe_ratio,
        pb_ratio: stock.pb_ratio,
        earnings_yield: stock.earnings_yield || (stock.pe_ratio ? 1 / stock.pe_ratio : null),
        fcf_yield: stock.fcf_yield
      },

      raw_quality: {
        roe: stock.roe,
        roic: stock.roic,
        roa: stock.roa,
        operating_margin: stock.operating_margin,
        net_margin: stock.net_margin,
        current_ratio: stock.current_ratio,
        interest_coverage: stock.interest_coverage
      },

      raw_growth: {
        revenue_growth: stock.revenue_growth_yoy,
        earnings_growth: stock.earnings_growth_yoy,
        fcf_growth: stock.fcf_growth_yoy
      },

      raw_size: {
        market_cap: stock.market_cap
      },

      raw_momentum: momentum,

      raw_volatility: volatility,

      raw_dividend: {
        dividend_yield: stock.dividend_yield
      },

      raw_leverage: {
        debt_to_equity: stock.debt_to_equity,
        debt_to_assets: stock.debt_to_assets
      },

      raw_liquidity: liquidity
    };
  }

  /**
   * Calculate liquidity metrics for a stock
   * Higher dollar volume and turnover indicate better liquidity
   */
  _calculateLiquidity(stock) {
    if (!stock.avg_volume_30d || !stock.last_price || !stock.market_cap) {
      return {
        dollar_volume: null,
        turnover: null
      };
    }

    // Dollar volume = average shares traded * price
    const dollarVolume = stock.avg_volume_30d * stock.last_price;

    // Turnover ratio = dollar volume / market cap (as percentage)
    // Higher turnover = more liquid
    const turnover = (dollarVolume / (stock.market_cap * 1e9)) * 100;

    return {
      dollar_volume: dollarVolume,
      turnover: turnover
    };
  }

  /**
   * Calculate momentum metrics for a stock
   */
  async _calculateMomentum(companyId, scoreDate) {
    const database = await getDatabaseAsync();

    // Get price returns
    const result = await database.query(`
      SELECT date, close
      FROM daily_prices
      WHERE company_id = $1
        AND date <= $2
      ORDER BY date DESC
      LIMIT 252
    `, [companyId, scoreDate]);

    const prices = result.rows;

    if (prices.length < 20) {
      return { return_1m: null, return_3m: null, return_6m: null, return_12m: null };
    }

    const currentPrice = prices[0]?.close;
    const price1m = prices[Math.min(21, prices.length - 1)]?.close;
    const price3m = prices[Math.min(63, prices.length - 1)]?.close;
    const price6m = prices[Math.min(126, prices.length - 1)]?.close;
    const price12m = prices[Math.min(252, prices.length - 1)]?.close;

    return {
      return_1m: price1m ? ((currentPrice - price1m) / price1m) * 100 : null,
      return_3m: price3m ? ((currentPrice - price3m) / price3m) * 100 : null,
      return_6m: price6m ? ((currentPrice - price6m) / price6m) * 100 : null,
      return_12m: price12m ? ((currentPrice - price12m) / price12m) * 100 : null
    };
  }

  /**
   * Calculate volatility metrics for a stock
   */
  async _calculateVolatility(companyId, scoreDate) {
    const database = await getDatabaseAsync();

    // Get daily returns for volatility calculation
    const result = await database.query(`
      SELECT date, close
      FROM daily_prices
      WHERE company_id = $1
        AND date <= $2
      ORDER BY date DESC
      LIMIT 252
    `, [companyId, scoreDate]);

    const prices = result.rows;

    if (prices.length < 60) {
      return { volatility_60d: null, volatility_252d: null, beta: null };
    }

    // Calculate daily returns
    const returns = [];
    for (let i = 0; i < prices.length - 1; i++) {
      if (prices[i].close && prices[i + 1].close) {
        returns.push((prices[i].close - prices[i + 1].close) / prices[i + 1].close);
      }
    }

    // Calculate standard deviation (annualized)
    const calcStdDev = (arr) => {
      const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
      const variance = arr.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / arr.length;
      return Math.sqrt(variance) * Math.sqrt(252); // Annualize
    };

    // Calculate beta against S&P 500
    const beta = await this._calculateBeta(companyId, scoreDate, prices);

    return {
      volatility_60d: returns.length >= 60 ? calcStdDev(returns.slice(0, 60)) * 100 : null,
      volatility_252d: returns.length >= 252 ? calcStdDev(returns) * 100 : null,
      beta
    };
  }

  /**
   * Calculate beta (market sensitivity) for a stock
   * Beta = Covariance(stock returns, market returns) / Variance(market returns)
   */
  async _calculateBeta(companyId, scoreDate, stockPrices = null) {
    const database = await getDatabaseAsync();

    // Get stock prices if not provided
    if (!stockPrices) {
      const result = await database.query(`
        SELECT date, close
        FROM daily_prices
        WHERE company_id = $1
          AND date <= $2
        ORDER BY date DESC
        LIMIT 252
      `, [companyId, scoreDate]);
      stockPrices = result.rows;
    }

    if (stockPrices.length < 60) {
      return null; // Need at least 60 days for beta calculation
    }

    // Get S&P 500 (index_id = 1) prices for the same period
    const oldestStockDate = stockPrices[stockPrices.length - 1].date;
    const marketResult = await database.query(`
      SELECT date, close
      FROM market_index_prices
      WHERE index_id = $1
        AND date <= $2
        AND date >= $3
      ORDER BY date DESC
    `, [1, scoreDate, oldestStockDate]);

    const marketPrices = marketResult.rows;

    if (marketPrices.length < 60) {
      return null; // Need sufficient market data
    }

    // Create a map of market prices by date for efficient lookup
    const marketPriceMap = new Map();
    marketPrices.forEach(p => marketPriceMap.set(p.date, p.close));

    // Calculate aligned returns (only for dates where we have both stock and market data)
    const stockReturns = [];
    const marketReturns = [];

    for (let i = 0; i < stockPrices.length - 1; i++) {
      const currentDate = stockPrices[i].date;
      const previousDate = stockPrices[i + 1].date;

      const stockCurrent = stockPrices[i].close;
      const stockPrevious = stockPrices[i + 1].close;
      const marketCurrent = marketPriceMap.get(currentDate);
      const marketPrevious = marketPriceMap.get(previousDate);

      if (stockCurrent && stockPrevious && marketCurrent && marketPrevious) {
        const stockReturn = (stockCurrent - stockPrevious) / stockPrevious;
        const marketReturn = (marketCurrent - marketPrevious) / marketPrevious;

        stockReturns.push(stockReturn);
        marketReturns.push(marketReturn);
      }
    }

    if (stockReturns.length < 60) {
      return null; // Need at least 60 paired observations
    }

    // Calculate means
    const stockMean = stockReturns.reduce((a, b) => a + b, 0) / stockReturns.length;
    const marketMean = marketReturns.reduce((a, b) => a + b, 0) / marketReturns.length;

    // Calculate covariance and variance
    let covariance = 0;
    let marketVariance = 0;

    for (let i = 0; i < stockReturns.length; i++) {
      const stockDev = stockReturns[i] - stockMean;
      const marketDev = marketReturns[i] - marketMean;

      covariance += stockDev * marketDev;
      marketVariance += marketDev * marketDev;
    }

    covariance /= stockReturns.length;
    marketVariance /= stockReturns.length;

    if (marketVariance === 0) {
      return null; // Cannot calculate beta if market has no variance
    }

    // Beta = Cov(stock, market) / Var(market)
    const beta = covariance / marketVariance;

    return beta;
  }

  /**
   * Calculate percentile ranks for all factors across the universe
   */
  _calculatePercentileRanks(factorValues) {
    // Helper to rank values
    const rankPercentile = (values, key, higherIsBetter = true) => {
      // Extract valid values with indices
      const validValues = values
        .map((v, i) => ({ index: i, value: this._getNestedValue(v, key) }))
        .filter(v => v.value != null && !isNaN(v.value));

      if (validValues.length === 0) return new Array(values.length).fill(null);

      // Sort
      validValues.sort((a, b) => higherIsBetter ? a.value - b.value : b.value - a.value);

      // Assign percentiles
      const percentiles = new Array(values.length).fill(null);
      validValues.forEach((v, rank) => {
        percentiles[v.index] = (rank / (validValues.length - 1)) * 100;
      });

      return percentiles;
    };

    // Calculate percentiles for each factor component
    const valuePercentiles = {
      earnings_yield: rankPercentile(factorValues, 'raw_value.earnings_yield', true),
      fcf_yield: rankPercentile(factorValues, 'raw_value.fcf_yield', true),
      pe_ratio: rankPercentile(factorValues, 'raw_value.pe_ratio', false),
      pb_ratio: rankPercentile(factorValues, 'raw_value.pb_ratio', false)
    };

    const qualityPercentiles = {
      roe: rankPercentile(factorValues, 'raw_quality.roe', true),
      roic: rankPercentile(factorValues, 'raw_quality.roic', true),
      operating_margin: rankPercentile(factorValues, 'raw_quality.operating_margin', true),
      current_ratio: rankPercentile(factorValues, 'raw_quality.current_ratio', true)
    };

    const growthPercentiles = {
      revenue_growth: rankPercentile(factorValues, 'raw_growth.revenue_growth', true),
      earnings_growth: rankPercentile(factorValues, 'raw_growth.earnings_growth', true)
    };

    const momentumPercentiles = {
      return_12m: rankPercentile(factorValues, 'raw_momentum.return_12m', true),
      return_6m: rankPercentile(factorValues, 'raw_momentum.return_6m', true)
    };

    const sizePercentiles = {
      market_cap: rankPercentile(factorValues, 'raw_size.market_cap', false) // Lower = small cap = higher SMB score
    };

    const volatilityPercentiles = {
      volatility_252d: rankPercentile(factorValues, 'raw_volatility.volatility_252d', false) // Lower vol = higher score
    };

    const dividendPercentiles = {
      dividend_yield: rankPercentile(factorValues, 'raw_dividend.dividend_yield', true)
    };

    const leveragePercentiles = {
      debt_to_equity: rankPercentile(factorValues, 'raw_leverage.debt_to_equity', false) // Lower = better
    };

    const liquidityPercentiles = {
      dollar_volume: rankPercentile(factorValues, 'raw_liquidity.dollar_volume', true), // Higher = more liquid
      turnover: rankPercentile(factorValues, 'raw_liquidity.turnover', true) // Higher = more liquid
    };

    // Add percentiles back to factor values
    return factorValues.map((stock, i) => ({
      ...stock,
      percentiles: {
        value: {
          earnings_yield: valuePercentiles.earnings_yield[i],
          fcf_yield: valuePercentiles.fcf_yield[i],
          pe_ratio: valuePercentiles.pe_ratio[i],
          pb_ratio: valuePercentiles.pb_ratio[i]
        },
        quality: {
          roe: qualityPercentiles.roe[i],
          roic: qualityPercentiles.roic[i],
          operating_margin: qualityPercentiles.operating_margin[i],
          current_ratio: qualityPercentiles.current_ratio[i]
        },
        growth: {
          revenue_growth: growthPercentiles.revenue_growth[i],
          earnings_growth: growthPercentiles.earnings_growth[i]
        },
        momentum: {
          return_12m: momentumPercentiles.return_12m[i],
          return_6m: momentumPercentiles.return_6m[i]
        },
        size: {
          market_cap: sizePercentiles.market_cap[i]
        },
        volatility: {
          volatility_252d: volatilityPercentiles.volatility_252d[i]
        },
        dividend: {
          dividend_yield: dividendPercentiles.dividend_yield[i]
        },
        leverage: {
          debt_to_equity: leveragePercentiles.debt_to_equity[i]
        },
        liquidity: {
          dollar_volume: liquidityPercentiles.dollar_volume[i],
          turnover: liquidityPercentiles.turnover[i]
        }
      }
    }));
  }

  /**
   * Calculate composite factor scores from percentile ranks
   */
  _calculateCompositeScores(stock) {
    const p = stock.percentiles;

    // Value composite: average of value percentiles
    const valueComponents = [
      p.value.earnings_yield,
      p.value.fcf_yield,
      p.value.pe_ratio,
      p.value.pb_ratio
    ].filter(v => v != null);
    const value_score = valueComponents.length > 0
      ? valueComponents.reduce((a, b) => a + b, 0) / valueComponents.length
      : null;

    // Quality composite
    const qualityComponents = [
      p.quality.roe,
      p.quality.roic,
      p.quality.operating_margin,
      p.quality.current_ratio
    ].filter(v => v != null);
    const quality_score = qualityComponents.length > 0
      ? qualityComponents.reduce((a, b) => a + b, 0) / qualityComponents.length
      : null;

    // Growth composite
    const growthComponents = [
      p.growth.revenue_growth,
      p.growth.earnings_growth
    ].filter(v => v != null);
    const growth_score = growthComponents.length > 0
      ? growthComponents.reduce((a, b) => a + b, 0) / growthComponents.length
      : null;

    // Momentum composite
    const momentumComponents = [
      p.momentum.return_12m,
      p.momentum.return_6m
    ].filter(v => v != null);
    const momentum_score = momentumComponents.length > 0
      ? momentumComponents.reduce((a, b) => a + b, 0) / momentumComponents.length
      : null;

    // Size score (small cap factor)
    const size_score = p.size.market_cap;

    // Volatility score (low vol factor)
    const volatility_score = p.volatility.volatility_252d;

    // Dividend score
    const dividend_score = p.dividend.dividend_yield;

    // Leverage score (low leverage)
    const leverage_score = p.leverage.debt_to_equity;

    // Profitability score (ROE + margins)
    const profitability_score = [p.quality.roe, p.quality.operating_margin]
      .filter(v => v != null)
      .reduce((a, b, _, arr) => a + b / arr.length, 0) || null;

    // Value-Growth blend (GARP)
    const value_growth_blend = value_score != null && growth_score != null
      ? (value_score * 0.6 + growth_score * 0.4)
      : null;

    // Liquidity composite (dollar volume + turnover)
    const liquidityComponents = [
      p.liquidity.dollar_volume,
      p.liquidity.turnover
    ].filter(v => v != null);
    const liquidity_score = liquidityComponents.length > 0
      ? liquidityComponents.reduce((a, b) => a + b, 0) / liquidityComponents.length
      : null;

    // Defensive score (Quality + Low Vol + Dividend)
    const defensiveComponents = [quality_score, volatility_score, dividend_score]
      .filter(v => v != null);
    const defensive_score = defensiveComponents.length > 0
      ? defensiveComponents.reduce((a, b) => a + b, 0) / defensiveComponents.length
      : null;

    return {
      company_id: stock.company_id,
      symbol: stock.symbol,

      // Composite scores (0-100)
      value_score,
      quality_score,
      growth_score,
      momentum_score,
      size_score,
      volatility_score,
      dividend_score,
      leverage_score,
      profitability_score,
      investment_score: null, // Would need asset growth data
      value_growth_blend,
      defensive_score,
      liquidity_score,

      // Beta (from volatility calculation)
      beta: stock.raw_volatility?.beta || null,

      // Final percentiles for key factors
      value_percentile: value_score,
      quality_percentile: quality_score,
      momentum_percentile: momentum_score,
      growth_percentile: growth_score,
      size_percentile: size_score
    };
  }

  /**
   * Get nested object value by dot notation
   */
  _getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  /**
   * Get factor scores for a specific stock at a date
   */
  async getFactorScores(symbol, scoreDate = null) {
    const database = await getDatabaseAsync();

    let query = `
      SELECT * FROM stock_factor_scores
      WHERE symbol = $1
    `;
    const params = [symbol];

    if (scoreDate) {
      query += ' AND score_date <= $2 ORDER BY score_date DESC LIMIT 1';
      params.push(scoreDate);
    } else {
      query += ' ORDER BY score_date DESC LIMIT 1';
    }

    const result = await database.query(query, params);
    return result.rows[0];
  }

  /**
   * Get factor score history for a stock
   */
  async getFactorScoreHistory(symbol, options = {}) {
    const database = await getDatabaseAsync();
    const { limit = 12, startDate = null } = options;

    let query = `
      SELECT * FROM stock_factor_scores
      WHERE symbol = $1
    `;
    const params = [symbol];
    let paramCount = 1;

    if (startDate) {
      paramCount++;
      query += ` AND score_date >= $${paramCount}`;
      params.push(startDate);
    }

    paramCount++;
    query += ` ORDER BY score_date DESC LIMIT $${paramCount}`;
    params.push(limit);

    const result = await database.query(query, params);
    return result.rows;
  }

  /**
   * Get top stocks by a specific factor
   */
  async getTopByFactor(factor, scoreDate, options = {}) {
    const database = await getDatabaseAsync();
    const { limit = 20, minMarketCap = null, sector = null } = options;

    const factorColumn = `${factor}_score`;

    let query = `
      SELECT sfs.*, c.sector, c.industry, c.market_cap
      FROM stock_factor_scores sfs
      JOIN companies c ON sfs.company_id = c.id
      WHERE sfs.score_date = $1
        AND sfs.${factorColumn} IS NOT NULL
    `;
    const params = [scoreDate];
    let paramCount = 1;

    if (minMarketCap) {
      paramCount++;
      query += ` AND c.market_cap >= $${paramCount}`;
      params.push(minMarketCap);
    }

    if (sector) {
      paramCount++;
      query += ` AND c.sector = $${paramCount}`;
      params.push(sector);
    }

    paramCount++;
    query += ` ORDER BY sfs.${factorColumn} DESC LIMIT $${paramCount}`;
    params.push(limit);

    const result = await database.query(query, params);
    return result.rows;
  }

  /**
   * Calculate factor scores for historical dates (batch)
   */
  async calculateHistoricalFactorScores(options = {}) {
    const database = await getDatabaseAsync();
    const { startDate = null, endDate = null, frequency = 'monthly', verbose = false } = options;

    // Get list of dates to calculate
    let dates;
    if (frequency === 'monthly') {
      const result = await database.query(`
        SELECT DISTINCT to_char(fiscal_period::date, 'YYYY-MM-01') as score_date
        FROM calculated_metrics
        WHERE fiscal_period >= COALESCE($1, '2015-01-01')
          AND fiscal_period <= COALESCE($2, CURRENT_DATE)
        ORDER BY score_date
      `, [startDate, endDate]);
      dates = result.rows.map(d => d.score_date);
    } else {
      const result = await database.query(`
        SELECT DISTINCT fiscal_period as score_date
        FROM calculated_metrics
        WHERE fiscal_period >= COALESCE($1, '2015-01-01')
          AND fiscal_period <= COALESCE($2, CURRENT_DATE)
        ORDER BY score_date
      `, [startDate, endDate]);
      dates = result.rows.map(d => d.score_date);
    }

    if (verbose) {
      console.log(`📊 Calculating factor scores for ${dates.length} dates...`);
    }

    let totalCalculated = 0;
    for (const date of dates) {
      const result = await this.calculateAllFactorScores(date, { verbose: false });
      totalCalculated += result.calculated;

      if (verbose && dates.indexOf(date) % 10 === 0) {
        console.log(`  Processed ${dates.indexOf(date) + 1}/${dates.length}`);
      }
    }

    if (verbose) {
      console.log(`✅ Calculated ${totalCalculated} total factor scores`);
    }

    return { dates: dates.length, totalCalculated };
  }
}

module.exports = FactorCalculator;

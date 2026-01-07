/**
 * Technical Signal Calculator
 *
 * Calculates standard technical indicators for any symbol,
 * normalized to -1 to +1 scale for use by Agent 2 (Trading Logic).
 *
 * Indicators:
 * - RSI (Relative Strength Index)
 * - MACD (Moving Average Convergence Divergence)
 * - SMA (Simple Moving Averages - 20, 50, 200)
 * - ATR (Average True Range)
 * - Volume Trend
 */

class TechnicalSignals {
  constructor(db) {
    this.db = db.getDatabase ? db.getDatabase() : db;

    // Indicator weights for overall score
    this.weights = {
      rsi: 0.25,
      macd: 0.30,
      trend: 0.35,
      volume: 0.10,
    };
  }

  /**
   * Calculate all technical signals for a symbol
   * @param {string} symbol
   * @param {number} lookbackDays - Days of price history to fetch
   * @returns {TechnicalSignal}
   */
  async calculate(symbol, lookbackDays = 250) {
    const prices = await this.getPrices(symbol, lookbackDays);

    if (!prices || prices.length < 50) {
      return this.createEmptySignal(symbol, 'Insufficient price history');
    }

    const closes = prices.map(p => p.close);
    const highs = prices.map(p => p.high);
    const lows = prices.map(p => p.low);
    const volumes = prices.map(p => p.volume);

    // Calculate indicators
    const rsi = this.calculateRSI(closes, 14);
    const macd = this.calculateMACD(closes);
    const sma20 = this.calculateSMA(closes, 20);
    const sma50 = this.calculateSMA(closes, 50);
    const sma200 = closes.length >= 200 ? this.calculateSMA(closes, 200) : null;
    const atr = this.calculateATR(highs, lows, closes, 14);
    const volumeTrend = this.calculateVolumeTrend(volumes, 20);

    const currentPrice = closes[closes.length - 1];

    // Score each indicator (-1 to +1)
    const scores = {
      rsi: this.scoreRSI(rsi),
      macd: this.scoreMACD(macd),
      trend: this.scoreTrend(currentPrice, sma20, sma50, sma200),
      volume: this.scoreVolume(volumeTrend),
    };

    // Weighted average
    const totalScore = Object.entries(scores).reduce(
      (sum, [key, val]) => sum + val * this.weights[key], 0
    );

    // Clamp to -1 to +1
    const clampedScore = Math.max(-1, Math.min(1, totalScore));

    // Generate signal and interpretation
    const { signal, strength } = this.scoreToSignal(clampedScore);
    const interpretation = this.interpret(scores, rsi, macd, currentPrice, sma20, sma50);

    const result = {
      symbol,
      score: Math.round(clampedScore * 1000) / 1000,
      confidence: 0.7, // Technical signals are moderately reliable
      signal,
      signalStrength: strength,
      indicators: {
        rsi: { value: Math.round(rsi * 100) / 100, score: scores.rsi },
        macd: {
          macd: Math.round(macd.macd * 10000) / 10000,
          signal: Math.round(macd.signal * 10000) / 10000,
          histogram: Math.round(macd.histogram * 10000) / 10000,
          score: scores.macd,
        },
        sma20: sma20 ? Math.round(sma20 * 100) / 100 : null,
        sma50: sma50 ? Math.round(sma50 * 100) / 100 : null,
        sma200: sma200 ? Math.round(sma200 * 100) / 100 : null,
        atr: atr ? Math.round(atr * 100) / 100 : null,
        volumeTrend: Math.round(volumeTrend * 1000) / 1000,
        trendScore: scores.trend,
        volumeScore: scores.volume,
      },
      currentPrice: Math.round(currentPrice * 100) / 100,
      interpretation,
      timestamp: new Date().toISOString(),
    };

    // Store in database
    await this.storeSignal(symbol, result);

    return result;
  }

  /**
   * Get price data for a symbol
   */
  async getPrices(symbol, days) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().split('T')[0];

    try {
      const company = this.db.prepare(`
        SELECT id FROM companies WHERE symbol = ? COLLATE NOCASE
      `).get(symbol);

      if (!company) {
        return null;
      }

      const prices = this.db.prepare(`
        SELECT date, open, high, low, close, volume
        FROM daily_prices
        WHERE company_id = ?
          AND date >= ?
        ORDER BY date ASC
      `).all(company.id, cutoffStr);

      return prices;
    } catch (error) {
      console.error(`Error fetching prices for ${symbol}:`, error.message);
      return null;
    }
  }

  /**
   * Calculate RSI (Relative Strength Index)
   */
  calculateRSI(closes, period = 14) {
    if (closes.length < period + 1) return 50; // Default to neutral

    const changes = [];
    for (let i = 1; i < closes.length; i++) {
      changes.push(closes[i] - closes[i - 1]);
    }

    let avgGain = 0, avgLoss = 0;

    // First average
    for (let i = 0; i < period; i++) {
      if (changes[i] > 0) avgGain += changes[i];
      else avgLoss += Math.abs(changes[i]);
    }
    avgGain /= period;
    avgLoss /= period;

    // Smoothed average (Wilder's smoothing)
    for (let i = period; i < changes.length; i++) {
      const change = changes[i];
      if (change > 0) {
        avgGain = (avgGain * (period - 1) + change) / period;
        avgLoss = (avgLoss * (period - 1)) / period;
      } else {
        avgGain = (avgGain * (period - 1)) / period;
        avgLoss = (avgLoss * (period - 1) + Math.abs(change)) / period;
      }
    }

    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  /**
   * Calculate MACD (Moving Average Convergence Divergence)
   */
  calculateMACD(closes, fast = 12, slow = 26, signalPeriod = 9) {
    if (closes.length < slow + signalPeriod) {
      return { macd: 0, signal: 0, histogram: 0 };
    }

    const emaFast = this.calculateEMA(closes, fast);
    const emaSlow = this.calculateEMA(closes, slow);

    const macdLine = emaFast[emaFast.length - 1] - emaSlow[emaSlow.length - 1];

    // Calculate MACD line history for signal line
    const macdHistory = [];
    const minLen = Math.min(emaFast.length, emaSlow.length);
    for (let i = 0; i < minLen; i++) {
      macdHistory.push(emaFast[emaFast.length - minLen + i] - emaSlow[emaSlow.length - minLen + i]);
    }

    const signalLine = this.calculateEMA(macdHistory, signalPeriod);
    const signalValue = signalLine[signalLine.length - 1];
    const histogram = macdLine - signalValue;

    return {
      macd: macdLine,
      signal: signalValue,
      histogram,
    };
  }

  /**
   * Calculate EMA (Exponential Moving Average)
   */
  calculateEMA(values, period) {
    if (values.length < period) {
      return values.length > 0 ? [values[values.length - 1]] : [0];
    }

    const multiplier = 2 / (period + 1);
    const ema = [values[0]];

    for (let i = 1; i < values.length; i++) {
      ema.push((values[i] - ema[i - 1]) * multiplier + ema[i - 1]);
    }

    return ema;
  }

  /**
   * Calculate SMA (Simple Moving Average)
   */
  calculateSMA(values, period) {
    if (values.length < period) return null;
    const slice = values.slice(-period);
    const sum = slice.reduce((a, b) => a + b, 0);
    return sum / period;
  }

  /**
   * Calculate ATR (Average True Range)
   */
  calculateATR(highs, lows, closes, period = 14) {
    if (closes.length < period + 1) return null;

    const trueRanges = [];
    for (let i = 1; i < closes.length; i++) {
      const tr = Math.max(
        highs[i] - lows[i],
        Math.abs(highs[i] - closes[i - 1]),
        Math.abs(lows[i] - closes[i - 1])
      );
      trueRanges.push(tr);
    }

    return this.calculateSMA(trueRanges, period);
  }

  /**
   * Calculate volume trend (recent vs older)
   */
  calculateVolumeTrend(volumes, period) {
    if (volumes.length < period * 2) return 0;

    const recentAvg = this.calculateSMA(volumes.slice(-period), period);
    const olderAvg = this.calculateSMA(volumes.slice(-period * 2, -period), period);

    if (!olderAvg || olderAvg === 0) return 0;
    return (recentAvg - olderAvg) / olderAvg;
  }

  // ========================================
  // Scoring Functions (return -1 to +1)
  // ========================================

  /**
   * Score RSI
   * Oversold (<30) = bullish, Overbought (>70) = bearish
   */
  scoreRSI(rsi) {
    if (rsi < 30) return 0.8;      // Oversold = bullish
    if (rsi < 40) return 0.4;
    if (rsi > 70) return -0.8;     // Overbought = bearish
    if (rsi > 60) return -0.4;
    return 0;                       // Neutral
  }

  /**
   * Score MACD
   * Bullish when MACD > signal and histogram positive
   */
  scoreMACD(macd) {
    if (macd.histogram > 0 && macd.macd > macd.signal) {
      // Bullish - scale by histogram magnitude
      return Math.min(0.8, Math.abs(macd.histogram) * 100);
    }
    if (macd.histogram < 0 && macd.macd < macd.signal) {
      // Bearish
      return Math.max(-0.8, -Math.abs(macd.histogram) * 100);
    }
    return 0;
  }

  /**
   * Score trend based on price vs SMAs
   */
  scoreTrend(price, sma20, sma50, sma200) {
    let score = 0;

    // Price vs SMAs
    if (sma20) {
      if (price > sma20) score += 0.2;
      else score -= 0.2;
    }

    if (sma50) {
      if (price > sma50) score += 0.3;
      else score -= 0.3;
    }

    if (sma200) {
      if (price > sma200) score += 0.2;
      else score -= 0.2;
    }

    // SMA alignment (golden/death cross)
    if (sma20 && sma50) {
      if (sma20 > sma50) score += 0.3;  // Bullish alignment
      else score -= 0.3;                 // Bearish alignment
    }

    return Math.max(-1, Math.min(1, score));
  }

  /**
   * Score volume trend
   * Higher volume on moves is generally confirming
   */
  scoreVolume(volumeTrend) {
    // Limit the impact of volume
    return Math.max(-0.5, Math.min(0.5, volumeTrend));
  }

  /**
   * Convert score to signal label and strength
   */
  scoreToSignal(score) {
    if (score >= 0.6) return { signal: 'strong_buy', strength: 5 };
    if (score >= 0.4) return { signal: 'buy', strength: 4 };
    if (score >= 0.15) return { signal: 'lean_buy', strength: 3 };
    if (score <= -0.6) return { signal: 'strong_sell', strength: 5 };
    if (score <= -0.4) return { signal: 'sell', strength: 4 };
    if (score <= -0.15) return { signal: 'lean_sell', strength: 3 };
    return { signal: 'hold', strength: 2 };
  }

  /**
   * Generate human-readable interpretation
   */
  interpret(scores, rsi, macd, price, sma20, sma50) {
    const signals = [];

    if (rsi < 30) signals.push('RSI oversold - potential bounce');
    else if (rsi > 70) signals.push('RSI overbought - potential pullback');
    else if (rsi < 40) signals.push('RSI approaching oversold');
    else if (rsi > 60) signals.push('RSI approaching overbought');

    if (macd.histogram > 0 && macd.macd > macd.signal) {
      signals.push('MACD bullish momentum');
    } else if (macd.histogram < 0 && macd.macd < macd.signal) {
      signals.push('MACD bearish momentum');
    }

    if (sma20 && sma50) {
      if (price > sma20 && sma20 > sma50) {
        signals.push('Uptrend: price > SMA20 > SMA50');
      } else if (price < sma20 && sma20 < sma50) {
        signals.push('Downtrend: price < SMA20 < SMA50');
      } else if (price > sma20 && sma20 < sma50) {
        signals.push('Recovery attempt: price > SMA20, SMA20 < SMA50');
      } else if (price < sma20 && sma20 > sma50) {
        signals.push('Pullback: price < SMA20, SMA20 > SMA50');
      }
    }

    if (signals.length === 0) {
      signals.push('No strong technical signals');
    }

    return signals;
  }

  /**
   * Store signal in database
   */
  async storeSignal(symbol, result) {
    try {
      const company = this.db.prepare(`
        SELECT id FROM companies WHERE symbol = ? COLLATE NOCASE
      `).get(symbol);

      if (!company) return;

      this.db.prepare(`
        INSERT OR REPLACE INTO technical_signals (
          company_id, symbol, calculated_at,
          score, confidence, signal, signal_strength,
          rsi_14, rsi_score,
          macd_line, macd_signal, macd_histogram, macd_score,
          sma_20, sma_50, sma_200, trend_score,
          atr_14, volume_trend, volume_score,
          current_price, interpretation
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        company.id,
        symbol,
        result.timestamp,
        result.score,
        result.confidence,
        result.signal,
        result.signalStrength,
        result.indicators.rsi.value,
        result.indicators.rsi.score,
        result.indicators.macd.macd,
        result.indicators.macd.signal,
        result.indicators.macd.histogram,
        result.indicators.macd.score,
        result.indicators.sma20,
        result.indicators.sma50,
        result.indicators.sma200,
        result.indicators.trendScore,
        result.indicators.atr,
        result.indicators.volumeTrend,
        result.indicators.volumeScore,
        result.currentPrice,
        JSON.stringify(result.interpretation)
      );
    } catch (error) {
      console.error(`Error storing technical signal for ${symbol}:`, error.message);
    }
  }

  /**
   * Create empty signal when data is insufficient
   */
  createEmptySignal(symbol, reason) {
    return {
      symbol,
      score: 0,
      confidence: 0,
      signal: 'hold',
      signalStrength: 1,
      indicators: {
        rsi: { value: 50, score: 0 },
        macd: { macd: 0, signal: 0, histogram: 0, score: 0 },
        sma20: null,
        sma50: null,
        sma200: null,
        atr: null,
        volumeTrend: 0,
        trendScore: 0,
        volumeScore: 0,
      },
      currentPrice: null,
      interpretation: [reason],
      timestamp: new Date().toISOString(),
      error: reason,
    };
  }

  /**
   * Batch calculate for multiple symbols
   */
  async calculateBatch(symbols) {
    const results = await Promise.all(
      symbols.map(symbol => this.calculate(symbol))
    );
    return results;
  }

  /**
   * Get stored signal from database
   */
  getStoredSignal(symbol) {
    try {
      return this.db.prepare(`
        SELECT * FROM technical_signals
        WHERE symbol = ? COLLATE NOCASE
        ORDER BY calculated_at DESC
        LIMIT 1
      `).get(symbol);
    } catch (error) {
      console.error(`Error fetching stored signal for ${symbol}:`, error.message);
      return null;
    }
  }
}

module.exports = { TechnicalSignals };

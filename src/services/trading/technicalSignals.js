/**
 * Technical Signal Calculator
 *
 * Calculates standard technical indicators for any symbol,
 * normalized to -1 to +1 scale for use by Agent 2 (Trading Logic).
 * Works with both SQLite and PostgreSQL.
 */

const { getDatabaseAsync, isUsingPostgres } = require('../../lib/db');

class TechnicalSignals {
  constructor(_db) {
    this.weights = {
      rsi: 0.25,
      macd: 0.30,
      trend: 0.35,
      volume: 0.10,
    };
  }

  async calculate(symbol, lookbackDays = 250) {
    const prices = await this.getPrices(symbol, lookbackDays);

    if (!prices || prices.length < 50) {
      return this.createEmptySignal(symbol, 'Insufficient price history');
    }

    const closes = prices.map(p => parseFloat(p.close));
    const highs = prices.map(p => parseFloat(p.high));
    const lows = prices.map(p => parseFloat(p.low));
    const volumes = prices.map(p => parseFloat(p.volume));

    const rsi = this.calculateRSI(closes, 14);
    const macd = this.calculateMACD(closes);
    const sma20 = this.calculateSMA(closes, 20);
    const sma50 = this.calculateSMA(closes, 50);
    const sma200 = closes.length >= 200 ? this.calculateSMA(closes, 200) : null;
    const atr = this.calculateATR(highs, lows, closes, 14);
    const volumeTrend = this.calculateVolumeTrend(volumes, 20);

    const currentPrice = closes[closes.length - 1];

    const scores = {
      rsi: this.scoreRSI(rsi),
      macd: this.scoreMACD(macd),
      trend: this.scoreTrend(currentPrice, sma20, sma50, sma200),
      volume: this.scoreVolume(volumeTrend),
    };

    const totalScore = Object.entries(scores).reduce(
      (sum, [key, val]) => sum + val * this.weights[key], 0
    );
    const clampedScore = Math.max(-1, Math.min(1, totalScore));

    const { signal, strength } = this.scoreToSignal(clampedScore);
    const interpretation = this.interpret(scores, rsi, macd, currentPrice, sma20, sma50);

    const result = {
      symbol,
      score: Math.round(clampedScore * 1000) / 1000,
      confidence: 0.7,
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

    await this.storeSignal(symbol, result);
    return result;
  }

  async getPrices(symbol, days) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().split('T')[0];

    try {
      const db = await getDatabaseAsync();
      const companyResult = await db.query(
        `SELECT id FROM companies WHERE LOWER(symbol) = LOWER($1)`,
        [symbol]
      );
      const company = companyResult.rows[0];
      if (!company) return null;

      const pricesResult = await db.query(
        `SELECT date, open, high, low, close, volume FROM daily_prices
         WHERE company_id = $1 AND date >= $2 ORDER BY date ASC`,
        [company.id, cutoffStr]
      );
      return pricesResult.rows;
    } catch (error) {
      console.error(`Error fetching prices for ${symbol}:`, error.message);
      return null;
    }
  }

  calculateRSI(closes, period = 14) {
    if (closes.length < period + 1) return 50;
    const changes = [];
    for (let i = 1; i < closes.length; i++) {
      changes.push(closes[i] - closes[i - 1]);
    }
    let avgGain = 0, avgLoss = 0;
    for (let i = 0; i < period; i++) {
      if (changes[i] > 0) avgGain += changes[i];
      else avgLoss += Math.abs(changes[i]);
    }
    avgGain /= period;
    avgLoss /= period;
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

  calculateMACD(closes, fast = 12, slow = 26, signalPeriod = 9) {
    if (closes.length < slow + signalPeriod) return { macd: 0, signal: 0, histogram: 0 };
    const emaFast = this.calculateEMA(closes, fast);
    const emaSlow = this.calculateEMA(closes, slow);
    const macdLine = emaFast[emaFast.length - 1] - emaSlow[emaSlow.length - 1];
    const macdHistory = [];
    const minLen = Math.min(emaFast.length, emaSlow.length);
    for (let i = 0; i < minLen; i++) {
      macdHistory.push(emaFast[emaFast.length - minLen + i] - emaSlow[emaSlow.length - minLen + i]);
    }
    const signalLine = this.calculateEMA(macdHistory, signalPeriod);
    const signalValue = signalLine[signalLine.length - 1];
    return { macd: macdLine, signal: signalValue, histogram: macdLine - signalValue };
  }

  calculateEMA(values, period) {
    if (values.length < period) return values.length > 0 ? [values[values.length - 1]] : [0];
    const multiplier = 2 / (period + 1);
    const ema = [values[0]];
    for (let i = 1; i < values.length; i++) {
      ema.push((values[i] - ema[i - 1]) * multiplier + ema[i - 1]);
    }
    return ema;
  }

  calculateSMA(values, period) {
    if (values.length < period) return null;
    const slice = values.slice(-period);
    return slice.reduce((a, b) => a + b, 0) / period;
  }

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

  calculateVolumeTrend(volumes, period) {
    if (volumes.length < period * 2) return 0;
    const recentAvg = this.calculateSMA(volumes.slice(-period), period);
    const olderAvg = this.calculateSMA(volumes.slice(-period * 2, -period), period);
    if (!olderAvg || olderAvg === 0) return 0;
    return (recentAvg - olderAvg) / olderAvg;
  }

  scoreRSI(rsi) {
    if (rsi < 30) return 0.8;
    if (rsi < 40) return 0.4;
    if (rsi > 70) return -0.8;
    if (rsi > 60) return -0.4;
    return 0;
  }

  scoreMACD(macd) {
    if (macd.histogram > 0 && macd.macd > macd.signal) {
      return Math.min(0.8, Math.abs(macd.histogram) * 100);
    }
    if (macd.histogram < 0 && macd.macd < macd.signal) {
      return Math.max(-0.8, -Math.abs(macd.histogram) * 100);
    }
    return 0;
  }

  scoreTrend(price, sma20, sma50, sma200) {
    let score = 0;
    if (sma20) score += price > sma20 ? 0.2 : -0.2;
    if (sma50) score += price > sma50 ? 0.3 : -0.3;
    if (sma200) score += price > sma200 ? 0.2 : -0.2;
    if (sma20 && sma50) score += sma20 > sma50 ? 0.3 : -0.3;
    return Math.max(-1, Math.min(1, score));
  }

  scoreVolume(volumeTrend) {
    return Math.max(-0.5, Math.min(0.5, volumeTrend));
  }

  scoreToSignal(score) {
    if (score >= 0.6) return { signal: 'strong_buy', strength: 5 };
    if (score >= 0.4) return { signal: 'buy', strength: 4 };
    if (score >= 0.15) return { signal: 'lean_buy', strength: 3 };
    if (score <= -0.6) return { signal: 'strong_sell', strength: 5 };
    if (score <= -0.4) return { signal: 'sell', strength: 4 };
    if (score <= -0.15) return { signal: 'lean_sell', strength: 3 };
    return { signal: 'hold', strength: 2 };
  }

  interpret(scores, rsi, macd, price, sma20, sma50) {
    const signals = [];
    if (rsi < 30) signals.push('RSI oversold - potential bounce');
    else if (rsi > 70) signals.push('RSI overbought - potential pullback');
    else if (rsi < 40) signals.push('RSI approaching oversold');
    else if (rsi > 60) signals.push('RSI approaching overbought');
    if (macd.histogram > 0 && macd.macd > macd.signal) signals.push('MACD bullish momentum');
    else if (macd.histogram < 0 && macd.macd < macd.signal) signals.push('MACD bearish momentum');
    if (sma20 && sma50) {
      if (price > sma20 && sma20 > sma50) signals.push('Uptrend: price > SMA20 > SMA50');
      else if (price < sma20 && sma20 < sma50) signals.push('Downtrend: price < SMA20 < SMA50');
      else if (price > sma20 && sma20 < sma50) signals.push('Recovery attempt: price > SMA20, SMA20 < SMA50');
      else if (price < sma20 && sma20 > sma50) signals.push('Pullback: price < SMA20, SMA20 > SMA50');
    }
    if (signals.length === 0) signals.push('No strong technical signals');
    return signals;
  }

  async storeSignal(symbol, result) {
    try {
      const db = await getDatabaseAsync();
      const companyResult = await db.query(
        `SELECT id FROM companies WHERE LOWER(symbol) = LOWER($1)`,
        [symbol]
      );
      const company = companyResult.rows[0];
      if (!company) return;

      const upsertSql = isUsingPostgres()
        ? `INSERT INTO technical_signals (
            company_id, symbol, calculated_at, score, confidence, signal, signal_strength,
            rsi_14, rsi_score, macd_line, macd_signal, macd_histogram, macd_score,
            sma_20, sma_50, sma_200, trend_score, atr_14, volume_trend, volume_score,
            current_price, interpretation
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
          ON CONFLICT (company_id, DATE(calculated_at)) DO UPDATE SET
            score = EXCLUDED.score, confidence = EXCLUDED.confidence, signal = EXCLUDED.signal,
            signal_strength = EXCLUDED.signal_strength, rsi_14 = EXCLUDED.rsi_14, rsi_score = EXCLUDED.rsi_score,
            macd_line = EXCLUDED.macd_line, macd_signal = EXCLUDED.macd_signal, macd_histogram = EXCLUDED.macd_histogram,
            macd_score = EXCLUDED.macd_score, sma_20 = EXCLUDED.sma_20, sma_50 = EXCLUDED.sma_50, sma_200 = EXCLUDED.sma_200,
            trend_score = EXCLUDED.trend_score, atr_14 = EXCLUDED.atr_14, volume_trend = EXCLUDED.volume_trend,
            volume_score = EXCLUDED.volume_score, current_price = EXCLUDED.current_price, interpretation = EXCLUDED.interpretation`
        : `INSERT OR REPLACE INTO technical_signals (
            company_id, symbol, calculated_at, score, confidence, signal, signal_strength,
            rsi_14, rsi_score, macd_line, macd_signal, macd_histogram, macd_score,
            sma_20, sma_50, sma_200, trend_score, atr_14, volume_trend, volume_score,
            current_price, interpretation
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)`;

      await db.query(upsertSql, [
        company.id, symbol, result.timestamp, result.score, result.confidence, result.signal, result.signalStrength,
        result.indicators.rsi.value, result.indicators.rsi.score, result.indicators.macd.macd,
        result.indicators.macd.signal, result.indicators.macd.histogram, result.indicators.macd.score,
        result.indicators.sma20, result.indicators.sma50, result.indicators.sma200, result.indicators.trendScore,
        result.indicators.atr, result.indicators.volumeTrend, result.indicators.volumeScore,
        result.currentPrice, JSON.stringify(result.interpretation)
      ]);
    } catch (error) {
      console.error(`Error storing technical signal for ${symbol}:`, error.message);
    }
  }

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
        sma20: null, sma50: null, sma200: null, atr: null,
        volumeTrend: 0, trendScore: 0, volumeScore: 0,
      },
      currentPrice: null,
      interpretation: [reason],
      timestamp: new Date().toISOString(),
      error: reason,
    };
  }

  async calculateBatch(symbols) {
    return Promise.all(symbols.map(symbol => this.calculate(symbol)));
  }

  async getStoredSignal(symbol) {
    try {
      const db = await getDatabaseAsync();
      const result = await db.query(
        `SELECT * FROM technical_signals WHERE LOWER(symbol) = LOWER($1) ORDER BY calculated_at DESC LIMIT 1`,
        [symbol]
      );
      return result.rows[0] || null;
    } catch (error) {
      console.error(`Error fetching stored signal for ${symbol}:`, error.message);
      return null;
    }
  }
}

module.exports = { TechnicalSignals };

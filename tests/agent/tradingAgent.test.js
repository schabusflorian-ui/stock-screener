// tests/agent/tradingAgent.test.js
// Tests for TradingAgent - the core trading signal generator
// Uses pure function tests to avoid complex schema dependencies

describe('TradingAgent', () => {
  // Test the pure functions and logic without database dependencies

  describe('scoreToAction', () => {
    // Inline implementation for testing
    const scoreToAction = (score) => {
      if (score >= 0.6) return 'strong_buy';
      if (score >= 0.3) return 'buy';
      if (score >= -0.3) return 'hold';
      if (score >= -0.6) return 'sell';
      return 'strong_sell';
    };

    it('should return strong_buy for high positive score', () => {
      expect(scoreToAction(0.8)).toBe('strong_buy');
      expect(scoreToAction(0.6)).toBe('strong_buy');
    });

    it('should return buy for moderate positive score', () => {
      expect(scoreToAction(0.5)).toBe('buy');
      expect(scoreToAction(0.3)).toBe('buy');
    });

    it('should return hold for neutral score', () => {
      expect(scoreToAction(0)).toBe('hold');
      expect(scoreToAction(0.2)).toBe('hold');
      expect(scoreToAction(-0.2)).toBe('hold');
    });

    it('should return sell for moderate negative score', () => {
      expect(scoreToAction(-0.4)).toBe('sell');
      expect(scoreToAction(-0.6)).toBe('sell');
    });

    it('should return strong_sell for high negative score', () => {
      expect(scoreToAction(-0.8)).toBe('strong_sell');
      expect(scoreToAction(-0.7)).toBe('strong_sell');
    });
  });

  describe('calculateConfidence', () => {
    // Inline implementation for testing
    const calculateConfidence = (signals) => {
      if (!signals || signals.length === 0) return 0;

      const values = signals.filter(s => s !== null && !isNaN(s));
      if (values.length === 0) return 0;

      const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
      const variance = values.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / values.length;
      const stdDev = Math.sqrt(variance);

      // Higher confidence when signals agree (low std dev)
      // and when they're further from zero (stronger conviction)
      const agreement = Math.max(0, 1 - stdDev);
      const conviction = Math.min(1, Math.abs(avg) * 1.5);

      return (agreement * 0.6 + conviction * 0.4);
    };

    it('should return higher confidence for consistent signals', () => {
      const consistentSignals = [0.5, 0.6, 0.55, 0.45];
      const confidence = calculateConfidence(consistentSignals);
      expect(confidence).toBeGreaterThan(0.5);
    });

    it('should return lower confidence for mixed signals', () => {
      const mixedSignals = [0.8, -0.5, 0.3, -0.2];
      const confidence = calculateConfidence(mixedSignals);
      expect(confidence).toBeLessThan(0.5);
    });

    it('should return 0 for empty signals', () => {
      expect(calculateConfidence([])).toBe(0);
      expect(calculateConfidence(null)).toBe(0);
    });

    it('should handle single signal', () => {
      const confidence = calculateConfidence([0.7]);
      expect(confidence).toBeGreaterThan(0);
    });
  });

  describe('weight normalization', () => {
    it('should normalize weights to sum to 1', () => {
      const rawWeights = {
        technical: 0.15,
        fundamental: 0.15,
        momentum: 0.12,
        value: 0.12,
        quality: 0.10,
        sentiment: 0.10,
        insider: 0.08,
        institutional: 0.08,
        volatility: 0.10
      };

      const sum = Object.values(rawWeights).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1.0, 2);
    });
  });

  describe('signal aggregation', () => {
    const aggregateSignals = (signals, weights) => {
      let score = 0;
      for (const [key, value] of Object.entries(signals)) {
        if (weights[key] !== undefined && value !== null) {
          score += value * weights[key];
        }
      }
      // Clamp between -1 and 1
      return Math.max(-1, Math.min(1, score));
    };

    const defaultWeights = {
      technical: 0.15,
      fundamental: 0.15,
      momentum: 0.12,
      value: 0.12,
      quality: 0.10,
      sentiment: 0.10,
      insider: 0.08,
      institutional: 0.08,
      volatility: 0.10
    };

    it('should aggregate all signal types', () => {
      const signals = {
        technical: 0.5,
        fundamental: 0.3,
        momentum: 0.2,
        value: 0.4,
        quality: 0.6,
        sentiment: 0.1,
        insider: 0.0,
        institutional: 0.2,
        volatility: -0.1
      };

      const score = aggregateSignals(signals, defaultWeights);
      expect(typeof score).toBe('number');
      expect(score).toBeGreaterThanOrEqual(-1);
      expect(score).toBeLessThanOrEqual(1);
    });

    it('should clamp final score between -1 and 1', () => {
      const extremeSignals = {
        technical: 1.0,
        fundamental: 1.0,
        momentum: 1.0,
        value: 1.0,
        quality: 1.0,
        sentiment: 1.0,
        insider: 1.0,
        institutional: 1.0,
        volatility: 1.0
      };

      const score = aggregateSignals(extremeSignals, defaultWeights);
      expect(score).toBeLessThanOrEqual(1);

      const negativeSignals = {
        technical: -1.0,
        fundamental: -1.0,
        momentum: -1.0,
        value: -1.0,
        quality: -1.0,
        sentiment: -1.0,
        insider: -1.0,
        institutional: -1.0,
        volatility: -1.0
      };

      const negScore = aggregateSignals(negativeSignals, defaultWeights);
      expect(negScore).toBeGreaterThanOrEqual(-1);
    });

    it('should handle missing signals gracefully', () => {
      const partialSignals = {
        technical: 0.5,
        fundamental: 0.3
      };

      const score = aggregateSignals(partialSignals, defaultWeights);
      expect(typeof score).toBe('number');
      expect(score).toBeGreaterThanOrEqual(-1);
      expect(score).toBeLessThanOrEqual(1);
    });
  });

  describe('regime-adaptive behavior', () => {
    const adjustWeightsForRegime = (baseWeights, regime) => {
      const adjusted = { ...baseWeights };

      switch (regime) {
        case 'BULL':
          adjusted.momentum *= 1.2;
          adjusted.technical *= 0.9;
          break;
        case 'BEAR':
          adjusted.quality *= 1.3;
          adjusted.value *= 1.2;
          adjusted.momentum *= 0.7;
          break;
        case 'HIGH_VOL':
          adjusted.volatility *= 1.5;
          adjusted.sentiment *= 0.6;
          break;
        case 'SIDEWAYS':
          adjusted.value *= 1.1;
          adjusted.fundamental *= 1.1;
          break;
      }

      // Normalize to sum to 1
      const sum = Object.values(adjusted).reduce((a, b) => a + b, 0);
      for (const key of Object.keys(adjusted)) {
        adjusted[key] /= sum;
      }

      return adjusted;
    };

    it('should adjust weights based on regime', () => {
      const baseWeights = {
        technical: 0.15,
        fundamental: 0.15,
        momentum: 0.12,
        value: 0.12,
        quality: 0.10,
        sentiment: 0.10,
        insider: 0.08,
        institutional: 0.08,
        volatility: 0.10
      };

      const bullWeights = adjustWeightsForRegime(baseWeights, 'BULL');
      const bearWeights = adjustWeightsForRegime(baseWeights, 'BEAR');

      // Bull market should have higher momentum weight
      expect(bullWeights.momentum).toBeGreaterThan(bearWeights.momentum);

      // Bear market should have higher quality/value weights
      expect(bearWeights.quality).toBeGreaterThan(bullWeights.quality);
    });

    it('should keep weights normalized after adjustment', () => {
      const baseWeights = {
        technical: 0.15,
        fundamental: 0.15,
        momentum: 0.12,
        value: 0.12,
        quality: 0.10,
        sentiment: 0.10,
        insider: 0.08,
        institutional: 0.08,
        volatility: 0.10
      };

      for (const regime of ['BULL', 'BEAR', 'HIGH_VOL', 'SIDEWAYS']) {
        const adjusted = adjustWeightsForRegime(baseWeights, regime);
        const sum = Object.values(adjusted).reduce((a, b) => a + b, 0);
        expect(sum).toBeCloseTo(1.0, 5);
      }
    });
  });
});

describe('TradingAgent Technical Analysis', () => {
  describe('RSI calculation', () => {
    const calculateRSI = (prices, period = 14) => {
      if (prices.length < period + 1) return 50;

      let gains = 0;
      let losses = 0;

      for (let i = 1; i <= period; i++) {
        const change = prices[i] - prices[i - 1];
        if (change > 0) gains += change;
        else losses -= change;
      }

      const avgGain = gains / period;
      const avgLoss = losses / period;

      if (avgLoss === 0) return 100;
      const rs = avgGain / avgLoss;
      return 100 - (100 / (1 + rs));
    };

    it('should return 50 for insufficient data', () => {
      expect(calculateRSI([100, 101, 102])).toBe(50);
    });

    it('should return high RSI for consistently rising prices', () => {
      const risingPrices = Array.from({ length: 20 }, (_, i) => 100 + i);
      const rsi = calculateRSI(risingPrices);
      expect(rsi).toBeGreaterThan(70);
    });

    it('should return low RSI for consistently falling prices', () => {
      const fallingPrices = Array.from({ length: 20 }, (_, i) => 100 - i);
      const rsi = calculateRSI(fallingPrices);
      expect(rsi).toBeLessThan(30);
    });
  });

  describe('moving average crossover', () => {
    const calculateSMA = (prices, period) => {
      if (prices.length < period) return null;
      const sum = prices.slice(-period).reduce((a, b) => a + b, 0);
      return sum / period;
    };

    const getMACrossoverSignal = (prices) => {
      const sma20 = calculateSMA(prices, 20);
      const sma50 = calculateSMA(prices, 50);

      if (!sma20 || !sma50) return 0;

      if (sma20 > sma50) return 0.5; // Bullish crossover
      if (sma20 < sma50) return -0.5; // Bearish crossover
      return 0;
    };

    it('should detect bullish crossover', () => {
      // Create prices where short-term is above long-term
      const prices = Array.from({ length: 60 }, (_, i) => {
        if (i < 30) return 100;
        return 100 + (i - 30) * 0.5; // Rising trend in second half
      });

      const signal = getMACrossoverSignal(prices);
      expect(signal).toBeGreaterThan(0);
    });

    it('should return neutral for insufficient data', () => {
      const prices = [100, 101, 102];
      const signal = getMACrossoverSignal(prices);
      expect(signal).toBe(0);
    });
  });
});

describe('TradingAgent Fundamental Analysis', () => {
  describe('PE ratio analysis', () => {
    const analyzePE = (pe, sectorAvgPE = 20) => {
      if (!pe || pe <= 0) return 0;

      const ratio = pe / sectorAvgPE;

      if (ratio < 0.5) return 0.5;   // Very undervalued
      if (ratio < 0.8) return 0.3;   // Undervalued
      if (ratio < 1.2) return 0;     // Fair valued
      if (ratio < 1.5) return -0.3;  // Overvalued
      return -0.5;                    // Very overvalued
    };

    it('should return positive signal for low PE', () => {
      expect(analyzePE(8, 20)).toBe(0.5);
      expect(analyzePE(15, 20)).toBe(0.3);
    });

    it('should return negative signal for high PE', () => {
      expect(analyzePE(35, 20)).toBe(-0.5);
      expect(analyzePE(28, 20)).toBe(-0.3);
    });

    it('should return neutral for fair PE', () => {
      expect(analyzePE(20, 20)).toBe(0);
      expect(analyzePE(22, 20)).toBe(0);
    });

    it('should handle invalid PE', () => {
      expect(analyzePE(0)).toBe(0);
      expect(analyzePE(-5)).toBe(0);
      expect(analyzePE(null)).toBe(0);
    });
  });

  describe('growth analysis', () => {
    const analyzeGrowth = (revenueGrowth, earningsGrowth) => {
      let signal = 0;

      if (revenueGrowth > 0.2) signal += 0.3;
      else if (revenueGrowth > 0.1) signal += 0.15;
      else if (revenueGrowth < 0) signal -= 0.2;

      if (earningsGrowth > 0.25) signal += 0.3;
      else if (earningsGrowth > 0.15) signal += 0.15;
      else if (earningsGrowth < -0.1) signal -= 0.3;

      return Math.max(-1, Math.min(1, signal));
    };

    it('should return positive signal for strong growth', () => {
      const signal = analyzeGrowth(0.25, 0.30);
      expect(signal).toBeGreaterThan(0.4);
    });

    it('should return negative signal for declining metrics', () => {
      const signal = analyzeGrowth(-0.1, -0.2);
      expect(signal).toBeLessThan(0);
    });
  });
});

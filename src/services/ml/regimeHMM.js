// src/services/ml/regimeHMM.js
// Hidden Markov Model for Market Regime Detection

/**
 * HiddenMarkovRegimeModel - Probabilistic regime detection using HMM
 *
 * Replaces simple VIX-threshold regime detection with:
 * - N hidden states learned from market data
 * - Transition probabilities between regimes
 * - Observation model: VIX, credit spreads, market breadth, momentum
 * - Regime persistence and change probability
 *
 * Key advantages:
 * - Learns regime boundaries from data (not hard-coded thresholds)
 * - Provides transition probabilities (what's the chance we flip to bear?)
 * - Accounts for regime persistence (regimes tend to persist)
 * - Handles multiple observation dimensions
 */

class HiddenMarkovRegimeModel {
  /**
   * @param {Object} config Configuration options
   * @param {number} config.nStates Number of hidden states (default: 4)
   * @param {number} config.maxIterations Maximum EM iterations (default: 100)
   * @param {number} config.convergenceThreshold Convergence threshold (default: 1e-6)
   */
  constructor(config = {}) {
    this.nStates = config.nStates || 4;
    this.maxIterations = config.maxIterations || 100;
    this.convergenceThreshold = config.convergenceThreshold || 1e-6;

    // State labels (learned ordering may differ)
    this.stateLabels = ['CRISIS', 'HIGH_VOL', 'NORMAL', 'LOW_VOL'];

    // Model parameters (to be learned)
    this.transitionMatrix = null;  // A[i][j] = P(state j | state i)
    this.emissionMeans = null;     // Mean of observations for each state
    this.emissionCovars = null;    // Covariance of observations for each state
    this.initialProbs = null;      // Initial state distribution

    // Observation dimensions
    this.observationDims = ['vix', 'momentum', 'breadth', 'volatility'];

    this.trained = false;
    this.lastTrainDate = null;

    console.log(`🔮 HMM Regime Model initialized (${this.nStates} states)`);
  }

  /**
   * Train the HMM using Baum-Welch (EM) algorithm
   * @param {number[][]} observations Matrix of observations (T x D)
   * @returns {Object} Training results
   */
  train(observations) {
    const T = observations.length;
    const D = observations[0].length;

    if (T < 50) {
      throw new Error(`Insufficient observations for training (need >= 50, have ${T})`);
    }

    // Initialize parameters
    this._initializeParameters(observations);

    let prevLogLikelihood = -Infinity;
    let iteration = 0;
    const history = [];

    // EM iterations
    for (iteration = 0; iteration < this.maxIterations; iteration++) {
      // E-step: Compute forward-backward probabilities
      const { alpha, beta, gamma, xi, logLikelihood } = this._eStep(observations);

      history.push(logLikelihood);

      // Check convergence
      if (Math.abs(logLikelihood - prevLogLikelihood) < this.convergenceThreshold) {
        console.log(`HMM converged at iteration ${iteration}`);
        break;
      }
      prevLogLikelihood = logLikelihood;

      // M-step: Update parameters
      this._mStep(observations, gamma, xi);
    }

    // Label states by mean VIX level (or first observation dimension)
    this._labelStates(observations);

    this.trained = true;
    this.lastTrainDate = new Date().toISOString();

    return {
      success: true,
      iterations: iteration,
      finalLogLikelihood: prevLogLikelihood,
      convergenceHistory: history,
      stateLabels: this.stateLabels,
      transitionMatrix: this.transitionMatrix.map(row => row.map(p => p.toFixed(4)))
    };
  }

  /**
   * Initialize model parameters using k-means clustering
   */
  _initializeParameters(observations) {
    const T = observations.length;
    const D = observations[0].length;
    const K = this.nStates;

    // Uniform initial distribution
    this.initialProbs = new Array(K).fill(1 / K);

    // Initialize transition matrix with persistence bias
    this.transitionMatrix = [];
    for (let i = 0; i < K; i++) {
      this.transitionMatrix[i] = [];
      for (let j = 0; j < K; j++) {
        if (i === j) {
          this.transitionMatrix[i][j] = 0.9; // High self-transition (persistence)
        } else {
          this.transitionMatrix[i][j] = 0.1 / (K - 1);
        }
      }
    }

    // Initialize emission parameters using k-means
    const { means, assignments } = this._kMeans(observations, K);
    this.emissionMeans = means;

    // Compute covariances
    this.emissionCovars = [];
    for (let k = 0; k < K; k++) {
      const stateObs = observations.filter((_, i) => assignments[i] === k);
      if (stateObs.length > D) {
        this.emissionCovars[k] = this._computeCovariance(stateObs, means[k]);
      } else {
        // Default to identity covariance if insufficient data
        this.emissionCovars[k] = this._identityMatrix(D, 0.1);
      }
    }
  }

  /**
   * E-step: Forward-backward algorithm
   */
  _eStep(observations) {
    const T = observations.length;
    const K = this.nStates;

    // Compute emission probabilities B[t][k] = P(o_t | state k)
    const B = [];
    for (let t = 0; t < T; t++) {
      B[t] = [];
      for (let k = 0; k < K; k++) {
        B[t][k] = this._gaussianPdf(observations[t], this.emissionMeans[k], this.emissionCovars[k]);
      }
    }

    // Forward pass (alpha)
    const alpha = [];
    const scale = [];

    // t = 0
    alpha[0] = [];
    let sum = 0;
    for (let k = 0; k < K; k++) {
      alpha[0][k] = this.initialProbs[k] * B[0][k];
      sum += alpha[0][k];
    }
    scale[0] = sum > 0 ? 1 / sum : 1;
    for (let k = 0; k < K; k++) {
      alpha[0][k] *= scale[0];
    }

    // t = 1 to T-1
    for (let t = 1; t < T; t++) {
      alpha[t] = [];
      sum = 0;
      for (let j = 0; j < K; j++) {
        alpha[t][j] = 0;
        for (let i = 0; i < K; i++) {
          alpha[t][j] += alpha[t - 1][i] * this.transitionMatrix[i][j];
        }
        alpha[t][j] *= B[t][j];
        sum += alpha[t][j];
      }
      scale[t] = sum > 0 ? 1 / sum : 1;
      for (let j = 0; j < K; j++) {
        alpha[t][j] *= scale[t];
      }
    }

    // Backward pass (beta)
    const beta = [];
    beta[T - 1] = new Array(K).fill(scale[T - 1]);

    for (let t = T - 2; t >= 0; t--) {
      beta[t] = [];
      for (let i = 0; i < K; i++) {
        beta[t][i] = 0;
        for (let j = 0; j < K; j++) {
          beta[t][i] += this.transitionMatrix[i][j] * B[t + 1][j] * beta[t + 1][j];
        }
        beta[t][i] *= scale[t];
      }
    }

    // Compute gamma (posterior state probabilities)
    const gamma = [];
    for (let t = 0; t < T; t++) {
      gamma[t] = [];
      let sum = 0;
      for (let k = 0; k < K; k++) {
        gamma[t][k] = alpha[t][k] * beta[t][k];
        sum += gamma[t][k];
      }
      // Normalize
      if (sum > 0) {
        for (let k = 0; k < K; k++) {
          gamma[t][k] /= sum;
        }
      }
    }

    // Compute xi (transition posteriors)
    const xi = [];
    for (let t = 0; t < T - 1; t++) {
      xi[t] = [];
      let sum = 0;
      for (let i = 0; i < K; i++) {
        xi[t][i] = [];
        for (let j = 0; j < K; j++) {
          xi[t][i][j] = alpha[t][i] * this.transitionMatrix[i][j] * B[t + 1][j] * beta[t + 1][j];
          sum += xi[t][i][j];
        }
      }
      // Normalize
      if (sum > 0) {
        for (let i = 0; i < K; i++) {
          for (let j = 0; j < K; j++) {
            xi[t][i][j] /= sum;
          }
        }
      }
    }

    // Log likelihood
    const logLikelihood = -scale.reduce((sum, s) => sum + Math.log(s), 0);

    return { alpha, beta, gamma, xi, logLikelihood };
  }

  /**
   * M-step: Update parameters
   */
  _mStep(observations, gamma, xi) {
    const T = observations.length;
    const D = observations[0].length;
    const K = this.nStates;

    // Update initial probabilities
    for (let k = 0; k < K; k++) {
      this.initialProbs[k] = gamma[0][k];
    }

    // Update transition matrix
    for (let i = 0; i < K; i++) {
      let sumGamma = 0;
      for (let t = 0; t < T - 1; t++) {
        sumGamma += gamma[t][i];
      }

      for (let j = 0; j < K; j++) {
        let sumXi = 0;
        for (let t = 0; t < T - 1; t++) {
          sumXi += xi[t][i][j];
        }
        this.transitionMatrix[i][j] = sumGamma > 0 ? sumXi / sumGamma : 1 / K;
      }
    }

    // Update emission means
    for (let k = 0; k < K; k++) {
      let sumGamma = 0;
      const newMean = new Array(D).fill(0);

      for (let t = 0; t < T; t++) {
        sumGamma += gamma[t][k];
        for (let d = 0; d < D; d++) {
          newMean[d] += gamma[t][k] * observations[t][d];
        }
      }

      if (sumGamma > 0) {
        for (let d = 0; d < D; d++) {
          this.emissionMeans[k][d] = newMean[d] / sumGamma;
        }
      }
    }

    // Update emission covariances
    for (let k = 0; k < K; k++) {
      let sumGamma = 0;
      const newCovar = this._zeroMatrix(D, D);

      for (let t = 0; t < T; t++) {
        sumGamma += gamma[t][k];
        const diff = observations[t].map((v, d) => v - this.emissionMeans[k][d]);
        for (let i = 0; i < D; i++) {
          for (let j = 0; j < D; j++) {
            newCovar[i][j] += gamma[t][k] * diff[i] * diff[j];
          }
        }
      }

      if (sumGamma > 1) {
        for (let i = 0; i < D; i++) {
          for (let j = 0; j < D; j++) {
            this.emissionCovars[k][i][j] = newCovar[i][j] / sumGamma;
          }
          // Add small diagonal for numerical stability
          this.emissionCovars[k][i][i] += 0.001;
        }
      }
    }
  }

  /**
   * Label states by mean VIX level (first observation dimension)
   */
  _labelStates(observations) {
    // Sort states by mean of first dimension (assumed to be VIX/volatility)
    const stateVix = this.emissionMeans.map((mean, idx) => ({ idx, vix: mean[0] }));
    stateVix.sort((a, b) => b.vix - a.vix); // Descending (highest VIX = CRISIS)

    // Create mapping from sorted order to state labels
    this.stateMapping = {};
    const labels = ['CRISIS', 'HIGH_VOL', 'NORMAL', 'LOW_VOL'];
    stateVix.forEach((s, i) => {
      if (i < labels.length) {
        this.stateMapping[s.idx] = labels[i];
      }
    });
  }

  /**
   * Predict current regime and transition probabilities
   * @param {number[]} observation Current observation vector [vix, momentum, breadth, volatility]
   * @param {number[]} previousState Previous state distribution (optional)
   * @returns {Object} Regime prediction
   */
  predict(observation, previousState = null) {
    if (!this.trained) {
      throw new Error('Model not trained. Call train() first.');
    }

    const K = this.nStates;

    // If no previous state, use stationary distribution
    const prior = previousState || this._getStationaryDistribution();

    // Compute emission probabilities
    const emissions = [];
    for (let k = 0; k < K; k++) {
      emissions[k] = this._gaussianPdf(observation, this.emissionMeans[k], this.emissionCovars[k]);
    }

    // Compute posterior: P(state | observation) ∝ P(observation | state) * P(state)
    let posterior = [];
    let sum = 0;
    for (let k = 0; k < K; k++) {
      // Transition from previous state distribution
      let priorK = 0;
      for (let j = 0; j < K; j++) {
        priorK += prior[j] * this.transitionMatrix[j][k];
      }
      posterior[k] = emissions[k] * priorK;
      sum += posterior[k];
    }

    // Normalize
    if (sum > 0) {
      posterior = posterior.map(p => p / sum);
    } else {
      posterior = new Array(K).fill(1 / K);
    }

    // Find most likely state
    let maxProb = 0;
    let maxState = 0;
    for (let k = 0; k < K; k++) {
      if (posterior[k] > maxProb) {
        maxProb = posterior[k];
        maxState = k;
      }
    }

    const regime = this.stateMapping[maxState] || `STATE_${maxState}`;

    // Compute transition probabilities from current state
    const transitionProbs = {};
    for (let j = 0; j < K; j++) {
      const targetRegime = this.stateMapping[j] || `STATE_${j}`;
      transitionProbs[targetRegime] = this.transitionMatrix[maxState][j];
    }

    // Compute regime persistence probability
    const persistenceProb = this.transitionMatrix[maxState][maxState];

    return {
      regime,
      confidence: maxProb,
      probabilities: this._formatProbabilities(posterior),
      transitionProbabilities: transitionProbs,
      persistence: persistenceProb,
      expectedDuration: 1 / (1 - persistenceProb), // Expected days in this regime
      observation: {
        vix: observation[0],
        momentum: observation[1],
        breadth: observation[2],
        volatility: observation[3]
      }
    };
  }

  /**
   * Get stationary distribution of the Markov chain
   */
  _getStationaryDistribution() {
    if (!this.trained) return new Array(this.nStates).fill(1 / this.nStates);

    // Power iteration to find stationary distribution
    let pi = new Array(this.nStates).fill(1 / this.nStates);

    for (let iter = 0; iter < 100; iter++) {
      const newPi = new Array(this.nStates).fill(0);
      for (let j = 0; j < this.nStates; j++) {
        for (let i = 0; i < this.nStates; i++) {
          newPi[j] += pi[i] * this.transitionMatrix[i][j];
        }
      }
      pi = newPi;
    }

    return pi;
  }

  /**
   * Format probabilities with state labels
   */
  _formatProbabilities(posterior) {
    const result = {};
    for (let k = 0; k < this.nStates; k++) {
      const label = this.stateMapping[k] || `STATE_${k}`;
      result[label] = posterior[k];
    }
    return result;
  }

  /**
   * Multivariate Gaussian PDF
   */
  _gaussianPdf(x, mean, covar) {
    const D = x.length;
    const diff = x.map((v, i) => v - mean[i]);

    // Compute determinant and inverse (simplified for small D)
    const det = this._determinant(covar);
    if (det <= 0) return 1e-300;

    const inv = this._inverse(covar);
    if (!inv) return 1e-300;

    // Mahalanobis distance
    let mahal = 0;
    for (let i = 0; i < D; i++) {
      for (let j = 0; j < D; j++) {
        mahal += diff[i] * inv[i][j] * diff[j];
      }
    }

    const normConst = Math.pow(2 * Math.PI, -D / 2) * Math.pow(det, -0.5);
    return normConst * Math.exp(-0.5 * mahal);
  }

  /**
   * Simple k-means clustering for initialization
   */
  _kMeans(data, k, maxIter = 50) {
    const n = data.length;
    const d = data[0].length;

    // Initialize centroids randomly
    const indices = [];
    while (indices.length < k) {
      const idx = Math.floor(Math.random() * n);
      if (!indices.includes(idx)) indices.push(idx);
    }
    let means = indices.map(i => [...data[i]]);

    let assignments = new Array(n).fill(0);

    for (let iter = 0; iter < maxIter; iter++) {
      // Assign points to nearest centroid
      const newAssignments = data.map(point => {
        let minDist = Infinity;
        let minIdx = 0;
        for (let j = 0; j < k; j++) {
          const dist = point.reduce((sum, v, i) => sum + (v - means[j][i]) ** 2, 0);
          if (dist < minDist) {
            minDist = dist;
            minIdx = j;
          }
        }
        return minIdx;
      });

      // Check convergence
      if (newAssignments.every((a, i) => a === assignments[i])) break;
      assignments = newAssignments;

      // Update centroids
      for (let j = 0; j < k; j++) {
        const clusterPoints = data.filter((_, i) => assignments[i] === j);
        if (clusterPoints.length > 0) {
          means[j] = new Array(d).fill(0);
          for (const point of clusterPoints) {
            for (let i = 0; i < d; i++) {
              means[j][i] += point[i] / clusterPoints.length;
            }
          }
        }
      }
    }

    return { means, assignments };
  }

  /**
   * Compute sample covariance matrix
   */
  _computeCovariance(data, mean) {
    const n = data.length;
    const d = data[0].length;
    const covar = this._zeroMatrix(d, d);

    for (const point of data) {
      for (let i = 0; i < d; i++) {
        for (let j = 0; j < d; j++) {
          covar[i][j] += (point[i] - mean[i]) * (point[j] - mean[j]);
        }
      }
    }

    for (let i = 0; i < d; i++) {
      for (let j = 0; j < d; j++) {
        covar[i][j] /= (n - 1);
      }
      covar[i][i] += 0.001; // Regularization
    }

    return covar;
  }

  /**
   * Matrix operations
   */
  _zeroMatrix(rows, cols) {
    return Array(rows).fill(null).map(() => Array(cols).fill(0));
  }

  _identityMatrix(n, scale = 1) {
    return Array(n).fill(null).map((_, i) =>
      Array(n).fill(0).map((_, j) => i === j ? scale : 0)
    );
  }

  _determinant(m) {
    const n = m.length;
    if (n === 1) return m[0][0];
    if (n === 2) return m[0][0] * m[1][1] - m[0][1] * m[1][0];
    if (n === 3) {
      return m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1])
           - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0])
           + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
    }
    // For larger matrices, use LU decomposition (simplified)
    let det = 1;
    const lu = m.map(row => [...row]);
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (Math.abs(lu[i][i]) < 1e-10) return 0;
        const factor = lu[j][i] / lu[i][i];
        for (let k = i; k < n; k++) {
          lu[j][k] -= factor * lu[i][k];
        }
      }
      det *= lu[i][i];
    }
    return det;
  }

  _inverse(m) {
    const n = m.length;
    if (n === 2) {
      const det = m[0][0] * m[1][1] - m[0][1] * m[1][0];
      if (Math.abs(det) < 1e-10) return null;
      return [
        [m[1][1] / det, -m[0][1] / det],
        [-m[1][0] / det, m[0][0] / det]
      ];
    }

    // Gauss-Jordan elimination for general case
    const aug = m.map((row, i) => [...row, ...Array(n).fill(0).map((_, j) => i === j ? 1 : 0)]);

    for (let i = 0; i < n; i++) {
      // Find pivot
      let maxRow = i;
      for (let k = i + 1; k < n; k++) {
        if (Math.abs(aug[k][i]) > Math.abs(aug[maxRow][i])) {
          maxRow = k;
        }
      }
      [aug[i], aug[maxRow]] = [aug[maxRow], aug[i]];

      if (Math.abs(aug[i][i]) < 1e-10) return null;

      // Scale row
      const scale = aug[i][i];
      for (let j = 0; j < 2 * n; j++) {
        aug[i][j] /= scale;
      }

      // Eliminate column
      for (let k = 0; k < n; k++) {
        if (k !== i) {
          const factor = aug[k][i];
          for (let j = 0; j < 2 * n; j++) {
            aug[k][j] -= factor * aug[i][j];
          }
        }
      }
    }

    return aug.map(row => row.slice(n));
  }

  /**
   * Serialize model for storage
   */
  toJSON() {
    return {
      nStates: this.nStates,
      stateLabels: this.stateLabels,
      stateMapping: this.stateMapping,
      transitionMatrix: this.transitionMatrix,
      emissionMeans: this.emissionMeans,
      emissionCovars: this.emissionCovars,
      initialProbs: this.initialProbs,
      trained: this.trained,
      lastTrainDate: this.lastTrainDate
    };
  }

  /**
   * Load model from serialized data
   */
  static fromJSON(data) {
    const model = new HiddenMarkovRegimeModel({ nStates: data.nStates });
    model.stateLabels = data.stateLabels;
    model.stateMapping = data.stateMapping;
    model.transitionMatrix = data.transitionMatrix;
    model.emissionMeans = data.emissionMeans;
    model.emissionCovars = data.emissionCovars;
    model.initialProbs = data.initialProbs;
    model.trained = data.trained;
    model.lastTrainDate = data.lastTrainDate;
    return model;
  }
}

/**
 * RegimeHMMService - Service wrapper for HMM regime detection
 */
class RegimeHMMService {
  /**
   * @param {Database} db better-sqlite3 database instance
   * @param {Object} config Configuration options
   */
  constructor(db, config = {}) {
    this.db = db;
    this.config = {
      nStates: config.nStates || 4,
      lookbackDays: config.lookbackDays || 500,
      ...config
    };

    this.model = new HiddenMarkovRegimeModel({ nStates: this.config.nStates });

    this._initStatements();
  }

  _initStatements() {
    // Get VIX data (or proxy)
    // Note: daily_prices uses 'date' column, not 'price_date'
    this.stmtGetVIX = this.db.prepare(`
      SELECT date as price_date, close as vix
      FROM daily_prices
      WHERE company_id = (SELECT id FROM companies WHERE symbol = 'VIX' OR symbol = 'VIXY' LIMIT 1)
        AND date >= date('now', '-' || ? || ' days')
      ORDER BY date
    `);

    // Get SPY for momentum calculation
    // Note: We need extra lookback for LAG to work, so we filter in a subquery
    this.stmtGetSPY = this.db.prepare(`
      SELECT price_date, close, prev_21d
      FROM (
        SELECT
          date as price_date,
          close,
          LAG(close, 21) OVER (ORDER BY date) as prev_21d
        FROM daily_prices
        WHERE company_id = (SELECT id FROM companies WHERE symbol = 'SPY')
          AND date >= date('now', '-' || (? + 30) || ' days')
        ORDER BY date
      )
      WHERE price_date >= date('now', '-' || ? || ' days')
    `);

    // Store model
    this.stmtSaveModel = this.db.prepare(`
      INSERT OR REPLACE INTO ml_models (
        model_name, model_type, model_data, created_at, updated_at
      ) VALUES ('regime_hmm', 'hmm', ?, datetime('now'), datetime('now'))
    `);

    // Load model
    this.stmtLoadModel = this.db.prepare(`
      SELECT model_data FROM ml_models WHERE model_name = 'regime_hmm'
    `);
  }

  /**
   * Train the HMM on historical market data
   */
  train(lookbackDays = null) {
    const days = lookbackDays || this.config.lookbackDays;

    // Build observation matrix
    const observations = this._buildObservations(days);

    if (observations.length < 100) {
      return {
        success: false,
        error: 'Insufficient data for training',
        dataPoints: observations.length
      };
    }

    // Train model
    const result = this.model.train(observations);

    // Save to database
    this.stmtSaveModel.run(JSON.stringify(this.model.toJSON()));

    return {
      ...result,
      dataPoints: observations.length
    };
  }

  /**
   * Load trained model from database
   */
  loadModel() {
    const row = this.stmtLoadModel.get();
    if (row && row.model_data) {
      try {
        const data = JSON.parse(row.model_data);
        this.model = HiddenMarkovRegimeModel.fromJSON(data);
        return true;
      } catch (err) {
        console.error('Failed to load HMM model:', err.message);
      }
    }
    return false;
  }

  /**
   * Get current regime prediction
   */
  getCurrentRegime() {
    // Get latest observation
    const observations = this._buildObservations(30);

    if (observations.length === 0) {
      return {
        regime: 'UNKNOWN',
        error: 'No observation data available'
      };
    }

    // If model not trained, return simple VIX-based regime
    if (!this.model.trained) {
      const vix = observations[observations.length - 1][0];
      return {
        regime: this._simpleRegime(vix),
        method: 'simple_vix',
        vix
      };
    }

    // Get prediction
    const latestObs = observations[observations.length - 1];
    return this.model.predict(latestObs);
  }

  /**
   * Build observation matrix from market data
   * Falls back to computing realized volatility from SPY if VIX is unavailable
   */
  _buildObservations(days) {
    const vixData = this.stmtGetVIX.all(days);
    const spyData = this.stmtGetSPY.all(days, days); // Pass days twice for the subquery

    // Create date-indexed maps
    const vixMap = new Map(vixData.map(d => [d.price_date, d.vix]));

    // Build observation matrix
    const observations = [];

    // Calculate rolling volatility from SPY returns for fallback
    const returns = [];
    for (let i = 1; i < spyData.length; i++) {
      if (spyData[i - 1].close > 0) {
        returns.push((spyData[i].close - spyData[i - 1].close) / spyData[i - 1].close);
      }
    }

    for (let i = 0; i < spyData.length; i++) {
      const spy = spyData[i];
      if (!spy.prev_21d) continue;

      // Get VIX or compute realized volatility as fallback
      let vix = vixMap.get(spy.price_date);
      if (!vix) {
        // Compute realized volatility from available returns (up to 21 days)
        // Use as many returns as we have, minimum 5 for statistical validity
        const windowReturns = returns.slice(Math.max(0, i - 21), i);
        if (windowReturns.length >= 5) {
          const mean = windowReturns.reduce((a, b) => a + b, 0) / windowReturns.length;
          const variance = windowReturns.reduce((a, r) => a + Math.pow(r - mean, 2), 0) / windowReturns.length;
          const dailyVol = Math.sqrt(variance);
          vix = dailyVol * Math.sqrt(252) * 100; // Annualize and convert to VIX-like scale
        }
      }
      if (!vix) continue;

      // Normalize VIX to 0-1 range (assuming VIX typically 10-80)
      const normVix = Math.min(1, Math.max(0, (vix - 10) / 70));

      // 21-day momentum
      const momentum = (spy.close - spy.prev_21d) / spy.prev_21d;
      const normMomentum = Math.min(1, Math.max(-1, momentum * 5)); // Scale to -1 to 1

      // Market breadth proxy (simplified - would need A/D data)
      const breadth = momentum > 0 ? 0.5 + momentum : 0.5 + momentum;

      // Realized volatility proxy (inverse of momentum stability)
      const volatility = Math.abs(momentum);

      observations.push([normVix, normMomentum, breadth, volatility]);
    }

    return observations;
  }

  /**
   * Simple VIX-based regime (fallback)
   */
  _simpleRegime(vix) {
    if (vix > 35) return 'CRISIS';
    if (vix > 25) return 'HIGH_VOL';
    if (vix > 15) return 'NORMAL';
    return 'LOW_VOL';
  }

  /**
   * Get model status
   */
  getStatus() {
    return {
      trained: this.model.trained,
      lastTrainDate: this.model.lastTrainDate,
      nStates: this.model.nStates,
      stateLabels: this.model.stateLabels
    };
  }
}

module.exports = {
  HiddenMarkovRegimeModel,
  RegimeHMMService
};

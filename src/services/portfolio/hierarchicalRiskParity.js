// src/services/portfolio/hierarchicalRiskParity.js
// Hierarchical Risk Parity (HRP) implementation
// Based on Marcos López de Prado's machine learning approach

/**
 * Hierarchical Risk Parity
 * More robust than Markowitz - no covariance matrix inversion required
 * Uses hierarchical clustering to group correlated assets
 */
class HierarchicalRiskParity {
  constructor(options = {}) {
    this.linkageMethod = options.linkageMethod || 'single'; // single, complete, average
  }

  /**
   * Calculate HRP weights
   * @param {Array} assets - Array of {symbol, returns}
   */
  calculateWeights(assets) {
    if (!assets || assets.length < 2) {
      return { error: 'Need at least 2 assets' };
    }

    const n = assets.length;
    const symbols = assets.map(a => a.symbol);

    // Step 1: Calculate correlation and distance matrices
    const { corrMatrix, distMatrix } = this._calculateMatrices(assets);

    // Step 2: Hierarchical clustering
    const clusters = this._hierarchicalCluster(distMatrix, symbols);

    // Step 3: Quasi-diagonalization (reorder based on cluster structure)
    const sortedIdx = this._getQuasiDiagonal(clusters, n);

    // Step 4: Calculate covariance matrix
    const covMatrix = this._calculateCovMatrix(assets);

    // Step 5: Recursive bisection for weights
    const weights = this._recursiveBisection(covMatrix, sortedIdx);

    // Build result
    const result = {
      weights: [],
      clusters: clusters,
      methodology: 'Hierarchical Risk Parity (López de Prado)',
    };

    for (let i = 0; i < n; i++) {
      result.weights.push({
        symbol: symbols[i],
        weight: Math.round(weights[i] * 10000) / 10000,
      });
    }

    // Sort by weight descending
    result.weights.sort((a, b) => b.weight - a.weight);

    // Add risk metrics
    const totalVol = this._portfolioVolatility(weights, covMatrix);
    result.portfolioVolatility = Math.round(totalVol * 10000) / 100;

    // Calculate effective number of assets
    const hhi = weights.reduce((sum, w) => sum + w * w, 0);
    result.effectiveAssets = Math.round(1 / hhi * 10) / 10;

    // Add cluster analysis
    result.clusterAnalysis = this._analyzeClusterWeights(result.weights, clusters);

    return result;
  }

  /**
   * Compare HRP with other methods
   */
  compareWithOtherMethods(assets) {
    const hrpResult = this.calculateWeights(assets);
    if (hrpResult.error) return hrpResult;

    const n = assets.length;
    const covMatrix = this._calculateCovMatrix(assets);

    // Equal Weight
    const equalWeights = new Array(n).fill(1 / n);
    const equalVol = this._portfolioVolatility(equalWeights, covMatrix);

    // Inverse Volatility (simple risk parity)
    const vols = assets.map(a => this._calculateVolatility(a.returns));
    const invVols = vols.map(v => v > 0 ? 1 / v : 0);
    const sumInvVols = invVols.reduce((a, b) => a + b, 0);
    const invVolWeights = invVols.map(iv => iv / sumInvVols);
    const invVolVol = this._portfolioVolatility(invVolWeights, covMatrix);

    // HRP weights
    const hrpWeights = assets.map(a => {
      const w = hrpResult.weights.find(w => w.symbol === a.symbol);
      return w ? w.weight : 0;
    });
    const hrpVol = this._portfolioVolatility(hrpWeights, covMatrix);

    return {
      hrp: {
        weights: hrpResult.weights,
        portfolioVolatility: Math.round(hrpVol * 10000) / 100,
        effectiveAssets: hrpResult.effectiveAssets,
      },
      equalWeight: {
        portfolioVolatility: Math.round(equalVol * 10000) / 100,
        effectiveAssets: n,
      },
      inverseVolatility: {
        weights: assets.map((a, i) => ({
          symbol: a.symbol,
          weight: Math.round(invVolWeights[i] * 10000) / 10000,
        })),
        portfolioVolatility: Math.round(invVolVol * 10000) / 100,
      },
      comparison: {
        hrpVsEqual: Math.round((hrpVol / equalVol - 1) * 10000) / 100,
        hrpVsInvVol: Math.round((hrpVol / invVolVol - 1) * 10000) / 100,
        recommendation: hrpVol <= invVolVol && hrpVol <= equalVol
          ? 'HRP produces lowest volatility'
          : invVolVol < hrpVol && invVolVol < equalVol
          ? 'Inverse Volatility may be preferred for simplicity'
          : 'Equal weight provides maximum diversification',
      },
    };
  }

  // ============================================
  // INTERNAL METHODS
  // ============================================

  _calculateMatrices(assets) {
    const n = assets.length;
    const corrMatrix = [];
    const distMatrix = [];

    // Find minimum common length
    const minLength = Math.min(...assets.map(a => a.returns?.length || 0));

    for (let i = 0; i < n; i++) {
      corrMatrix[i] = [];
      distMatrix[i] = [];

      for (let j = 0; j < n; j++) {
        if (i === j) {
          corrMatrix[i][j] = 1;
          distMatrix[i][j] = 0;
        } else if (j < i) {
          corrMatrix[i][j] = corrMatrix[j][i];
          distMatrix[i][j] = distMatrix[j][i];
        } else {
          const corr = this._correlation(
            assets[i].returns?.slice(0, minLength) || [],
            assets[j].returns?.slice(0, minLength) || []
          );
          corrMatrix[i][j] = corr;
          // Distance = sqrt(0.5 * (1 - correlation))
          distMatrix[i][j] = Math.sqrt(0.5 * (1 - corr));
        }
      }
    }

    return { corrMatrix, distMatrix };
  }

  _correlation(x, y) {
    if (x.length === 0 || y.length === 0) return 0;

    const n = Math.min(x.length, y.length);
    const meanX = x.slice(0, n).reduce((a, b) => a + b, 0) / n;
    const meanY = y.slice(0, n).reduce((a, b) => a + b, 0) / n;

    let cov = 0, varX = 0, varY = 0;
    for (let i = 0; i < n; i++) {
      const dx = x[i] - meanX;
      const dy = y[i] - meanY;
      cov += dx * dy;
      varX += dx * dx;
      varY += dy * dy;
    }

    if (varX === 0 || varY === 0) return 0;
    return cov / Math.sqrt(varX * varY);
  }

  _calculateCovMatrix(assets) {
    const n = assets.length;
    const minLength = Math.min(...assets.map(a => a.returns?.length || 0));
    const covMatrix = [];

    for (let i = 0; i < n; i++) {
      covMatrix[i] = [];
      for (let j = 0; j < n; j++) {
        if (j < i) {
          covMatrix[i][j] = covMatrix[j][i];
        } else {
          covMatrix[i][j] = this._covariance(
            assets[i].returns?.slice(0, minLength) || [],
            assets[j].returns?.slice(0, minLength) || []
          ) * 252; // Annualize
        }
      }
    }

    return covMatrix;
  }

  _covariance(x, y) {
    if (x.length === 0 || y.length === 0) return 0;

    const n = Math.min(x.length, y.length);
    const meanX = x.slice(0, n).reduce((a, b) => a + b, 0) / n;
    const meanY = y.slice(0, n).reduce((a, b) => a + b, 0) / n;

    let cov = 0;
    for (let i = 0; i < n; i++) {
      cov += (x[i] - meanX) * (y[i] - meanY);
    }
    return cov / (n - 1);
  }

  _calculateVolatility(returns) {
    if (!returns || returns.length < 2) return 0.20; // Default 20%

    const n = returns.length;
    const mean = returns.reduce((a, b) => a + b, 0) / n;
    const variance = returns.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / (n - 1);
    return Math.sqrt(variance * 252); // Annualized
  }

  /**
   * Hierarchical clustering using Lance-Williams algorithm
   */
  _hierarchicalCluster(distMatrix, symbols) {
    const n = distMatrix.length;

    // Initialize clusters - each point is its own cluster
    let clusters = symbols.map((s, i) => ({
      id: i,
      members: [i],
      symbol: s,
    }));

    // Distance matrix copy (we'll modify it)
    const dist = distMatrix.map(row => [...row]);

    const mergeHistory = [];

    // Merge until one cluster remains
    while (clusters.length > 1) {
      // Find minimum distance
      let minDist = Infinity;
      let minI = 0, minJ = 1;

      for (let i = 0; i < clusters.length; i++) {
        for (let j = i + 1; j < clusters.length; j++) {
          const d = this._clusterDistance(clusters[i], clusters[j], dist);
          if (d < minDist) {
            minDist = d;
            minI = i;
            minJ = j;
          }
        }
      }

      // Merge clusters
      const merged = {
        id: clusters.length + mergeHistory.length,
        members: [...clusters[minI].members, ...clusters[minJ].members],
        left: clusters[minI],
        right: clusters[minJ],
        distance: minDist,
      };

      mergeHistory.push({
        merged: merged.members.map(m => symbols[m]),
        distance: Math.round(minDist * 1000) / 1000,
      });

      // Remove old clusters and add merged
      clusters = clusters.filter((_, idx) => idx !== minI && idx !== minJ);
      clusters.push(merged);
    }

    return {
      tree: clusters[0],
      mergeHistory,
    };
  }

  _clusterDistance(c1, c2, distMatrix) {
    // Single linkage: minimum distance between any two points
    let minDist = Infinity;

    for (const i of c1.members) {
      for (const j of c2.members) {
        if (distMatrix[i][j] < minDist) {
          minDist = distMatrix[i][j];
        }
      }
    }

    return minDist;
  }

  /**
   * Get quasi-diagonal ordering from cluster tree
   */
  _getQuasiDiagonal(clusters, n) {
    const order = [];

    const traverse = (node) => {
      if (!node) return;

      if (node.left && node.right) {
        traverse(node.left);
        traverse(node.right);
      } else if (node.members && node.members.length === 1) {
        order.push(node.members[0]);
      }
    };

    traverse(clusters.tree);

    // If order is incomplete, add remaining indices
    if (order.length < n) {
      for (let i = 0; i < n; i++) {
        if (!order.includes(i)) order.push(i);
      }
    }

    return order;
  }

  /**
   * Recursive bisection to compute weights
   */
  _recursiveBisection(covMatrix, sortedIdx) {
    const n = sortedIdx.length;
    const weights = new Array(n).fill(1);

    // Map from sorted index to original index
    const originalIdx = sortedIdx;

    const bisect = (items) => {
      if (items.length <= 1) return;

      // Split in half
      const mid = Math.floor(items.length / 2);
      const left = items.slice(0, mid);
      const right = items.slice(mid);

      // Calculate cluster variances
      const leftVar = this._clusterVariance(left.map(i => originalIdx[i]), covMatrix);
      const rightVar = this._clusterVariance(right.map(i => originalIdx[i]), covMatrix);

      // Allocate inversely proportional to variance
      const totalInvVar = 1 / leftVar + 1 / rightVar;
      const leftWeight = (1 / leftVar) / totalInvVar;
      const rightWeight = (1 / rightVar) / totalInvVar;

      // Apply weights
      for (const i of left) {
        weights[originalIdx[i]] *= leftWeight;
      }
      for (const i of right) {
        weights[originalIdx[i]] *= rightWeight;
      }

      // Recurse
      bisect(left);
      bisect(right);
    };

    bisect([...Array(n).keys()]);

    // Normalize
    const sum = weights.reduce((a, b) => a + b, 0);
    return weights.map(w => w / sum);
  }

  _clusterVariance(indices, covMatrix) {
    // Equal-weighted cluster variance
    const n = indices.length;
    if (n === 0) return 1;

    let variance = 0;
    for (const i of indices) {
      for (const j of indices) {
        variance += covMatrix[i][j];
      }
    }
    return variance / (n * n);
  }

  _portfolioVolatility(weights, covMatrix) {
    let variance = 0;
    for (let i = 0; i < weights.length; i++) {
      for (let j = 0; j < weights.length; j++) {
        variance += weights[i] * weights[j] * covMatrix[i][j];
      }
    }
    return Math.sqrt(variance);
  }

  _analyzeClusterWeights(weights, clusters) {
    // Group weights by cluster structure
    const analysis = {
      topHoldings: weights.slice(0, 5),
      concentration: {
        top3: weights.slice(0, 3).reduce((s, w) => s + w.weight, 0),
        top5: weights.slice(0, 5).reduce((s, w) => s + w.weight, 0),
      },
      clusterCount: clusters.mergeHistory.length + 1,
    };

    return analysis;
  }
}

module.exports = { HierarchicalRiskParity };

/**
 * Worker Pool Manager
 * Manages a pool of worker threads for CPU-intensive operations
 * Tier 4 optimization
 */

const { Worker } = require('worker_threads');
const os = require('os');
const path = require('path');

class WorkerPool {
  constructor(workerPath, poolSize = null) {
    this.workerPath = workerPath;
    // Use CPU count - 1 to leave one core for the main event loop
    this.poolSize = poolSize || Math.max(1, os.cpus().length - 1);
    this.workers = [];
    this.taskQueue = [];
    this.availableWorkers = [];
    this.initialized = false;
  }

  /**
   * Initialize the worker pool (lazy initialization)
   */
  async initialize() {
    if (this.initialized) return;

    for (let i = 0; i < this.poolSize; i++) {
      this.availableWorkers.push(i);
    }
    this.initialized = true;
  }

  /**
   * Execute a task using a worker thread
   */
  async executeTask(workerData) {
    await this.initialize();

    return new Promise((resolve, reject) => {
      const task = { workerData, resolve, reject };

      if (this.availableWorkers.length > 0) {
        this._runTask(task);
      } else {
        this.taskQueue.push(task);
      }
    });
  }

  /**
   * Run a task on an available worker
   */
  _runTask(task) {
    const workerId = this.availableWorkers.pop();

    const worker = new Worker(this.workerPath, {
      workerData: task.workerData
    });

    const timeout = setTimeout(() => {
      worker.terminate();
      task.reject(new Error('Worker timeout'));
      this._releaseWorker(workerId);
    }, 30000); // 30 second timeout

    worker.on('message', (result) => {
      clearTimeout(timeout);
      task.resolve(result);
      worker.terminate();
      this._releaseWorker(workerId);
    });

    worker.on('error', (err) => {
      clearTimeout(timeout);
      task.reject(err);
      worker.terminate();
      this._releaseWorker(workerId);
    });

    worker.on('exit', (code) => {
      if (code !== 0) {
        clearTimeout(timeout);
        task.reject(new Error(`Worker exited with code ${code}`));
        this._releaseWorker(workerId);
      }
    });
  }

  /**
   * Release a worker back to the pool
   */
  _releaseWorker(workerId) {
    this.availableWorkers.push(workerId);

    // Process next task in queue if any
    if (this.taskQueue.length > 0) {
      const nextTask = this.taskQueue.shift();
      this._runTask(nextTask);
    }
  }

  /**
   * Get pool statistics
   */
  getStats() {
    return {
      poolSize: this.poolSize,
      availableWorkers: this.availableWorkers.length,
      queuedTasks: this.taskQueue.length
    };
  }

  /**
   * Shutdown the pool
   */
  async shutdown() {
    this.taskQueue = [];
    this.availableWorkers = [];
    this.initialized = false;
  }
}

/**
 * Run Monte Carlo simulation using worker threads
 * Distributes simulations across multiple cores
 */
async function runParallelMonteCarlo(config) {
  const {
    simulations = 10000,
    baseParams,
    uncertainties,
    distributionType = 'studentT',
    df = 5
  } = config;

  const numCores = Math.max(1, os.cpus().length - 1);
  const batchSize = Math.ceil(simulations / numCores);

  const workerPath = path.join(__dirname, 'monteCarloWorker.js');
  const pool = new WorkerPool(workerPath, numCores);

  try {
    // Create tasks for each batch
    const tasks = [];
    for (let i = 0; i < numCores; i++) {
      const startIdx = i * batchSize;
      const thisBatchSize = Math.min(batchSize, simulations - startIdx);

      if (thisBatchSize <= 0) break;

      tasks.push(
        pool.executeTask({
          config: {
            startIdx,
            batchSize: thisBatchSize,
            baseParams,
            uncertainties,
            distributionType,
            df
          }
        })
      );
    }

    // Wait for all workers to complete
    const results = await Promise.all(tasks);

    // Combine results from all workers
    let allValuations = [];
    for (const result of results) {
      if (result.valuations) {
        allValuations = allValuations.concat(result.valuations);
      }
    }

    return {
      success: true,
      valuations: allValuations,
      workersUsed: numCores,
      batchSize
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  } finally {
    await pool.shutdown();
  }
}

/**
 * Calculate statistics from simulation results
 */
function calculateSimulationStats(valuations, currentPrice) {
  if (!valuations || valuations.length === 0) {
    return null;
  }

  // Sort for percentile calculations
  valuations.sort((a, b) => a - b);
  const n = valuations.length;

  const percentile = (p) => {
    const idx = Math.floor(n * p);
    return valuations[Math.min(idx, n - 1)];
  };

  const expectedValue = valuations.reduce((a, b) => a + b, 0) / n;
  const variance = valuations.reduce((s, v) => s + Math.pow(v - expectedValue, 2), 0) / n;
  const stdDev = Math.sqrt(variance);

  // Probability metrics
  const pUndervalued10 = currentPrice > 0 ? valuations.filter(v => v > currentPrice * 1.10).length / n : 0;
  const pUndervalued20 = currentPrice > 0 ? valuations.filter(v => v > currentPrice * 1.20).length / n : 0;
  const pUndervalued50 = currentPrice > 0 ? valuations.filter(v => v > currentPrice * 1.50).length / n : 0;
  const pOvervalued = currentPrice > 0 ? valuations.filter(v => v < currentPrice).length / n : 0;

  return {
    simulations: n,
    expectedValue,
    standardDeviation: stdDev,
    coefficientOfVariation: (stdDev / expectedValue) * 100,
    percentiles: {
      p1: percentile(0.01),
      p5: percentile(0.05),
      p10: percentile(0.10),
      p25: percentile(0.25),
      p50: percentile(0.50),
      p75: percentile(0.75),
      p90: percentile(0.90),
      p95: percentile(0.95),
      p99: percentile(0.99)
    },
    probabilities: {
      undervalued10pct: pUndervalued10 * 100,
      undervalued20pct: pUndervalued20 * 100,
      undervalued50pct: pUndervalued50 * 100,
      overvalued: pOvervalued * 100
    }
  };
}

module.exports = {
  WorkerPool,
  runParallelMonteCarlo,
  calculateSimulationStats
};

#!/usr/bin/env python3
"""
Comprehensive ML Performance Benchmarking Suite.

Benchmarks all ML components:
- XGBoost/LightGBM inference
- SHAP explanations
- Deep learning models
- RL agent inference
- Feature computation

Usage:
    python ml_benchmark.py
    python ml_benchmark.py --iterations 100 --output results.json
"""

import sys
import json
import time
import numpy as np
import argparse
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Any, Optional
from dataclasses import dataclass, asdict
import warnings
warnings.filterwarnings('ignore')

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))


@dataclass
class BenchmarkResult:
    """Single benchmark result."""
    name: str
    category: str
    iterations: int
    mean_ms: float
    std_ms: float
    min_ms: float
    max_ms: float
    p50_ms: float
    p95_ms: float
    p99_ms: float
    throughput_per_sec: float
    memory_mb: Optional[float] = None

    def to_dict(self) -> Dict:
        return asdict(self)


class MLBenchmark:
    """ML Performance Benchmarking Suite."""

    def __init__(self, iterations: int = 50, warmup: int = 5):
        self.iterations = iterations
        self.warmup = warmup
        self.results: List[BenchmarkResult] = []

        # Check available packages
        self.has_xgb = self._check_import('xgboost')
        self.has_lgb = self._check_import('lightgbm')
        self.has_shap = self._check_import('shap')
        self.has_torch = self._check_import('torch')

    def _check_import(self, package: str) -> bool:
        try:
            __import__(package)
            return True
        except ImportError:
            return False

    def _benchmark(self, name: str, category: str, func, *args, **kwargs) -> BenchmarkResult:
        """Run benchmark for a function."""
        times = []

        # Warmup
        for _ in range(self.warmup):
            func(*args, **kwargs)

        # Actual benchmark
        for _ in range(self.iterations):
            start = time.perf_counter()
            func(*args, **kwargs)
            end = time.perf_counter()
            times.append((end - start) * 1000)  # Convert to ms

        times = np.array(times)
        result = BenchmarkResult(
            name=name,
            category=category,
            iterations=self.iterations,
            mean_ms=float(np.mean(times)),
            std_ms=float(np.std(times)),
            min_ms=float(np.min(times)),
            max_ms=float(np.max(times)),
            p50_ms=float(np.percentile(times, 50)),
            p95_ms=float(np.percentile(times, 95)),
            p99_ms=float(np.percentile(times, 99)),
            throughput_per_sec=1000 / np.mean(times)
        )

        self.results.append(result)
        return result

    def benchmark_xgboost(self) -> List[BenchmarkResult]:
        """Benchmark XGBoost inference."""
        if not self.has_xgb:
            print("  ⚠ XGBoost not available, skipping")
            return []

        import xgboost as xgb

        results = []

        # Create models of different sizes
        np.random.seed(42)

        for n_samples in [100, 1000, 10000]:
            for n_features in [10, 50, 100]:
                X_train = np.random.randn(n_samples, n_features).astype(np.float32)
                y_train = X_train[:, 0] * 0.3 + np.random.randn(n_samples) * 0.1

                model = xgb.XGBRegressor(
                    n_estimators=100,
                    max_depth=6,
                    n_jobs=1,
                    verbosity=0
                )
                model.fit(X_train, y_train)

                # Benchmark single prediction
                X_single = X_train[0:1]
                result = self._benchmark(
                    f"XGBoost predict (1 sample, {n_features} features)",
                    "XGBoost",
                    model.predict,
                    X_single
                )
                results.append(result)

                # Benchmark batch prediction
                X_batch = X_train[:100]
                result = self._benchmark(
                    f"XGBoost predict (100 samples, {n_features} features)",
                    "XGBoost",
                    model.predict,
                    X_batch
                )
                results.append(result)

        return results

    def benchmark_lightgbm(self) -> List[BenchmarkResult]:
        """Benchmark LightGBM inference."""
        if not self.has_lgb:
            print("  ⚠ LightGBM not available, skipping")
            return []

        import lightgbm as lgb

        results = []
        np.random.seed(42)

        for n_features in [10, 50, 100]:
            X_train = np.random.randn(5000, n_features).astype(np.float32)
            y_train = X_train[:, 0] * 0.3 + np.random.randn(5000) * 0.1

            model = lgb.LGBMRegressor(
                n_estimators=100,
                max_depth=6,
                n_jobs=1,
                verbosity=-1
            )
            model.fit(X_train, y_train)

            # Single prediction
            X_single = X_train[0:1]
            result = self._benchmark(
                f"LightGBM predict (1 sample, {n_features} features)",
                "LightGBM",
                model.predict,
                X_single
            )
            results.append(result)

            # Batch prediction
            X_batch = X_train[:100]
            result = self._benchmark(
                f"LightGBM predict (100 samples, {n_features} features)",
                "LightGBM",
                model.predict,
                X_batch
            )
            results.append(result)

        return results

    def benchmark_shap(self) -> List[BenchmarkResult]:
        """Benchmark SHAP explanations."""
        if not self.has_shap or not self.has_xgb:
            print("  ⚠ SHAP or XGBoost not available, skipping")
            return []

        import shap
        import xgboost as xgb

        results = []
        np.random.seed(42)

        for n_features in [10, 20, 50]:
            X = np.random.randn(1000, n_features).astype(np.float32)
            y = X[:, 0] * 0.3 - X[:, 1] * 0.2 + np.random.randn(1000) * 0.1

            model = xgb.XGBRegressor(n_estimators=50, max_depth=4, verbosity=0)
            model.fit(X, y)

            explainer = shap.TreeExplainer(model)

            # Single explanation
            X_single = X[0:1]
            result = self._benchmark(
                f"SHAP TreeExplainer (1 sample, {n_features} features)",
                "SHAP",
                explainer.shap_values,
                X_single
            )
            results.append(result)

            # Batch explanation (reduced iterations due to cost)
            X_batch = X[:10]
            old_iter = self.iterations
            self.iterations = max(10, self.iterations // 5)
            result = self._benchmark(
                f"SHAP TreeExplainer (10 samples, {n_features} features)",
                "SHAP",
                explainer.shap_values,
                X_batch
            )
            self.iterations = old_iter
            results.append(result)

        return results

    def benchmark_feature_computation(self) -> List[BenchmarkResult]:
        """Benchmark feature computation."""
        results = []
        np.random.seed(42)

        # Technical indicators
        for n_days in [100, 500, 1000]:
            prices = np.random.randn(n_days).cumsum() + 100

            def compute_sma(prices, window=20):
                return np.convolve(prices, np.ones(window)/window, mode='valid')

            result = self._benchmark(
                f"SMA-20 ({n_days} days)",
                "Features",
                compute_sma,
                prices, 20
            )
            results.append(result)

            def compute_rsi(prices, window=14):
                deltas = np.diff(prices)
                gains = np.where(deltas > 0, deltas, 0)
                losses = np.where(deltas < 0, -deltas, 0)
                avg_gain = np.convolve(gains, np.ones(window)/window, mode='valid')
                avg_loss = np.convolve(losses, np.ones(window)/window, mode='valid')
                rs = avg_gain / (avg_loss + 1e-10)
                return 100 - (100 / (1 + rs))

            result = self._benchmark(
                f"RSI-14 ({n_days} days)",
                "Features",
                compute_rsi,
                prices, 14
            )
            results.append(result)

        # Correlation matrix
        for n_assets in [10, 50, 100]:
            returns = np.random.randn(252, n_assets)

            result = self._benchmark(
                f"Correlation matrix ({n_assets} assets)",
                "Features",
                np.corrcoef,
                returns.T
            )
            results.append(result)

        return results

    def benchmark_rl_inference(self) -> List[BenchmarkResult]:
        """Benchmark RL agent inference."""
        if not self.has_torch:
            print("  ⚠ PyTorch not available, skipping RL benchmarks")
            return []

        import torch
        import torch.nn as nn

        results = []

        class SimpleActor(nn.Module):
            def __init__(self, obs_dim, action_dim, hidden_sizes=[256, 256]):
                super().__init__()
                layers = []
                prev_size = obs_dim
                for size in hidden_sizes:
                    layers.extend([nn.Linear(prev_size, size), nn.ReLU()])
                    prev_size = size
                layers.append(nn.Linear(prev_size, action_dim))
                layers.append(nn.Softmax(dim=-1))
                self.network = nn.Sequential(*layers)

            def forward(self, x):
                return self.network(x)

        for n_assets in [5, 10, 20]:
            obs_dim = n_assets * 10 + 20  # Features per asset + portfolio state
            action_dim = n_assets + 1  # Weights for each asset + cash

            actor = SimpleActor(obs_dim, action_dim)
            actor.eval()

            obs = torch.randn(1, obs_dim)

            with torch.no_grad():
                result = self._benchmark(
                    f"RL Actor inference ({n_assets} assets)",
                    "RL",
                    lambda: actor(obs)
                )
            results.append(result)

            # Batch inference
            obs_batch = torch.randn(32, obs_dim)
            with torch.no_grad():
                result = self._benchmark(
                    f"RL Actor batch inference (32 samples, {n_assets} assets)",
                    "RL",
                    lambda: actor(obs_batch)
                )
            results.append(result)

        return results

    def benchmark_portfolio_optimization(self) -> List[BenchmarkResult]:
        """Benchmark portfolio optimization computations."""
        results = []
        np.random.seed(42)

        for n_assets in [10, 50, 100]:
            returns = np.random.randn(252, n_assets) * 0.02
            cov_matrix = np.cov(returns.T)
            expected_returns = returns.mean(axis=0)

            # Mean-variance optimization (simplified)
            def optimize_portfolio(returns, cov):
                n = len(returns)
                # Equal weight as baseline
                weights = np.ones(n) / n
                # Simple gradient step
                for _ in range(10):
                    grad = returns - 2 * cov @ weights
                    weights += 0.01 * grad
                    weights = np.maximum(weights, 0)
                    weights /= weights.sum()
                return weights

            result = self._benchmark(
                f"Portfolio optimization ({n_assets} assets)",
                "Portfolio",
                optimize_portfolio,
                expected_returns, cov_matrix
            )
            results.append(result)

            # Risk calculations
            def calculate_var(returns, confidence=0.95):
                return np.percentile(returns @ np.ones(returns.shape[1])/returns.shape[1],
                                    (1 - confidence) * 100)

            result = self._benchmark(
                f"VaR calculation ({n_assets} assets)",
                "Portfolio",
                calculate_var,
                returns, 0.95
            )
            results.append(result)

        return results

    def run_all(self) -> Dict[str, Any]:
        """Run all benchmarks."""
        print("\n" + "=" * 70)
        print("ML PERFORMANCE BENCHMARK SUITE")
        print("=" * 70)
        print(f"Iterations: {self.iterations} | Warmup: {self.warmup}")
        print(f"Timestamp: {datetime.now().isoformat()}")
        print("=" * 70)

        all_results = []

        # XGBoost
        print("\n📊 Benchmarking XGBoost...")
        results = self.benchmark_xgboost()
        all_results.extend(results)
        for r in results[-2:]:  # Show last 2
            print(f"  {r.name}: {r.mean_ms:.3f}ms (±{r.std_ms:.3f})")

        # LightGBM
        print("\n📊 Benchmarking LightGBM...")
        results = self.benchmark_lightgbm()
        all_results.extend(results)
        for r in results[-2:]:
            print(f"  {r.name}: {r.mean_ms:.3f}ms (±{r.std_ms:.3f})")

        # SHAP
        print("\n📊 Benchmarking SHAP Explanations...")
        results = self.benchmark_shap()
        all_results.extend(results)
        for r in results[-2:]:
            print(f"  {r.name}: {r.mean_ms:.3f}ms (±{r.std_ms:.3f})")

        # Features
        print("\n📊 Benchmarking Feature Computation...")
        results = self.benchmark_feature_computation()
        all_results.extend(results)
        for r in results[-3:]:
            print(f"  {r.name}: {r.mean_ms:.3f}ms (±{r.std_ms:.3f})")

        # RL
        print("\n📊 Benchmarking RL Inference...")
        results = self.benchmark_rl_inference()
        all_results.extend(results)
        for r in results[-2:]:
            print(f"  {r.name}: {r.mean_ms:.3f}ms (±{r.std_ms:.3f})")

        # Portfolio
        print("\n📊 Benchmarking Portfolio Optimization...")
        results = self.benchmark_portfolio_optimization()
        all_results.extend(results)
        for r in results[-2:]:
            print(f"  {r.name}: {r.mean_ms:.3f}ms (±{r.std_ms:.3f})")

        # Summary
        summary = self._generate_summary(all_results)

        return {
            'timestamp': datetime.now().isoformat(),
            'config': {
                'iterations': self.iterations,
                'warmup': self.warmup,
            },
            'packages': {
                'xgboost': self.has_xgb,
                'lightgbm': self.has_lgb,
                'shap': self.has_shap,
                'torch': self.has_torch,
            },
            'results': [r.to_dict() for r in all_results],
            'summary': summary
        }

    def _generate_summary(self, results: List[BenchmarkResult]) -> Dict:
        """Generate benchmark summary."""
        if not results:
            return {}

        by_category = {}
        for r in results:
            if r.category not in by_category:
                by_category[r.category] = []
            by_category[r.category].append(r)

        summary = {
            'total_benchmarks': len(results),
            'categories': list(by_category.keys()),
            'by_category': {}
        }

        for cat, cat_results in by_category.items():
            means = [r.mean_ms for r in cat_results]
            summary['by_category'][cat] = {
                'count': len(cat_results),
                'avg_mean_ms': float(np.mean(means)),
                'min_mean_ms': float(np.min(means)),
                'max_mean_ms': float(np.max(means)),
                'fastest': min(cat_results, key=lambda x: x.mean_ms).name,
                'slowest': max(cat_results, key=lambda x: x.mean_ms).name,
            }

        # Performance recommendations
        recommendations = []
        for r in results:
            if r.mean_ms > 100:
                recommendations.append(f"⚠ {r.name} is slow ({r.mean_ms:.1f}ms) - consider optimization")
            elif r.mean_ms < 1:
                recommendations.append(f"✓ {r.name} is fast ({r.mean_ms:.3f}ms)")

        summary['recommendations'] = recommendations[:10]  # Top 10

        return summary


def main():
    parser = argparse.ArgumentParser(description='ML Performance Benchmarks')
    parser.add_argument('--iterations', type=int, default=50, help='Benchmark iterations')
    parser.add_argument('--warmup', type=int, default=5, help='Warmup iterations')
    parser.add_argument('--output', type=str, default=None, help='Output JSON file')

    args = parser.parse_args()

    benchmark = MLBenchmark(iterations=args.iterations, warmup=args.warmup)
    results = benchmark.run_all()

    # Print summary
    print("\n" + "=" * 70)
    print("BENCHMARK SUMMARY")
    print("=" * 70)

    summary = results['summary']
    print(f"\nTotal benchmarks: {summary['total_benchmarks']}")
    print(f"Categories: {', '.join(summary['categories'])}")

    print("\nBy Category:")
    for cat, stats in summary['by_category'].items():
        print(f"\n  {cat}:")
        print(f"    Count: {stats['count']}")
        print(f"    Avg latency: {stats['avg_mean_ms']:.3f}ms")
        print(f"    Range: {stats['min_mean_ms']:.3f}ms - {stats['max_mean_ms']:.3f}ms")
        print(f"    Fastest: {stats['fastest']}")

    if summary.get('recommendations'):
        print("\nRecommendations:")
        for rec in summary['recommendations'][:5]:
            print(f"  {rec}")

    # Save results
    if args.output:
        output_path = Path(args.output)
    else:
        output_path = Path(__file__).parent / f"benchmark_results_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"

    with open(output_path, 'w') as f:
        json.dump(results, f, indent=2, default=str)

    print(f"\n📁 Results saved to: {output_path}")
    print("=" * 70)

    return results


if __name__ == '__main__':
    main()

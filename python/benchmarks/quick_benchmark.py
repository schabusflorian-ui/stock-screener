#!/usr/bin/env python3
"""
Quick ML Performance Benchmark - Memory-safe version.
"""

import sys
import json
import time
import numpy as np
from datetime import datetime
from pathlib import Path

# Configuration
ITERATIONS = 20
WARMUP = 3

def benchmark(name, func, *args, **kwargs):
    """Run a simple benchmark."""
    times = []

    # Warmup
    for _ in range(WARMUP):
        try:
            func(*args, **kwargs)
        except:
            pass

    # Benchmark
    for _ in range(ITERATIONS):
        start = time.perf_counter()
        func(*args, **kwargs)
        end = time.perf_counter()
        times.append((end - start) * 1000)

    return {
        'name': name,
        'mean_ms': float(np.mean(times)),
        'std_ms': float(np.std(times)),
        'min_ms': float(np.min(times)),
        'max_ms': float(np.max(times)),
        'p95_ms': float(np.percentile(times, 95)),
    }

def main():
    print("=" * 60)
    print("QUICK ML BENCHMARK")
    print("=" * 60)

    results = []
    np.random.seed(42)

    # XGBoost
    try:
        import xgboost as xgb
        print("\n📊 XGBoost Benchmarks...")

        X = np.random.randn(1000, 20).astype(np.float32)
        y = X[:, 0] * 0.3 + np.random.randn(1000) * 0.1

        model = xgb.XGBRegressor(n_estimators=50, max_depth=4, verbosity=0)
        model.fit(X, y)

        # Single prediction
        r = benchmark("XGBoost predict (1 sample)", model.predict, X[0:1])
        results.append(r)
        print(f"  {r['name']}: {r['mean_ms']:.3f}ms")

        # Batch prediction
        r = benchmark("XGBoost predict (100 samples)", model.predict, X[:100])
        results.append(r)
        print(f"  {r['name']}: {r['mean_ms']:.3f}ms")

    except ImportError:
        print("  ⚠ XGBoost not available")
    except Exception as e:
        print(f"  ✗ XGBoost error: {e}")

    # LightGBM
    try:
        import lightgbm as lgb
        print("\n📊 LightGBM Benchmarks...")

        X = np.random.randn(1000, 20).astype(np.float32)
        y = X[:, 0] * 0.3 + np.random.randn(1000) * 0.1

        model = lgb.LGBMRegressor(n_estimators=50, max_depth=4, verbosity=-1)
        model.fit(X, y)

        r = benchmark("LightGBM predict (1 sample)", model.predict, X[0:1])
        results.append(r)
        print(f"  {r['name']}: {r['mean_ms']:.3f}ms")

        r = benchmark("LightGBM predict (100 samples)", model.predict, X[:100])
        results.append(r)
        print(f"  {r['name']}: {r['mean_ms']:.3f}ms")

    except ImportError:
        print("  ⚠ LightGBM not available")
    except Exception as e:
        print(f"  ✗ LightGBM error: {e}")

    # SHAP (simplified - just check if it works)
    try:
        import shap
        import xgboost as xgb
        print("\n📊 SHAP Benchmarks...")

        X = np.random.randn(200, 10).astype(np.float32)
        y = X[:, 0] * 0.3 + np.random.randn(200) * 0.1

        model = xgb.XGBRegressor(n_estimators=20, max_depth=3, verbosity=0)
        model.fit(X, y)

        explainer = shap.TreeExplainer(model)

        r = benchmark("SHAP TreeExplainer (1 sample)", explainer.shap_values, X[0:1])
        results.append(r)
        print(f"  {r['name']}: {r['mean_ms']:.3f}ms")

    except ImportError:
        print("  ⚠ SHAP not available")
    except Exception as e:
        print(f"  ✗ SHAP error: {e}")

    # PyTorch RL
    try:
        import torch
        import torch.nn as nn
        print("\n📊 RL/PyTorch Benchmarks...")

        class Actor(nn.Module):
            def __init__(self, obs_dim, action_dim):
                super().__init__()
                self.net = nn.Sequential(
                    nn.Linear(obs_dim, 128),
                    nn.ReLU(),
                    nn.Linear(128, 64),
                    nn.ReLU(),
                    nn.Linear(64, action_dim),
                    nn.Softmax(dim=-1)
                )
            def forward(self, x):
                return self.net(x)

        actor = Actor(50, 10)
        actor.eval()

        obs = torch.randn(1, 50)
        with torch.no_grad():
            r = benchmark("RL Actor inference (1 sample)", lambda: actor(obs))
        results.append(r)
        print(f"  {r['name']}: {r['mean_ms']:.3f}ms")

        obs_batch = torch.randn(32, 50)
        with torch.no_grad():
            r = benchmark("RL Actor batch (32 samples)", lambda: actor(obs_batch))
        results.append(r)
        print(f"  {r['name']}: {r['mean_ms']:.3f}ms")

    except ImportError:
        print("  ⚠ PyTorch not available")
    except Exception as e:
        print(f"  ✗ PyTorch error: {e}")

    # Feature computation
    print("\n📊 Feature Computation Benchmarks...")

    prices = np.random.randn(500).cumsum() + 100

    def compute_sma(prices, window=20):
        return np.convolve(prices, np.ones(window)/window, mode='valid')

    r = benchmark("SMA-20 (500 days)", compute_sma, prices, 20)
    results.append(r)
    print(f"  {r['name']}: {r['mean_ms']:.3f}ms")

    returns = np.random.randn(252, 50)
    r = benchmark("Correlation matrix (50 assets)", np.corrcoef, returns.T)
    results.append(r)
    print(f"  {r['name']}: {r['mean_ms']:.3f}ms")

    # Summary
    print("\n" + "=" * 60)
    print("BENCHMARK SUMMARY")
    print("=" * 60)
    print(f"Total benchmarks: {len(results)}")
    print(f"Timestamp: {datetime.now().isoformat()}")

    # Performance classification
    fast = [r for r in results if r['mean_ms'] < 1]
    medium = [r for r in results if 1 <= r['mean_ms'] < 10]
    slow = [r for r in results if r['mean_ms'] >= 10]

    print(f"\n✓ Fast (<1ms): {len(fast)}")
    for r in fast:
        print(f"    {r['name']}: {r['mean_ms']:.3f}ms")

    print(f"\n◐ Medium (1-10ms): {len(medium)}")
    for r in medium:
        print(f"    {r['name']}: {r['mean_ms']:.3f}ms")

    print(f"\n○ Slow (>10ms): {len(slow)}")
    for r in slow:
        print(f"    {r['name']}: {r['mean_ms']:.3f}ms")

    # Save results
    output = {
        'timestamp': datetime.now().isoformat(),
        'iterations': ITERATIONS,
        'results': results,
        'summary': {
            'total': len(results),
            'fast_count': len(fast),
            'medium_count': len(medium),
            'slow_count': len(slow),
        }
    }

    output_path = Path(__file__).parent / 'quick_benchmark_results.json'
    with open(output_path, 'w') as f:
        json.dump(output, f, indent=2)

    print(f"\n📁 Results saved to: {output_path}")
    print("=" * 60)

    return output

if __name__ == '__main__':
    main()

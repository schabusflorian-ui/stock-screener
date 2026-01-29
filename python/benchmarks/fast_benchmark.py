#!/usr/bin/env python3
"""
Fast ML Performance Benchmark - Minimal version that won't hang.
"""

import sys
import json
import time
import numpy as np
from datetime import datetime
import warnings
warnings.filterwarnings('ignore')

ITERATIONS = 10

def bench(name, func, *args):
    times = []
    for _ in range(ITERATIONS):
        start = time.perf_counter()
        func(*args)
        times.append((time.perf_counter() - start) * 1000)
    return {'name': name, 'mean_ms': float(np.mean(times)), 'std_ms': float(np.std(times))}

def main():
    print("=" * 60)
    print("FAST ML BENCHMARK")
    print("=" * 60)

    results = []
    np.random.seed(42)

    # XGBoost
    try:
        import xgboost as xgb
        print("\n📊 XGBoost...")
        X = np.random.randn(500, 15).astype(np.float32)
        y = X[:, 0] * 0.3 + np.random.randn(500).astype(np.float32) * 0.1
        model = xgb.XGBRegressor(n_estimators=30, max_depth=3, verbosity=0)
        model.fit(X, y)

        r = bench("XGBoost (1 sample)", model.predict, X[0:1])
        results.append(r)
        print(f"  Single: {r['mean_ms']:.3f}ms")

        r = bench("XGBoost (100 samples)", model.predict, X[:100])
        results.append(r)
        print(f"  Batch:  {r['mean_ms']:.3f}ms")
    except Exception as e:
        print(f"  ✗ {e}")

    # LightGBM
    try:
        import lightgbm as lgb
        print("\n📊 LightGBM...")
        X = np.random.randn(500, 15).astype(np.float32)
        y = X[:, 0] * 0.3 + np.random.randn(500).astype(np.float32) * 0.1
        model = lgb.LGBMRegressor(n_estimators=30, max_depth=3, verbosity=-1)
        model.fit(X, y)

        r = bench("LightGBM (1 sample)", model.predict, X[0:1])
        results.append(r)
        print(f"  Single: {r['mean_ms']:.3f}ms")

        r = bench("LightGBM (100 samples)", model.predict, X[:100])
        results.append(r)
        print(f"  Batch:  {r['mean_ms']:.3f}ms")
    except Exception as e:
        print(f"  ✗ {e}")

    # PyTorch RL
    try:
        import torch
        import torch.nn as nn
        print("\n📊 PyTorch RL...")

        net = nn.Sequential(
            nn.Linear(50, 64), nn.ReLU(),
            nn.Linear(64, 32), nn.ReLU(),
            nn.Linear(32, 10), nn.Softmax(dim=-1)
        )
        net.eval()

        obs = torch.randn(1, 50)
        with torch.no_grad():
            r = bench("RL Actor (1 sample)", lambda: net(obs))
        results.append(r)
        print(f"  Single: {r['mean_ms']:.3f}ms")

        obs32 = torch.randn(32, 50)
        with torch.no_grad():
            r = bench("RL Actor (32 samples)", lambda: net(obs32))
        results.append(r)
        print(f"  Batch:  {r['mean_ms']:.3f}ms")
    except Exception as e:
        print(f"  ✗ {e}")

    # Feature computation
    print("\n📊 Features...")
    prices = np.random.randn(500).cumsum() + 100

    r = bench("SMA-20", lambda: np.convolve(prices, np.ones(20)/20, mode='valid'))
    results.append(r)
    print(f"  SMA-20: {r['mean_ms']:.3f}ms")

    returns = np.random.randn(252, 50)
    r = bench("Correlation (50 assets)", np.corrcoef, returns.T)
    results.append(r)
    print(f"  Corr:   {r['mean_ms']:.3f}ms")

    # Summary
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)

    for r in results:
        status = "✓" if r['mean_ms'] < 1 else "○" if r['mean_ms'] < 10 else "⚠"
        print(f"  {status} {r['name']}: {r['mean_ms']:.3f}ms (±{r['std_ms']:.3f})")

    # Save
    output = {'timestamp': datetime.now().isoformat(), 'results': results}
    with open('python/benchmarks/benchmark_results.json', 'w') as f:
        json.dump(output, f, indent=2)

    print(f"\n📁 Results saved to python/benchmarks/benchmark_results.json")
    print("=" * 60)

    return output

if __name__ == '__main__':
    main()

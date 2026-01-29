# tests/benchmarks/transactionCostBenchmark.py
"""
Transaction Cost Analysis (TCA) Benchmark

Validates execution quality for production trading:
- Implementation Shortfall analysis
- VWAP deviation tracking
- Market impact measurement
- Spread cost analysis
- Timing cost attribution
- Opportunity cost (unfilled orders)

Pass Criteria:
- Implementation shortfall < 10bps for liquid names
- VWAP deviation < 5bps
- Market impact < 15bps for 1% ADV orders
- Spread cost < 3bps for S&P 500 names
"""

import numpy as np
import pandas as pd
import sqlite3
from typing import Dict, List, Optional, Tuple
from datetime import datetime, timedelta
from dataclasses import dataclass
from enum import Enum
import json
import os


class LiquidityTier(Enum):
    """Liquidity classification based on ADV"""
    MEGA_CAP = "mega_cap"       # > $10B market cap, > 10M ADV
    LARGE_CAP = "large_cap"     # $2B-$10B market cap
    MID_CAP = "mid_cap"         # $300M-$2B market cap
    SMALL_CAP = "small_cap"     # < $300M market cap
    ILLIQUID = "illiquid"       # < 100K ADV


@dataclass
class TradeExecution:
    """Single trade execution record"""
    symbol: str
    side: str  # 'buy' or 'sell'
    quantity: int
    decision_price: float  # Price when signal generated
    arrival_price: float   # Price when order sent
    execution_price: float # Average fill price
    market_vwap: float     # Market VWAP for the period
    decision_time: datetime
    execution_start: datetime
    execution_end: datetime
    adv: float             # Average Daily Volume
    volatility: float      # Daily volatility
    spread_bps: float      # Bid-ask spread in bps


@dataclass
class TCAResult:
    """TCA analysis result for a single trade"""
    symbol: str
    implementation_shortfall_bps: float
    vwap_deviation_bps: float
    market_impact_bps: float
    spread_cost_bps: float
    timing_cost_bps: float
    opportunity_cost_bps: float
    total_cost_bps: float
    liquidity_tier: LiquidityTier
    passed: bool


class TCABenchmark:
    """
    Transaction Cost Analysis benchmark for production trading validation.

    Measures and validates execution quality against hedge fund standards.
    """

    # Pass criteria (in basis points)
    THRESHOLDS = {
        'implementation_shortfall': {
            LiquidityTier.MEGA_CAP: 5,
            LiquidityTier.LARGE_CAP: 10,
            LiquidityTier.MID_CAP: 20,
            LiquidityTier.SMALL_CAP: 35,
            LiquidityTier.ILLIQUID: 75
        },
        'vwap_deviation': {
            LiquidityTier.MEGA_CAP: 3,
            LiquidityTier.LARGE_CAP: 5,
            LiquidityTier.MID_CAP: 10,
            LiquidityTier.SMALL_CAP: 20,
            LiquidityTier.ILLIQUID: 50
        },
        'market_impact': {
            LiquidityTier.MEGA_CAP: 8,
            LiquidityTier.LARGE_CAP: 15,
            LiquidityTier.MID_CAP: 25,
            LiquidityTier.SMALL_CAP: 50,
            LiquidityTier.ILLIQUID: 100
        },
        'spread_cost': {
            LiquidityTier.MEGA_CAP: 2,
            LiquidityTier.LARGE_CAP: 3,
            LiquidityTier.MID_CAP: 8,
            LiquidityTier.SMALL_CAP: 15,
            LiquidityTier.ILLIQUID: 50
        }
    }

    # Almgren-Chriss model parameters
    AC_ETA = 0.142      # Temporary impact coefficient
    AC_GAMMA = 0.314    # Permanent impact coefficient

    def __init__(self, db_path: str):
        self.db_path = db_path
        self.results: List[TCAResult] = []

    def classify_liquidity(self, adv: float, market_cap: float = None) -> LiquidityTier:
        """Classify stock into liquidity tier"""
        if market_cap and market_cap > 10e9 and adv > 10e6:
            return LiquidityTier.MEGA_CAP
        elif adv > 5e6 or (market_cap and market_cap > 2e9):
            return LiquidityTier.LARGE_CAP
        elif adv > 1e6 or (market_cap and market_cap > 300e6):
            return LiquidityTier.MID_CAP
        elif adv > 100e3:
            return LiquidityTier.SMALL_CAP
        else:
            return LiquidityTier.ILLIQUID

    def calculate_implementation_shortfall(
        self,
        decision_price: float,
        execution_price: float,
        side: str
    ) -> float:
        """
        Calculate Implementation Shortfall (IS).

        IS = (Execution Price - Decision Price) / Decision Price
        For buys: positive IS = slippage (bad)
        For sells: negative IS = slippage (bad)

        Returns: IS in basis points (always positive for cost)
        """
        if decision_price <= 0:
            return 0.0

        is_raw = (execution_price - decision_price) / decision_price

        # Adjust sign based on trade direction
        if side.lower() == 'buy':
            is_cost = is_raw  # Paying more is a cost
        else:
            is_cost = -is_raw  # Receiving less is a cost

        return is_cost * 10000  # Convert to bps

    def calculate_vwap_deviation(
        self,
        execution_price: float,
        market_vwap: float,
        side: str
    ) -> float:
        """
        Calculate deviation from VWAP.

        Returns: Deviation in basis points (positive = cost)
        """
        if market_vwap <= 0:
            return 0.0

        deviation = (execution_price - market_vwap) / market_vwap

        if side.lower() == 'buy':
            dev_cost = deviation  # Paying above VWAP is a cost
        else:
            dev_cost = -deviation  # Receiving below VWAP is a cost

        return dev_cost * 10000  # Convert to bps

    def calculate_market_impact(
        self,
        quantity: int,
        adv: float,
        volatility: float,
        side: str
    ) -> Tuple[float, float, float]:
        """
        Calculate market impact using Almgren-Chriss square-root model.

        Returns: (temporary_impact_bps, permanent_impact_bps, total_impact_bps)
        """
        if adv <= 0 or quantity <= 0 or volatility <= 0:
            return 0.0, 0.0, 0.0

        participation_rate = quantity / adv

        # Square-root impact model
        temporary = self.AC_ETA * volatility * np.sqrt(participation_rate)
        permanent = self.AC_GAMMA * volatility * participation_rate

        total = temporary + permanent

        return (
            temporary * 10000,
            permanent * 10000,
            total * 10000
        )

    def calculate_timing_cost(
        self,
        decision_price: float,
        arrival_price: float,
        side: str
    ) -> float:
        """
        Calculate timing/delay cost.

        Cost from delay between signal generation and order placement.

        Returns: Timing cost in basis points
        """
        if decision_price <= 0:
            return 0.0

        timing = (arrival_price - decision_price) / decision_price

        if side.lower() == 'buy':
            timing_cost = timing  # Price moved up before we bought
        else:
            timing_cost = -timing  # Price moved down before we sold

        return max(0, timing_cost * 10000)  # Only positive costs

    def analyze_trade(self, trade: TradeExecution) -> TCAResult:
        """
        Perform full TCA analysis on a single trade.
        """
        liquidity_tier = self.classify_liquidity(trade.adv)

        # Implementation Shortfall
        is_bps = self.calculate_implementation_shortfall(
            trade.decision_price,
            trade.execution_price,
            trade.side
        )

        # VWAP Deviation
        vwap_dev_bps = self.calculate_vwap_deviation(
            trade.execution_price,
            trade.market_vwap,
            trade.side
        )

        # Market Impact
        temp_impact, perm_impact, total_impact = self.calculate_market_impact(
            trade.quantity,
            trade.adv,
            trade.volatility,
            trade.side
        )

        # Timing Cost
        timing_bps = self.calculate_timing_cost(
            trade.decision_price,
            trade.arrival_price,
            trade.side
        )

        # Spread Cost (half-spread for each side)
        spread_cost_bps = trade.spread_bps / 2

        # Opportunity Cost (assume 0 for filled orders)
        opp_cost_bps = 0.0

        # Total Cost
        total_cost = is_bps  # IS includes all costs

        # Check pass criteria
        passed = self._check_thresholds(
            is_bps, vwap_dev_bps, total_impact, spread_cost_bps, liquidity_tier
        )

        result = TCAResult(
            symbol=trade.symbol,
            implementation_shortfall_bps=is_bps,
            vwap_deviation_bps=vwap_dev_bps,
            market_impact_bps=total_impact,
            spread_cost_bps=spread_cost_bps,
            timing_cost_bps=timing_bps,
            opportunity_cost_bps=opp_cost_bps,
            total_cost_bps=total_cost,
            liquidity_tier=liquidity_tier,
            passed=passed
        )

        self.results.append(result)
        return result

    def _check_thresholds(
        self,
        is_bps: float,
        vwap_dev_bps: float,
        impact_bps: float,
        spread_bps: float,
        tier: LiquidityTier
    ) -> bool:
        """Check if trade meets pass criteria for its liquidity tier"""
        checks = [
            abs(is_bps) <= self.THRESHOLDS['implementation_shortfall'][tier],
            abs(vwap_dev_bps) <= self.THRESHOLDS['vwap_deviation'][tier],
            abs(impact_bps) <= self.THRESHOLDS['market_impact'][tier],
            abs(spread_bps) <= self.THRESHOLDS['spread_cost'][tier]
        ]
        return all(checks)

    def run_benchmark(
        self,
        trades: List[TradeExecution],
        verbose: bool = True
    ) -> Dict:
        """
        Run TCA benchmark on a list of trades.
        """
        self.results = []

        if verbose:
            print("=" * 70)
            print("TRANSACTION COST ANALYSIS (TCA) BENCHMARK")
            print("=" * 70)

        # Analyze each trade
        for trade in trades:
            self.analyze_trade(trade)

        # Aggregate results
        summary = self._aggregate_results()

        if verbose:
            self._print_summary(summary)

        return summary

    def _aggregate_results(self) -> Dict:
        """Aggregate TCA results into summary statistics"""
        if not self.results:
            return {'error': 'No trades analyzed'}

        # Convert to arrays for statistics
        is_vals = [r.implementation_shortfall_bps for r in self.results]
        vwap_vals = [r.vwap_deviation_bps for r in self.results]
        impact_vals = [r.market_impact_bps for r in self.results]
        spread_vals = [r.spread_cost_bps for r in self.results]
        timing_vals = [r.timing_cost_bps for r in self.results]
        total_vals = [r.total_cost_bps for r in self.results]

        # Count passes by tier
        tier_stats = {}
        for tier in LiquidityTier:
            tier_results = [r for r in self.results if r.liquidity_tier == tier]
            if tier_results:
                tier_stats[tier.value] = {
                    'count': len(tier_results),
                    'passed': sum(1 for r in tier_results if r.passed),
                    'pass_rate': sum(1 for r in tier_results if r.passed) / len(tier_results),
                    'avg_is_bps': np.mean([r.implementation_shortfall_bps for r in tier_results]),
                    'avg_vwap_dev_bps': np.mean([r.vwap_deviation_bps for r in tier_results])
                }

        # Overall pass rate
        total_passed = sum(1 for r in self.results if r.passed)
        pass_rate = total_passed / len(self.results)

        return {
            'total_trades': len(self.results),
            'passed': total_passed,
            'failed': len(self.results) - total_passed,
            'pass_rate': pass_rate,
            'overall_status': 'PASS' if pass_rate >= 0.80 else 'FAIL',
            'metrics': {
                'implementation_shortfall': {
                    'mean_bps': float(np.mean(is_vals)),
                    'median_bps': float(np.median(is_vals)),
                    'std_bps': float(np.std(is_vals)),
                    'p95_bps': float(np.percentile(is_vals, 95)),
                    'max_bps': float(np.max(np.abs(is_vals)))
                },
                'vwap_deviation': {
                    'mean_bps': float(np.mean(vwap_vals)),
                    'median_bps': float(np.median(vwap_vals)),
                    'std_bps': float(np.std(vwap_vals)),
                    'p95_bps': float(np.percentile(np.abs(vwap_vals), 95)),
                    'max_bps': float(np.max(np.abs(vwap_vals)))
                },
                'market_impact': {
                    'mean_bps': float(np.mean(impact_vals)),
                    'median_bps': float(np.median(impact_vals)),
                    'std_bps': float(np.std(impact_vals)),
                    'max_bps': float(np.max(impact_vals))
                },
                'spread_cost': {
                    'mean_bps': float(np.mean(spread_vals)),
                    'median_bps': float(np.median(spread_vals)),
                    'max_bps': float(np.max(spread_vals))
                },
                'timing_cost': {
                    'mean_bps': float(np.mean(timing_vals)),
                    'median_bps': float(np.median(timing_vals)),
                    'max_bps': float(np.max(timing_vals))
                },
                'total_cost': {
                    'mean_bps': float(np.mean(total_vals)),
                    'median_bps': float(np.median(total_vals)),
                    'std_bps': float(np.std(total_vals)),
                    'p95_bps': float(np.percentile(np.abs(total_vals), 95))
                }
            },
            'by_liquidity_tier': tier_stats,
            'thresholds': {
                k: {tier.value: v for tier, v in thresholds.items()}
                for k, thresholds in self.THRESHOLDS.items()
            }
        }

    def _print_summary(self, summary: Dict):
        """Print formatted summary"""
        print(f"\nTotal Trades Analyzed: {summary['total_trades']}")
        print(f"Passed: {summary['passed']} ({summary['pass_rate']*100:.1f}%)")
        print(f"Failed: {summary['failed']}")
        print(f"\nOverall Status: {summary['overall_status']}")

        print("\n" + "-" * 70)
        print("COST BREAKDOWN (basis points)")
        print("-" * 70)

        metrics = summary['metrics']
        print(f"{'Metric':<25} {'Mean':>10} {'Median':>10} {'P95':>10} {'Max':>10}")
        print("-" * 70)

        print(f"{'Implementation Shortfall':<25} "
              f"{metrics['implementation_shortfall']['mean_bps']:>10.2f} "
              f"{metrics['implementation_shortfall']['median_bps']:>10.2f} "
              f"{metrics['implementation_shortfall']['p95_bps']:>10.2f} "
              f"{metrics['implementation_shortfall']['max_bps']:>10.2f}")

        print(f"{'VWAP Deviation':<25} "
              f"{metrics['vwap_deviation']['mean_bps']:>10.2f} "
              f"{metrics['vwap_deviation']['median_bps']:>10.2f} "
              f"{metrics['vwap_deviation']['p95_bps']:>10.2f} "
              f"{metrics['vwap_deviation']['max_bps']:>10.2f}")

        print(f"{'Market Impact':<25} "
              f"{metrics['market_impact']['mean_bps']:>10.2f} "
              f"{metrics['market_impact']['median_bps']:>10.2f} "
              f"{'N/A':>10} "
              f"{metrics['market_impact']['max_bps']:>10.2f}")

        print(f"{'Spread Cost':<25} "
              f"{metrics['spread_cost']['mean_bps']:>10.2f} "
              f"{metrics['spread_cost']['median_bps']:>10.2f} "
              f"{'N/A':>10} "
              f"{metrics['spread_cost']['max_bps']:>10.2f}")

        print("\n" + "-" * 70)
        print("BY LIQUIDITY TIER")
        print("-" * 70)

        for tier, stats in summary.get('by_liquidity_tier', {}).items():
            print(f"{tier:<15}: {stats['count']:>4} trades, "
                  f"{stats['pass_rate']*100:>5.1f}% pass, "
                  f"Avg IS: {stats['avg_is_bps']:>6.2f} bps")

    def simulate_trades_from_db(
        self,
        start_date: str = '2024-01-01',
        end_date: str = '2024-12-31',
        n_trades: int = 500
    ) -> List[TradeExecution]:
        """
        Simulate realistic trades using historical data from database.
        """
        conn = sqlite3.connect(self.db_path)

        # Get stocks with sufficient data
        query = """
            SELECT c.symbol,
                   AVG(dp.volume) as avg_volume,
                   AVG(dp.close) as avg_price,
                   COUNT(*) as days
            FROM daily_prices dp
            JOIN companies c ON dp.company_id = c.id
            WHERE dp.date >= ? AND dp.date <= ?
            GROUP BY c.symbol
            HAVING days >= 100 AND avg_volume > 100000
            ORDER BY avg_volume DESC
            LIMIT 200
        """

        stocks_df = pd.read_sql_query(query, conn, params=(start_date, end_date))

        if len(stocks_df) == 0:
            conn.close()
            return []

        trades = []
        np.random.seed(42)

        for _ in range(n_trades):
            # Select random stock
            stock = stocks_df.sample(1).iloc[0]
            symbol = stock['symbol']
            adv = stock['avg_volume']
            avg_price = stock['avg_price']

            # Classify liquidity
            tier = self.classify_liquidity(adv)

            # Generate realistic trade parameters based on tier
            if tier == LiquidityTier.MEGA_CAP:
                participation = np.random.uniform(0.001, 0.01)
                volatility = np.random.uniform(0.01, 0.02)
                spread_bps = np.random.uniform(1, 3)
            elif tier == LiquidityTier.LARGE_CAP:
                participation = np.random.uniform(0.005, 0.02)
                volatility = np.random.uniform(0.015, 0.025)
                spread_bps = np.random.uniform(2, 5)
            elif tier == LiquidityTier.MID_CAP:
                participation = np.random.uniform(0.01, 0.03)
                volatility = np.random.uniform(0.02, 0.035)
                spread_bps = np.random.uniform(5, 15)
            elif tier == LiquidityTier.SMALL_CAP:
                participation = np.random.uniform(0.02, 0.05)
                volatility = np.random.uniform(0.025, 0.045)
                spread_bps = np.random.uniform(10, 30)
            else:
                participation = np.random.uniform(0.03, 0.08)
                volatility = np.random.uniform(0.03, 0.06)
                spread_bps = np.random.uniform(20, 75)

            quantity = int(adv * participation)
            side = np.random.choice(['buy', 'sell'])

            # Simulate price movements
            decision_price = avg_price * (1 + np.random.normal(0, 0.005))

            # Timing cost: price moves slightly before arrival
            timing_move = np.random.normal(0, volatility * 0.3)
            if side == 'buy':
                arrival_price = decision_price * (1 + abs(timing_move) * 0.5)
            else:
                arrival_price = decision_price * (1 - abs(timing_move) * 0.5)

            # Execution price includes market impact
            temp_impact, perm_impact, _ = self.calculate_market_impact(
                quantity, adv, volatility, side
            )
            total_impact = (temp_impact + perm_impact) / 10000

            if side == 'buy':
                execution_price = arrival_price * (1 + total_impact + spread_bps/20000)
            else:
                execution_price = arrival_price * (1 - total_impact - spread_bps/20000)

            # Add some noise to make it realistic
            execution_price *= (1 + np.random.normal(0, 0.001))

            # Market VWAP (close to execution price with some variation)
            vwap_deviation = np.random.normal(0, 0.002)
            market_vwap = execution_price * (1 + vwap_deviation)

            trade = TradeExecution(
                symbol=symbol,
                side=side,
                quantity=quantity,
                decision_price=decision_price,
                arrival_price=arrival_price,
                execution_price=execution_price,
                market_vwap=market_vwap,
                decision_time=datetime.now() - timedelta(hours=np.random.randint(1, 100)),
                execution_start=datetime.now() - timedelta(hours=np.random.randint(0, 50)),
                execution_end=datetime.now(),
                adv=adv,
                volatility=volatility,
                spread_bps=spread_bps
            )

            trades.append(trade)

        conn.close()
        return trades

    def run_full_benchmark(self, verbose: bool = True) -> Dict:
        """Run full TCA benchmark with simulated trades"""
        if verbose:
            print("\nGenerating simulated trades from historical data...")

        trades = self.simulate_trades_from_db(
            start_date='2023-01-01',
            end_date='2025-12-31',
            n_trades=500
        )

        if not trades:
            return {'error': 'Could not generate trades from database'}

        if verbose:
            print(f"Generated {len(trades)} simulated trades\n")

        return self.run_benchmark(trades, verbose=verbose)


def main():
    """Run TCA benchmark"""
    db_path = os.path.join(os.path.dirname(__file__), '../../data/stocks.db')

    benchmark = TCABenchmark(db_path)
    results = benchmark.run_full_benchmark(verbose=True)

    # Save results
    output_dir = os.path.join(os.path.dirname(__file__), '../../benchmark_results')
    os.makedirs(output_dir, exist_ok=True)

    output_file = os.path.join(output_dir, f'tca_benchmark_{datetime.now().strftime("%Y%m%d_%H%M%S")}.json')

    with open(output_file, 'w') as f:
        json.dump(results, f, indent=2, default=str)

    print(f"\nResults saved to: {output_file}")

    return results


if __name__ == '__main__':
    main()

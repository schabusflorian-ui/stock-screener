# tests/benchmarks/liquidityStressBenchmark.py
"""
Liquidity Stress Testing Benchmark

Tests portfolio survival under extreme market conditions:
- Spread widening (5x normal)
- Volume collapse (20% normal volume)
- Flash crash scenarios
- Redemption cascades
- Correlation breakdown
- Market closure

Pass Criteria:
- Survives 5x spread shock with < 50bps additional cost
- Can exit 90% of portfolio within 5 days under stress
- No margin calls triggered in flash crash
- Correlation breakdown drawdown < 2x normal
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


class StressScenario(Enum):
    """Liquidity stress scenarios"""
    SPREAD_SHOCK = "spread_shock"
    VOLUME_COLLAPSE = "volume_collapse"
    FLASH_CRASH = "flash_crash"
    REDEMPTION_CASCADE = "redemption_cascade"
    CORRELATION_BREAKDOWN = "correlation_breakdown"
    MARKET_HALT = "market_halt"


@dataclass
class StressParameters:
    """Parameters for a stress scenario"""
    spread_multiplier: float = 1.0
    volume_multiplier: float = 1.0
    price_shock: float = 0.0
    forced_liquidation_pct: float = 0.0
    time_horizon_days: int = 5
    correlation_override: Optional[float] = None
    gap_on_reopen: float = 0.0
    days_closed: int = 0


@dataclass
class Position:
    """Portfolio position"""
    symbol: str
    quantity: int
    entry_price: float
    current_price: float
    market_value: float
    adv: float  # Average Daily Volume
    volatility: float
    sector: str


@dataclass
class StressResult:
    """Result of a stress test"""
    scenario: StressScenario
    initial_portfolio_value: float
    final_portfolio_value: float
    drawdown_pct: float
    liquidation_cost_bps: float
    days_to_exit_90pct: int
    margin_call_triggered: bool
    cash_buffer_depleted: bool
    passed: bool
    details: Dict


class LiquidityStressBenchmark:
    """
    Liquidity Stress Testing for production trading validation.

    Tests portfolio resilience under extreme market conditions.
    """

    # Scenario definitions
    SCENARIOS = {
        StressScenario.SPREAD_SHOCK: StressParameters(
            spread_multiplier=5.0,
            volume_multiplier=0.5
        ),
        StressScenario.VOLUME_COLLAPSE: StressParameters(
            spread_multiplier=2.0,
            volume_multiplier=0.2
        ),
        StressScenario.FLASH_CRASH: StressParameters(
            spread_multiplier=10.0,
            volume_multiplier=0.1,
            price_shock=-0.10
        ),
        StressScenario.REDEMPTION_CASCADE: StressParameters(
            spread_multiplier=3.0,
            volume_multiplier=0.3,
            forced_liquidation_pct=0.20,
            time_horizon_days=1
        ),
        StressScenario.CORRELATION_BREAKDOWN: StressParameters(
            spread_multiplier=2.0,
            volume_multiplier=0.4,
            price_shock=-0.05,
            correlation_override=0.95
        ),
        StressScenario.MARKET_HALT: StressParameters(
            days_closed=3,
            gap_on_reopen=-0.05
        )
    }

    # Pass thresholds
    THRESHOLDS = {
        'spread_shock_cost_bps': 50,
        'exit_90pct_days': 5,
        'flash_crash_margin_call': False,
        'correlation_drawdown_multiplier': 2.0,
        'redemption_cost_bps': 100,
        'market_halt_cash_buffer': True
    }

    # Almgren-Chriss parameters
    AC_ETA = 0.142
    AC_GAMMA = 0.314

    def __init__(self, db_path: str):
        self.db_path = db_path
        self.results: List[StressResult] = []

    def calculate_liquidation_cost(
        self,
        position: Position,
        params: StressParameters,
        participation_rate: float = 0.1
    ) -> Tuple[float, int]:
        """
        Calculate cost to liquidate a position under stress.

        Returns: (cost_bps, days_to_liquidate)
        """
        if position.adv <= 0 or position.quantity <= 0:
            return 0.0, 0

        # Adjust volume for stress scenario
        stressed_adv = position.adv * params.volume_multiplier

        # Maximum shares per day based on participation rate
        max_shares_per_day = stressed_adv * participation_rate

        # Days to liquidate
        days_to_liquidate = int(np.ceil(position.quantity / max_shares_per_day))

        # Calculate market impact per day
        daily_shares = min(position.quantity, max_shares_per_day)
        daily_participation = daily_shares / stressed_adv

        # Square-root impact with stressed parameters
        volatility_stress = position.volatility * np.sqrt(params.spread_multiplier)

        temporary_impact = self.AC_ETA * volatility_stress * np.sqrt(daily_participation)
        permanent_impact = self.AC_GAMMA * volatility_stress * daily_participation

        # Spread cost (half-spread on each trade)
        base_spread_bps = self._estimate_spread(position.adv, position.volatility)
        stressed_spread_bps = base_spread_bps * params.spread_multiplier

        # Total cost per day
        daily_impact_bps = (temporary_impact + permanent_impact) * 10000
        daily_spread_bps = stressed_spread_bps / 2

        # Accumulate costs over liquidation period
        # Later days face permanent impact from earlier days
        total_cost_bps = 0
        for day in range(days_to_liquidate):
            # Permanent impact accumulates
            perm_accumulated = permanent_impact * day * 10000
            total_cost_bps += daily_impact_bps + daily_spread_bps + perm_accumulated * 0.5

        # Average cost
        avg_cost_bps = total_cost_bps / days_to_liquidate if days_to_liquidate > 0 else 0

        return avg_cost_bps, days_to_liquidate

    def _estimate_spread(self, adv: float, volatility: float) -> float:
        """Estimate bid-ask spread in basis points"""
        if adv > 10e6:
            base = 2
        elif adv > 5e6:
            base = 4
        elif adv > 1e6:
            base = 8
        elif adv > 100e3:
            base = 15
        else:
            base = 40

        # Volatility adjustment
        vol_mult = 1 + (volatility - 0.02) * 10
        return base * max(0.5, min(2.0, vol_mult))

    def run_scenario(
        self,
        positions: List[Position],
        scenario: StressScenario,
        initial_cash: float = 0,
        margin_requirement: float = 0.25,
        verbose: bool = False
    ) -> StressResult:
        """
        Run a single stress scenario on the portfolio.
        """
        params = self.SCENARIOS[scenario]

        # Calculate initial portfolio value
        initial_value = sum(p.market_value for p in positions) + initial_cash

        if verbose:
            print(f"\n  Running scenario: {scenario.value}")
            print(f"  Initial portfolio value: ${initial_value:,.0f}")

        # Apply price shock if any
        shocked_positions = []
        for p in positions:
            new_price = p.current_price * (1 + params.price_shock)
            new_value = new_price * p.quantity
            shocked_positions.append(Position(
                symbol=p.symbol,
                quantity=p.quantity,
                entry_price=p.entry_price,
                current_price=new_price,
                market_value=new_value,
                adv=p.adv * params.volume_multiplier,
                volatility=p.volatility * np.sqrt(params.spread_multiplier),
                sector=p.sector
            ))

        shocked_value = sum(p.market_value for p in shocked_positions) + initial_cash

        # Apply correlation breakdown if specified
        if params.correlation_override:
            # All positions move together - amplifies losses
            correlation_impact = params.correlation_override * 0.05
            shocked_value *= (1 - correlation_impact)

        # Calculate liquidation costs
        total_liquidation_cost_bps = 0
        max_days_to_exit = 0
        liquidation_details = []

        for p in shocked_positions:
            if params.forced_liquidation_pct > 0:
                shares_to_sell = int(p.quantity * params.forced_liquidation_pct)
                temp_position = Position(
                    symbol=p.symbol,
                    quantity=shares_to_sell,
                    entry_price=p.entry_price,
                    current_price=p.current_price,
                    market_value=p.current_price * shares_to_sell,
                    adv=p.adv,
                    volatility=p.volatility,
                    sector=p.sector
                )
                cost_bps, days = self.calculate_liquidation_cost(
                    temp_position, params,
                    participation_rate=0.2  # More aggressive in forced liquidation
                )
            else:
                cost_bps, days = self.calculate_liquidation_cost(p, params)

            total_liquidation_cost_bps += cost_bps * (p.market_value / shocked_value)
            max_days_to_exit = max(max_days_to_exit, days)

            liquidation_details.append({
                'symbol': p.symbol,
                'cost_bps': cost_bps,
                'days_to_exit': days
            })

        # Apply liquidation costs
        final_value = shocked_value * (1 - total_liquidation_cost_bps / 10000)

        # Check margin call
        equity = final_value
        margin_requirement_value = initial_value * margin_requirement
        margin_call_triggered = equity < margin_requirement_value

        # Check cash buffer (for market halt)
        cash_buffer_depleted = False
        if scenario == StressScenario.MARKET_HALT:
            # Assume need 5% cash buffer for 3 days
            required_buffer = initial_value * 0.05
            cash_buffer_depleted = initial_cash < required_buffer

        # Calculate drawdown
        drawdown_pct = (initial_value - final_value) / initial_value * 100

        # Determine pass/fail
        passed = self._check_pass_criteria(
            scenario, total_liquidation_cost_bps, max_days_to_exit,
            margin_call_triggered, cash_buffer_depleted, drawdown_pct
        )

        result = StressResult(
            scenario=scenario,
            initial_portfolio_value=initial_value,
            final_portfolio_value=final_value,
            drawdown_pct=drawdown_pct,
            liquidation_cost_bps=total_liquidation_cost_bps,
            days_to_exit_90pct=max_days_to_exit,
            margin_call_triggered=margin_call_triggered,
            cash_buffer_depleted=cash_buffer_depleted,
            passed=passed,
            details={
                'params': {
                    'spread_multiplier': params.spread_multiplier,
                    'volume_multiplier': params.volume_multiplier,
                    'price_shock': params.price_shock
                },
                'liquidation_details': liquidation_details
            }
        )

        if verbose:
            status = 'PASS' if passed else 'FAIL'
            print(f"  Drawdown: {drawdown_pct:.2f}%")
            print(f"  Liquidation cost: {total_liquidation_cost_bps:.1f} bps")
            print(f"  Days to exit 90%: {max_days_to_exit}")
            print(f"  Status: [{status}]")

        self.results.append(result)
        return result

    def _check_pass_criteria(
        self,
        scenario: StressScenario,
        cost_bps: float,
        days_to_exit: int,
        margin_call: bool,
        cash_depleted: bool,
        drawdown_pct: float
    ) -> bool:
        """Check if scenario passes criteria"""

        if scenario == StressScenario.SPREAD_SHOCK:
            return cost_bps <= self.THRESHOLDS['spread_shock_cost_bps']

        elif scenario == StressScenario.VOLUME_COLLAPSE:
            return days_to_exit <= self.THRESHOLDS['exit_90pct_days']

        elif scenario == StressScenario.FLASH_CRASH:
            return not margin_call

        elif scenario == StressScenario.REDEMPTION_CASCADE:
            return cost_bps <= self.THRESHOLDS['redemption_cost_bps']

        elif scenario == StressScenario.CORRELATION_BREAKDOWN:
            # Compare to "normal" drawdown (use 5% as baseline)
            normal_drawdown = 5.0
            return drawdown_pct <= normal_drawdown * self.THRESHOLDS['correlation_drawdown_multiplier']

        elif scenario == StressScenario.MARKET_HALT:
            return not cash_depleted

        return True

    def generate_sample_portfolio(
        self,
        n_positions: int = 30,
        total_value: float = 10_000_000
    ) -> Tuple[List[Position], float]:
        """Generate a sample portfolio from database"""
        conn = sqlite3.connect(self.db_path)

        query = """
            SELECT c.symbol, c.sector,
                   AVG(dp.volume) as avg_volume,
                   AVG(dp.close) as avg_price,
                   STDEV(dp.close/LAG(dp.close) OVER (PARTITION BY c.id ORDER BY dp.date) - 1) as volatility
            FROM daily_prices dp
            JOIN companies c ON dp.company_id = c.id
            WHERE dp.date >= date('now', '-1 year')
            GROUP BY c.symbol
            HAVING avg_volume > 500000
            ORDER BY avg_volume DESC
            LIMIT 100
        """

        try:
            stocks_df = pd.read_sql_query(query, conn)
        except:
            # Fallback if STDEV not supported
            query_simple = """
                SELECT c.symbol, c.sector,
                       AVG(dp.volume) as avg_volume,
                       AVG(dp.close) as avg_price
                FROM daily_prices dp
                JOIN companies c ON dp.company_id = c.id
                WHERE dp.date >= date('now', '-1 year')
                GROUP BY c.symbol
                HAVING avg_volume > 500000
                ORDER BY avg_volume DESC
                LIMIT 100
            """
            stocks_df = pd.read_sql_query(query_simple, conn)
            stocks_df['volatility'] = 0.02  # Default volatility

        conn.close()

        if len(stocks_df) < n_positions:
            n_positions = len(stocks_df)

        # Select random stocks for portfolio
        selected = stocks_df.sample(n=n_positions)

        # Allocate capital (slightly unequal weights)
        weights = np.random.dirichlet(np.ones(n_positions) * 5)
        allocations = weights * total_value

        positions = []
        for i, (_, row) in enumerate(selected.iterrows()):
            price = row['avg_price']
            quantity = int(allocations[i] / price)
            market_value = quantity * price

            vol = row.get('volatility', 0.02)
            if pd.isna(vol) or vol <= 0:
                vol = 0.02

            positions.append(Position(
                symbol=row['symbol'],
                quantity=quantity,
                entry_price=price * 0.95,  # Assume 5% profit
                current_price=price,
                market_value=market_value,
                adv=row['avg_volume'],
                volatility=vol,
                sector=row.get('sector', 'Unknown')
            ))

        # Initial cash (5% buffer)
        initial_cash = total_value * 0.05

        return positions, initial_cash

    def run_all_scenarios(
        self,
        positions: List[Position] = None,
        initial_cash: float = None,
        verbose: bool = True
    ) -> Dict:
        """Run all stress scenarios"""
        self.results = []

        if verbose:
            print("=" * 70)
            print("LIQUIDITY STRESS TESTING BENCHMARK")
            print("=" * 70)

        # Generate portfolio if not provided
        if positions is None:
            if verbose:
                print("\nGenerating sample portfolio from database...")
            positions, initial_cash = self.generate_sample_portfolio()
            if verbose:
                print(f"Generated portfolio with {len(positions)} positions")
                total_value = sum(p.market_value for p in positions)
                print(f"Total portfolio value: ${total_value:,.0f}")
                print(f"Cash buffer: ${initial_cash:,.0f}")

        if initial_cash is None:
            total_value = sum(p.market_value for p in positions)
            initial_cash = total_value * 0.05

        if verbose:
            print("\nRunning stress scenarios...")

        # Run each scenario
        for scenario in StressScenario:
            self.run_scenario(
                positions=positions,
                scenario=scenario,
                initial_cash=initial_cash,
                verbose=verbose
            )

        # Aggregate results
        summary = self._aggregate_results()

        if verbose:
            self._print_summary(summary)

        return summary

    def _aggregate_results(self) -> Dict:
        """Aggregate stress test results"""
        passed = sum(1 for r in self.results if r.passed)
        total = len(self.results)

        scenario_results = {}
        for r in self.results:
            scenario_results[r.scenario.value] = {
                'passed': r.passed,
                'drawdown_pct': r.drawdown_pct,
                'liquidation_cost_bps': r.liquidation_cost_bps,
                'days_to_exit': r.days_to_exit_90pct,
                'margin_call': r.margin_call_triggered,
                'cash_depleted': r.cash_buffer_depleted
            }

        worst_drawdown = max(r.drawdown_pct for r in self.results)
        max_liquidation_cost = max(r.liquidation_cost_bps for r in self.results)

        return {
            'total_scenarios': total,
            'passed': passed,
            'failed': total - passed,
            'pass_rate': passed / total if total > 0 else 0,
            'overall_status': 'PASS' if passed == total else 'FAIL',
            'worst_drawdown_pct': worst_drawdown,
            'max_liquidation_cost_bps': max_liquidation_cost,
            'scenarios': scenario_results,
            'thresholds': self.THRESHOLDS
        }

    def _print_summary(self, summary: Dict):
        """Print formatted summary"""
        print("\n" + "=" * 70)
        print("STRESS TEST RESULTS")
        print("=" * 70)

        print(f"\nScenarios Tested: {summary['total_scenarios']}")
        print(f"Passed: {summary['passed']}")
        print(f"Failed: {summary['failed']}")
        print(f"\nOverall Status: {summary['overall_status']}")

        print("\n" + "-" * 70)
        print(f"{'Scenario':<25} {'Drawdown':>10} {'Cost (bps)':>12} {'Days Exit':>10} {'Status':>10}")
        print("-" * 70)

        for scenario, result in summary['scenarios'].items():
            status = 'PASS' if result['passed'] else 'FAIL'
            print(f"{scenario:<25} "
                  f"{result['drawdown_pct']:>9.2f}% "
                  f"{result['liquidation_cost_bps']:>11.1f} "
                  f"{result['days_to_exit']:>10d} "
                  f"[{status:>6}]")

        print("\n" + "-" * 70)
        print(f"Worst Drawdown: {summary['worst_drawdown_pct']:.2f}%")
        print(f"Max Liquidation Cost: {summary['max_liquidation_cost_bps']:.1f} bps")


def main():
    """Run liquidity stress benchmark"""
    db_path = os.path.join(os.path.dirname(__file__), '../../data/stocks.db')

    benchmark = LiquidityStressBenchmark(db_path)
    results = benchmark.run_all_scenarios(verbose=True)

    # Save results
    output_dir = os.path.join(os.path.dirname(__file__), '../../benchmark_results')
    os.makedirs(output_dir, exist_ok=True)

    output_file = os.path.join(
        output_dir,
        f'liquidity_stress_{datetime.now().strftime("%Y%m%d_%H%M%S")}.json'
    )

    with open(output_file, 'w') as f:
        json.dump(results, f, indent=2, default=str)

    print(f"\nResults saved to: {output_file}")

    return results


if __name__ == '__main__':
    main()

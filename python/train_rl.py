#!/usr/bin/env python3
"""
Reinforcement Learning Training Script for Portfolio Optimization.

Trains a PPO agent on historical market data using the portfolio environment.
Supports walk-forward validation and integration with existing ML pipeline.

Usage:
    python train_rl.py --config config.json
    python train_rl.py --symbols AAPL,GOOGL,MSFT --timesteps 100000
"""

import argparse
import json
import sys
import numpy as np
import pandas as pd
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Optional, Any
import warnings

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent))

from environments.portfolio_env import PortfolioTradingEnv, PortfolioEnvConfig, RewardType
from agents.ppo_agent import PPOAgent, PPOConfig


def load_price_data(
    symbols: List[str],
    db_path: str = None,
    start_date: str = None,
    end_date: str = None
) -> pd.DataFrame:
    """
    Load price data from database or generate synthetic data.

    Args:
        symbols: List of stock symbols
        db_path: Path to SQLite database
        start_date: Start date (YYYY-MM-DD)
        end_date: End date (YYYY-MM-DD)

    Returns:
        DataFrame with prices indexed by date
    """
    if db_path and Path(db_path).exists():
        import sqlite3
        conn = sqlite3.connect(db_path)

        query = """
            SELECT date, symbol, close
            FROM daily_prices
            WHERE symbol IN ({})
        """.format(','.join(['?'] * len(symbols)))

        params = list(symbols)

        if start_date:
            query += " AND date >= ?"
            params.append(start_date)
        if end_date:
            query += " AND date <= ?"
            params.append(end_date)

        query += " ORDER BY date"

        df = pd.read_sql_query(query, conn, params=params)
        conn.close()

        # Pivot to wide format
        df = df.pivot(index='date', columns='symbol', values='close')
        df.index = pd.to_datetime(df.index)
        df = df.sort_index()

        # Forward fill missing values
        df = df.ffill().bfill()

        return df
    else:
        # Generate synthetic data for testing
        print("No database found, generating synthetic price data...")
        np.random.seed(42)

        n_days = 1000
        dates = pd.date_range(start='2020-01-01', periods=n_days, freq='B')

        prices = {}
        for symbol in symbols:
            # Random walk with drift
            returns = np.random.normal(0.0003, 0.015, n_days)
            price = 100 * np.exp(np.cumsum(returns))
            prices[symbol] = price

        return pd.DataFrame(prices, index=dates)


def load_features(
    symbols: List[str],
    price_df: pd.DataFrame,
    db_path: str = None
) -> Optional[np.ndarray]:
    """
    Load or compute features for the environment.

    Args:
        symbols: List of stock symbols
        price_df: Price DataFrame
        db_path: Path to database

    Returns:
        Features array (n_timesteps, n_assets, n_features) or None
    """
    # For now, let the environment compute basic features
    # In production, this would load from feature store
    return None


def train_rl_agent(
    symbols: List[str],
    total_timesteps: int = 100000,
    config: Optional[Dict] = None,
    db_path: str = None,
    output_dir: str = None,
    walk_forward: bool = False,
    n_folds: int = 5
) -> Dict[str, Any]:
    """
    Train RL agent for portfolio optimization.

    Args:
        symbols: List of stock symbols
        total_timesteps: Total training timesteps
        config: Configuration dictionary
        db_path: Path to database
        output_dir: Directory for saving outputs
        walk_forward: Use walk-forward validation
        n_folds: Number of walk-forward folds

    Returns:
        Training results dictionary
    """
    config = config or {}
    output_dir = Path(output_dir) if output_dir else Path(__file__).parent / 'checkpoints' / 'rl'
    output_dir.mkdir(parents=True, exist_ok=True)

    # Load data
    print(f"Loading data for symbols: {symbols}")
    price_df = load_price_data(
        symbols=symbols,
        db_path=db_path,
        start_date=config.get('start_date'),
        end_date=config.get('end_date')
    )

    print(f"Loaded {len(price_df)} days of data for {len(symbols)} assets")

    # Convert to numpy
    prices = price_df.values.astype(np.float32)
    asset_names = list(price_df.columns)

    # Load features
    features = load_features(symbols, price_df, db_path)

    # Environment config
    env_config = PortfolioEnvConfig(
        lookback_window=config.get('lookback_window', 60),
        episode_length=config.get('episode_length', 252),
        initial_capital=config.get('initial_capital', 1_000_000),
        max_position_size=config.get('max_position_size', 0.25),
        transaction_cost_pct=config.get('transaction_cost_pct', 0.001),
        slippage_pct=config.get('slippage_pct', 0.0005),
        reward_type=RewardType[config.get('reward_type', 'SHARPE')],
        risk_free_rate=config.get('risk_free_rate', 0.02),
        turnover_penalty=config.get('turnover_penalty', 0.001),
    )

    # Agent config
    agent_config = PPOConfig(
        hidden_sizes=config.get('hidden_sizes', [256, 256]),
        learning_rate=config.get('learning_rate', 3e-4),
        gamma=config.get('gamma', 0.99),
        gae_lambda=config.get('gae_lambda', 0.95),
        clip_epsilon=config.get('clip_epsilon', 0.2),
        n_epochs=config.get('n_epochs', 10),
        batch_size=config.get('batch_size', 64),
        n_steps=config.get('n_steps', 2048),
        entropy_coef=config.get('entropy_coef', 0.01),
        action_std_init=config.get('action_std_init', 0.6),
    )

    results = {
        'symbols': symbols,
        'n_assets': len(symbols),
        'n_days': len(price_df),
        'total_timesteps': total_timesteps,
        'config': {
            'env': env_config.__dict__,
            'agent': agent_config.__dict__,
        },
        'training_start': datetime.now().isoformat(),
    }

    if walk_forward:
        # Walk-forward validation
        print(f"\nUsing walk-forward validation with {n_folds} folds")
        results['walk_forward'] = True
        results['n_folds'] = n_folds
        results['folds'] = []

        fold_size = len(prices) // (n_folds + 1)

        for fold in range(n_folds):
            train_start = 0
            train_end = (fold + 1) * fold_size
            test_start = train_end
            test_end = min(train_end + fold_size, len(prices))

            print(f"\nFold {fold + 1}/{n_folds}")
            print(f"  Train: days 0-{train_end} ({train_end} days)")
            print(f"  Test:  days {test_start}-{test_end} ({test_end - test_start} days)")

            # Create training environment
            train_env = PortfolioTradingEnv(
                prices=prices[:train_end],
                features=features[:train_end] if features is not None else None,
                asset_names=asset_names,
                config=env_config,
                seed=42 + fold
            )

            # Create test environment
            test_env = PortfolioTradingEnv(
                prices=prices[test_start:test_end],
                features=features[test_start:test_end] if features is not None else None,
                asset_names=asset_names,
                config=env_config,
                seed=42 + fold + 1000
            )

            # Initialize agent
            obs, _ = train_env.reset()
            agent = PPOAgent(
                obs_dim=obs.shape[0],
                action_dim=train_env.action_space.shape[0],
                config=agent_config
            )

            # Train
            timesteps_per_fold = total_timesteps // n_folds
            history = agent.train(
                env=train_env,
                total_timesteps=timesteps_per_fold,
                log_interval=20
            )

            # Evaluate on test set
            print(f"\nEvaluating fold {fold + 1}...")
            test_rewards = []
            test_stats = []

            for ep in range(5):
                obs, _ = test_env.reset()
                ep_reward = 0
                done = False

                while not done:
                    action, _, _ = agent.select_action(obs, deterministic=True)
                    obs, reward, terminated, truncated, info = test_env.step(action)
                    ep_reward += reward
                    done = terminated or truncated

                test_rewards.append(ep_reward)
                test_stats.append(test_env.get_episode_stats())

            fold_result = {
                'fold': fold + 1,
                'train_days': train_end,
                'test_days': test_end - test_start,
                'train_episodes': len(history['episode_rewards']),
                'mean_train_reward': np.mean(history['episode_rewards'][-20:]) if history['episode_rewards'] else 0,
                'mean_test_reward': np.mean(test_rewards),
                'test_sharpe': np.mean([s['sharpe'] for s in test_stats]),
                'test_return': np.mean([s['total_return'] for s in test_stats]),
                'test_max_dd': np.mean([s['max_drawdown'] for s in test_stats]),
            }

            print(f"  Test Sharpe: {fold_result['test_sharpe']:.3f}")
            print(f"  Test Return: {fold_result['test_return']*100:.2f}%")
            print(f"  Test MaxDD:  {fold_result['test_max_dd']*100:.2f}%")

            results['folds'].append(fold_result)

            # Save fold model
            model_path = output_dir / f"ppo_fold_{fold + 1}.pt"
            agent.save(str(model_path))

        # Aggregate results
        results['mean_test_sharpe'] = np.mean([f['test_sharpe'] for f in results['folds']])
        results['mean_test_return'] = np.mean([f['test_return'] for f in results['folds']])
        results['mean_test_max_dd'] = np.mean([f['test_max_dd'] for f in results['folds']])

    else:
        # Single training run
        print("\nCreating environment...")
        env = PortfolioTradingEnv(
            prices=prices,
            features=features,
            asset_names=asset_names,
            config=env_config,
            seed=42
        )

        # Get dimensions
        obs, _ = env.reset()
        obs_dim = obs.shape[0]
        # Handle both real gym spaces and mock spaces (dict)
        if hasattr(env.action_space, 'shape'):
            action_dim = env.action_space.shape[0]
        else:
            action_dim = env.action_space.get('shape', (len(symbols),))[0]

        print(f"Observation dim: {obs_dim}")
        print(f"Action dim: {action_dim}")

        # Create agent
        print("\nCreating PPO agent...")
        agent = PPOAgent(
            obs_dim=obs_dim,
            action_dim=action_dim,
            config=agent_config
        )

        # Train
        print(f"\nTraining for {total_timesteps} timesteps...")
        history = agent.train(
            env=env,
            total_timesteps=total_timesteps,
            log_interval=10
        )

        # Evaluate
        print("\nEvaluating trained agent...")
        eval_rewards = []
        eval_stats = []

        for _ in range(10):
            obs, _ = env.reset()
            ep_reward = 0
            done = False

            while not done:
                action, _, _ = agent.select_action(obs, deterministic=True)
                obs, reward, terminated, truncated, info = env.step(action)
                ep_reward += reward
                done = terminated or truncated

            eval_rewards.append(ep_reward)
            eval_stats.append(env.get_episode_stats())

        results['training'] = {
            'total_episodes': len(history['episode_rewards']),
            'final_mean_reward': np.mean(history['episode_rewards'][-20:]) if history['episode_rewards'] else 0,
            'policy_loss_final': history['policy_loss'][-1] if history['policy_loss'] else None,
            'value_loss_final': history['value_loss'][-1] if history['value_loss'] else None,
        }

        results['evaluation'] = {
            'mean_reward': np.mean(eval_rewards),
            'std_reward': np.std(eval_rewards),
            'mean_sharpe': np.mean([s['sharpe'] for s in eval_stats]),
            'mean_return': np.mean([s['total_return'] for s in eval_stats]),
            'mean_max_dd': np.mean([s['max_drawdown'] for s in eval_stats]),
            'mean_volatility': np.mean([s['volatility'] for s in eval_stats]),
            'mean_turnover': np.mean([s['avg_daily_turnover'] for s in eval_stats]),
        }

        print(f"\nEvaluation Results:")
        print(f"  Mean Reward:    {results['evaluation']['mean_reward']:.4f}")
        print(f"  Mean Sharpe:    {results['evaluation']['mean_sharpe']:.3f}")
        print(f"  Mean Return:    {results['evaluation']['mean_return']*100:.2f}%")
        print(f"  Mean Max DD:    {results['evaluation']['mean_max_dd']*100:.2f}%")
        print(f"  Mean Volatility:{results['evaluation']['mean_volatility']*100:.1f}%")

        # Save model
        model_path = output_dir / "ppo_final.pt"
        agent.save(str(model_path))
        results['model_path'] = str(model_path)

    # Save results
    results['training_end'] = datetime.now().isoformat()
    results_path = output_dir / f"training_results_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"

    with open(results_path, 'w') as f:
        json.dump(results, f, indent=2, default=str)

    print(f"\nResults saved to: {results_path}")

    return results


def main():
    parser = argparse.ArgumentParser(description='Train RL agent for portfolio optimization')

    parser.add_argument('--symbols', type=str, default='AAPL,GOOGL,MSFT,AMZN,META',
                       help='Comma-separated list of symbols')
    parser.add_argument('--timesteps', type=int, default=100000,
                       help='Total training timesteps')
    parser.add_argument('--config', type=str, default=None,
                       help='Path to config JSON file')
    parser.add_argument('--db-path', type=str, default=None,
                       help='Path to SQLite database')
    parser.add_argument('--output-dir', type=str, default=None,
                       help='Output directory for models and results')
    parser.add_argument('--walk-forward', action='store_true',
                       help='Use walk-forward validation')
    parser.add_argument('--n-folds', type=int, default=5,
                       help='Number of walk-forward folds')

    args = parser.parse_args()

    # Load config
    config = {}
    if args.config and Path(args.config).exists():
        with open(args.config) as f:
            config = json.load(f)

    # Parse symbols
    symbols = [s.strip() for s in args.symbols.split(',')]

    # Train
    results = train_rl_agent(
        symbols=symbols,
        total_timesteps=args.timesteps,
        config=config,
        db_path=args.db_path,
        output_dir=args.output_dir,
        walk_forward=args.walk_forward,
        n_folds=args.n_folds
    )

    print("\n" + "="*60)
    print("TRAINING COMPLETE")
    print("="*60)

    if 'evaluation' in results:
        print(f"\nFinal Sharpe Ratio: {results['evaluation']['mean_sharpe']:.3f}")
        print(f"Final Return:       {results['evaluation']['mean_return']*100:.2f}%")
    elif 'mean_test_sharpe' in results:
        print(f"\nMean Test Sharpe: {results['mean_test_sharpe']:.3f}")
        print(f"Mean Test Return: {results['mean_test_return']*100:.2f}%")


if __name__ == '__main__':
    main()

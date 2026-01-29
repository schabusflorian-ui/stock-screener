# python/environments/portfolio_env.py
"""
Portfolio Trading Environment for Reinforcement Learning.

A Gymnasium-compatible environment for training RL agents to optimize
portfolio allocation. Supports multiple assets, transaction costs,
and various reward functions.

Features:
- Continuous action space (portfolio weights)
- Rich observation space (prices, features, portfolio state)
- Multiple reward functions (Sharpe, Sortino, risk-adjusted returns)
- Transaction costs and slippage modeling
- Position limits and constraints
"""

import numpy as np
from typing import Dict, List, Optional, Tuple, Any
from dataclasses import dataclass, field
from enum import Enum
import warnings

# Try gymnasium first, fall back to gym
try:
    import gymnasium as gym
    from gymnasium import spaces
    HAS_GYMNASIUM = True
except ImportError:
    try:
        import gym
        from gym import spaces
        HAS_GYMNASIUM = False
    except ImportError:
        # Create mock classes for when neither is available
        HAS_GYMNASIUM = None
        class MockSpaces:
            @staticmethod
            def Box(low, high, shape, dtype):
                return {'low': low, 'high': high, 'shape': shape, 'dtype': dtype}
            @staticmethod
            def Discrete(n):
                return {'n': n}
        spaces = MockSpaces()
        class gym:
            class Env:
                pass


class RewardType(Enum):
    """Available reward functions."""
    SHARPE = "sharpe"
    SORTINO = "sortino"
    CALMAR = "calmar"
    RISK_ADJUSTED_RETURN = "risk_adjusted_return"
    INFORMATION_RATIO = "information_ratio"
    LOG_RETURN = "log_return"


@dataclass
class PortfolioEnvConfig:
    """Configuration for the portfolio environment."""
    # Time parameters
    lookback_window: int = 60  # Days of history in observation
    episode_length: int = 252  # Trading days per episode (1 year)

    # Portfolio parameters
    initial_capital: float = 1_000_000.0
    max_position_size: float = 0.25  # Max 25% in any single asset
    min_position_size: float = 0.0  # Allow zero weight
    allow_short: bool = False  # Disallow shorting by default

    # Transaction costs
    transaction_cost_pct: float = 0.001  # 10 bps
    slippage_pct: float = 0.0005  # 5 bps

    # Risk parameters
    max_drawdown_limit: float = 0.20  # 20% max drawdown before penalty
    target_volatility: float = 0.15  # 15% annual target vol

    # Reward parameters
    reward_type: RewardType = RewardType.SHARPE
    risk_free_rate: float = 0.02  # 2% risk-free rate
    reward_scaling: float = 1.0

    # Regularization
    turnover_penalty: float = 0.001  # Penalty for excessive trading
    concentration_penalty: float = 0.001  # Penalty for concentrated positions

    # Features
    include_technical: bool = True
    include_fundamental: bool = True
    include_market: bool = True
    normalize_observations: bool = True


class PortfolioTradingEnv(gym.Env if HAS_GYMNASIUM is not None else object):
    """
    Portfolio Trading Environment for Reinforcement Learning.

    State Space:
        - Portfolio weights (n_assets,)
        - Asset returns history (lookback_window, n_assets)
        - Asset features (n_assets, n_features)
        - Portfolio metrics (value, drawdown, volatility)
        - Market context (regime, VIX level)

    Action Space:
        - Target portfolio weights (n_assets,) in [0, 1] summing to 1

    Reward:
        - Risk-adjusted return based on selected reward_type
        - Penalties for transaction costs, turnover, concentration
    """

    metadata = {'render_modes': ['human', 'ansi']}

    def __init__(
        self,
        prices: np.ndarray,
        features: Optional[np.ndarray] = None,
        asset_names: Optional[List[str]] = None,
        config: Optional[PortfolioEnvConfig] = None,
        seed: Optional[int] = None
    ):
        """
        Initialize the portfolio environment.

        Args:
            prices: Asset prices (n_timesteps, n_assets)
            features: Optional features (n_timesteps, n_assets, n_features)
            asset_names: Names of assets
            config: Environment configuration
            seed: Random seed
        """
        super().__init__()

        self.config = config or PortfolioEnvConfig()
        self.prices = np.asarray(prices, dtype=np.float32)
        self.n_timesteps, self.n_assets = self.prices.shape

        # Compute returns
        self.returns = np.zeros_like(self.prices)
        self.returns[1:] = (self.prices[1:] - self.prices[:-1]) / self.prices[:-1]

        # Features
        if features is not None:
            self.features = np.asarray(features, dtype=np.float32)
        else:
            # Use basic price-derived features
            self.features = self._compute_basic_features()

        self.n_features = self.features.shape[2] if len(self.features.shape) == 3 else 0

        # Asset names
        self.asset_names = asset_names or [f"Asset_{i}" for i in range(self.n_assets)]

        # Define spaces
        self._define_spaces()

        # State variables (initialized in reset)
        self.current_step = 0
        self.portfolio_weights = None
        self.portfolio_value = None
        self.portfolio_history = []
        self.weight_history = []
        self.trade_history = []

        # Set seed
        if seed is not None:
            self.seed(seed)

    def _compute_basic_features(self) -> np.ndarray:
        """Compute basic features from prices."""
        n_basic_features = 10
        features = np.zeros((self.n_timesteps, self.n_assets, n_basic_features), dtype=np.float32)

        for i in range(self.n_assets):
            price = self.prices[:, i]
            ret = self.returns[:, i]

            # Feature 0: 5-day return
            features[5:, i, 0] = (price[5:] - price[:-5]) / price[:-5]

            # Feature 1: 20-day return
            features[20:, i, 1] = (price[20:] - price[:-20]) / price[:-20]

            # Feature 2: 5-day volatility
            for t in range(5, self.n_timesteps):
                features[t, i, 2] = np.std(ret[t-5:t])

            # Feature 3: 20-day volatility
            for t in range(20, self.n_timesteps):
                features[t, i, 3] = np.std(ret[t-20:t])

            # Feature 4: RSI-like (14-day)
            for t in range(14, self.n_timesteps):
                gains = np.maximum(ret[t-14:t], 0).sum()
                losses = np.abs(np.minimum(ret[t-14:t], 0)).sum()
                if gains + losses > 0:
                    features[t, i, 4] = gains / (gains + losses) - 0.5

            # Feature 5: Price vs 20-day SMA
            for t in range(20, self.n_timesteps):
                sma = price[t-20:t].mean()
                features[t, i, 5] = (price[t] - sma) / sma

            # Feature 6: Price vs 50-day SMA
            for t in range(50, self.n_timesteps):
                sma = price[t-50:t].mean()
                features[t, i, 6] = (price[t] - sma) / sma

            # Feature 7: Bollinger Band position
            for t in range(20, self.n_timesteps):
                sma = price[t-20:t].mean()
                std = price[t-20:t].std()
                if std > 0:
                    features[t, i, 7] = (price[t] - sma) / (2 * std)

            # Feature 8: Volume ratio (using returns as proxy)
            for t in range(20, self.n_timesteps):
                avg_abs_ret = np.abs(ret[t-20:t]).mean()
                if avg_abs_ret > 0:
                    features[t, i, 8] = np.abs(ret[t]) / avg_abs_ret - 1

            # Feature 9: Momentum (12-1 month)
            for t in range(252, self.n_timesteps):
                features[t, i, 9] = (price[t-21] - price[t-252]) / price[t-252]

        # Normalize features
        if self.config.normalize_observations:
            for f in range(n_basic_features):
                feat = features[:, :, f]
                mean = np.nanmean(feat)
                std = np.nanstd(feat)
                if std > 0:
                    features[:, :, f] = (feat - mean) / std

        # Replace NaN/Inf with 0
        features = np.nan_to_num(features, nan=0.0, posinf=0.0, neginf=0.0)

        return features

    def _define_spaces(self):
        """Define observation and action spaces."""
        # Action space: portfolio weights for each asset
        if self.config.allow_short:
            self.action_space = spaces.Box(
                low=-1.0, high=1.0,
                shape=(self.n_assets,),
                dtype=np.float32
            )
        else:
            self.action_space = spaces.Box(
                low=0.0, high=1.0,
                shape=(self.n_assets,),
                dtype=np.float32
            )

        # Observation space components
        # 1. Current portfolio weights (n_assets,)
        # 2. Recent returns (lookback_window, n_assets)
        # 3. Asset features (n_assets, n_features)
        # 4. Portfolio metrics (5,): value_pct, drawdown, volatility, sharpe, days_elapsed
        # 5. Market context (3,): regime, trend, volatility_regime

        obs_dim = (
            self.n_assets +  # weights
            self.config.lookback_window * self.n_assets +  # returns
            self.n_assets * self.n_features +  # features
            5 +  # portfolio metrics
            3    # market context
        )

        self.observation_space = spaces.Box(
            low=-np.inf, high=np.inf,
            shape=(obs_dim,),
            dtype=np.float32
        )

    def seed(self, seed: Optional[int] = None):
        """Set random seed."""
        self.np_random = np.random.RandomState(seed)
        return [seed]

    def reset(
        self,
        seed: Optional[int] = None,
        options: Optional[Dict] = None
    ) -> Tuple[np.ndarray, Dict]:
        """
        Reset the environment to initial state.

        Args:
            seed: Random seed
            options: Additional options (e.g., start_step)

        Returns:
            observation: Initial observation
            info: Additional information
        """
        if seed is not None:
            self.seed(seed)

        options = options or {}

        # Determine starting step
        min_start = self.config.lookback_window + 1
        max_start = self.n_timesteps - self.config.episode_length - 1

        if 'start_step' in options:
            self.start_step = options['start_step']
        elif max_start > min_start:
            self.start_step = self.np_random.randint(min_start, max_start)
        else:
            self.start_step = min_start

        self.current_step = self.start_step

        # Initialize portfolio
        self.portfolio_weights = np.ones(self.n_assets, dtype=np.float32) / self.n_assets
        self.portfolio_value = self.config.initial_capital
        self.peak_value = self.portfolio_value

        # Reset history
        self.portfolio_history = [self.portfolio_value]
        self.weight_history = [self.portfolio_weights.copy()]
        self.return_history = []
        self.trade_history = []

        # Get initial observation
        obs = self._get_observation()
        info = self._get_info()

        return obs, info

    def step(self, action: np.ndarray) -> Tuple[np.ndarray, float, bool, bool, Dict]:
        """
        Execute one step in the environment.

        Args:
            action: Target portfolio weights

        Returns:
            observation: New observation
            reward: Step reward
            terminated: Whether episode is done (terminal state)
            truncated: Whether episode was cut short
            info: Additional information
        """
        # Process action
        target_weights = self._process_action(action)

        # Calculate transaction costs
        weight_change = np.abs(target_weights - self.portfolio_weights)
        turnover = weight_change.sum()
        transaction_cost = turnover * self.config.transaction_cost_pct
        slippage_cost = turnover * self.config.slippage_pct
        total_cost = transaction_cost + slippage_cost

        # Record trade
        if turnover > 0.01:  # Meaningful trade
            self.trade_history.append({
                'step': self.current_step,
                'old_weights': self.portfolio_weights.copy(),
                'new_weights': target_weights.copy(),
                'turnover': turnover,
                'cost': total_cost
            })

        # Update weights
        self.portfolio_weights = target_weights

        # Move to next step
        self.current_step += 1

        # Get asset returns for this step
        step_returns = self.returns[self.current_step]

        # Calculate portfolio return
        portfolio_return = np.dot(self.portfolio_weights, step_returns)
        portfolio_return -= total_cost  # Subtract costs

        # Update portfolio value
        old_value = self.portfolio_value
        self.portfolio_value *= (1 + portfolio_return)

        # Update peak for drawdown
        self.peak_value = max(self.peak_value, self.portfolio_value)

        # Record history
        self.portfolio_history.append(self.portfolio_value)
        self.weight_history.append(self.portfolio_weights.copy())
        self.return_history.append(portfolio_return)

        # Calculate reward
        reward = self._calculate_reward(portfolio_return, turnover)

        # Check termination conditions
        terminated = False
        truncated = False

        # Episode length reached
        steps_taken = self.current_step - self.start_step
        if steps_taken >= self.config.episode_length:
            truncated = True

        # End of data
        if self.current_step >= self.n_timesteps - 1:
            truncated = True

        # Bankruptcy (portfolio value too low)
        if self.portfolio_value < self.config.initial_capital * 0.5:
            terminated = True

        # Get observation and info
        obs = self._get_observation()
        info = self._get_info()
        info['portfolio_return'] = portfolio_return
        info['turnover'] = turnover
        info['transaction_cost'] = total_cost

        return obs, reward, terminated, truncated, info

    def _process_action(self, action: np.ndarray) -> np.ndarray:
        """Process and normalize action to valid portfolio weights."""
        action = np.asarray(action, dtype=np.float32)

        # Clip to valid range
        if self.config.allow_short:
            action = np.clip(action, -1.0, 1.0)
        else:
            action = np.clip(action, 0.0, 1.0)

        # Apply position limits
        action = np.clip(action, self.config.min_position_size, self.config.max_position_size)

        # Normalize to sum to 1
        action_sum = np.abs(action).sum()
        if action_sum > 0:
            action = action / action_sum
        else:
            # Default to equal weight
            action = np.ones(self.n_assets, dtype=np.float32) / self.n_assets

        return action

    def _get_observation(self) -> np.ndarray:
        """Construct observation vector."""
        obs_parts = []

        # 1. Current portfolio weights
        obs_parts.append(self.portfolio_weights)

        # 2. Recent returns (lookback window)
        start_idx = max(0, self.current_step - self.config.lookback_window)
        recent_returns = self.returns[start_idx:self.current_step]

        # Pad if necessary
        if len(recent_returns) < self.config.lookback_window:
            padding = np.zeros((self.config.lookback_window - len(recent_returns), self.n_assets))
            recent_returns = np.vstack([padding, recent_returns])

        obs_parts.append(recent_returns.flatten())

        # 3. Current features
        current_features = self.features[self.current_step]
        obs_parts.append(current_features.flatten())

        # 4. Portfolio metrics
        portfolio_metrics = self._compute_portfolio_metrics()
        obs_parts.append(portfolio_metrics)

        # 5. Market context
        market_context = self._compute_market_context()
        obs_parts.append(market_context)

        # Concatenate all parts
        obs = np.concatenate(obs_parts).astype(np.float32)

        # Handle NaN/Inf
        obs = np.nan_to_num(obs, nan=0.0, posinf=0.0, neginf=0.0)

        return obs

    def _compute_portfolio_metrics(self) -> np.ndarray:
        """Compute portfolio metrics for observation."""
        metrics = np.zeros(5, dtype=np.float32)

        # Value relative to initial
        metrics[0] = self.portfolio_value / self.config.initial_capital - 1

        # Current drawdown
        metrics[1] = (self.peak_value - self.portfolio_value) / self.peak_value

        # Rolling volatility
        if len(self.return_history) >= 20:
            metrics[2] = np.std(self.return_history[-20:]) * np.sqrt(252)

        # Rolling Sharpe
        if len(self.return_history) >= 20:
            ret_mean = np.mean(self.return_history[-20:])
            ret_std = np.std(self.return_history[-20:])
            if ret_std > 0:
                metrics[3] = (ret_mean - self.config.risk_free_rate/252) / ret_std * np.sqrt(252)

        # Normalized days elapsed
        steps_taken = self.current_step - self.start_step
        metrics[4] = steps_taken / self.config.episode_length

        return metrics

    def _compute_market_context(self) -> np.ndarray:
        """Compute market context features."""
        context = np.zeros(3, dtype=np.float32)

        # Market regime (based on recent volatility)
        if self.current_step >= 20:
            market_returns = self.returns[self.current_step-20:self.current_step].mean(axis=1)
            vol = np.std(market_returns) * np.sqrt(252)

            # Regime: -1 (crisis), 0 (normal), 1 (low vol)
            if vol > 0.30:
                context[0] = -1
            elif vol < 0.10:
                context[0] = 1
            else:
                context[0] = 0

        # Market trend (20-day return)
        if self.current_step >= 20:
            market_return = self.returns[self.current_step-20:self.current_step].mean(axis=1).sum()
            context[1] = np.clip(market_return * 10, -1, 1)

        # Volatility regime change
        if self.current_step >= 40:
            recent_vol = np.std(self.returns[self.current_step-20:self.current_step]) * np.sqrt(252)
            older_vol = np.std(self.returns[self.current_step-40:self.current_step-20]) * np.sqrt(252)
            if older_vol > 0:
                context[2] = np.clip((recent_vol - older_vol) / older_vol, -1, 1)

        return context

    def _calculate_reward(self, portfolio_return: float, turnover: float) -> float:
        """Calculate step reward."""
        reward = 0.0

        if self.config.reward_type == RewardType.LOG_RETURN:
            # Simple log return
            reward = np.log(1 + portfolio_return) if portfolio_return > -1 else -10

        elif self.config.reward_type == RewardType.SHARPE:
            # Sharpe-like reward (return / volatility)
            if len(self.return_history) >= 5:
                ret_std = np.std(self.return_history[-20:]) if len(self.return_history) >= 20 else np.std(self.return_history)
                if ret_std > 0:
                    excess_return = portfolio_return - self.config.risk_free_rate / 252
                    reward = excess_return / ret_std
                else:
                    reward = portfolio_return * 100
            else:
                reward = portfolio_return * 100

        elif self.config.reward_type == RewardType.SORTINO:
            # Sortino-like (only penalize downside)
            if len(self.return_history) >= 5:
                downside_returns = [r for r in self.return_history[-20:] if r < 0]
                if len(downside_returns) > 0:
                    downside_std = np.std(downside_returns)
                    if downside_std > 0:
                        excess_return = portfolio_return - self.config.risk_free_rate / 252
                        reward = excess_return / downside_std
                    else:
                        reward = portfolio_return * 100
                else:
                    reward = portfolio_return * 100
            else:
                reward = portfolio_return * 100

        elif self.config.reward_type == RewardType.RISK_ADJUSTED_RETURN:
            # Return with drawdown penalty
            drawdown = (self.peak_value - self.portfolio_value) / self.peak_value
            reward = portfolio_return - 0.5 * max(0, drawdown - self.config.max_drawdown_limit)

        # Turnover penalty
        reward -= self.config.turnover_penalty * turnover

        # Concentration penalty (HHI)
        hhi = np.sum(self.portfolio_weights ** 2)
        if hhi > 0.5:  # Concentrated
            reward -= self.config.concentration_penalty * (hhi - 0.5)

        # Scale reward
        reward *= self.config.reward_scaling

        return float(reward)

    def _get_info(self) -> Dict[str, Any]:
        """Get info dictionary."""
        steps_taken = self.current_step - self.start_step

        info = {
            'step': self.current_step,
            'steps_taken': steps_taken,
            'portfolio_value': self.portfolio_value,
            'portfolio_weights': self.portfolio_weights.copy(),
            'peak_value': self.peak_value,
            'drawdown': (self.peak_value - self.portfolio_value) / self.peak_value,
            'total_return': self.portfolio_value / self.config.initial_capital - 1,
        }

        if len(self.return_history) > 0:
            returns = np.array(self.return_history)
            info['mean_return'] = returns.mean()
            info['volatility'] = returns.std() * np.sqrt(252)

            if returns.std() > 0:
                info['sharpe'] = (returns.mean() - self.config.risk_free_rate/252) / returns.std() * np.sqrt(252)
            else:
                info['sharpe'] = 0.0

        return info

    def render(self, mode: str = 'human') -> Optional[str]:
        """Render the environment state."""
        info = self._get_info()

        output = f"""
Portfolio Environment - Step {info['step']}
{'='*50}
Portfolio Value: ${info['portfolio_value']:,.2f}
Total Return: {info['total_return']*100:.2f}%
Drawdown: {info['drawdown']*100:.2f}%

Weights:
"""
        for i, (name, weight) in enumerate(zip(self.asset_names, self.portfolio_weights)):
            output += f"  {name}: {weight*100:.1f}%\n"

        if 'sharpe' in info:
            output += f"\nSharpe Ratio: {info['sharpe']:.2f}"
        if 'volatility' in info:
            output += f"\nAnnualized Vol: {info['volatility']*100:.1f}%"

        if mode == 'human':
            print(output)
            return None
        else:
            return output

    def close(self):
        """Clean up resources."""
        pass

    def get_episode_stats(self) -> Dict[str, float]:
        """Get comprehensive statistics for the episode."""
        if len(self.return_history) == 0:
            return {}

        returns = np.array(self.return_history)

        # Basic stats
        total_return = self.portfolio_value / self.config.initial_capital - 1
        annual_return = (1 + total_return) ** (252 / len(returns)) - 1 if len(returns) > 0 else 0
        volatility = returns.std() * np.sqrt(252)

        # Risk metrics
        max_drawdown = 0
        peak = self.config.initial_capital
        for val in self.portfolio_history:
            peak = max(peak, val)
            dd = (peak - val) / peak
            max_drawdown = max(max_drawdown, dd)

        # Risk-adjusted returns
        if volatility > 0:
            sharpe = (annual_return - self.config.risk_free_rate) / volatility
        else:
            sharpe = 0

        # Sortino
        downside_returns = returns[returns < 0]
        if len(downside_returns) > 0:
            downside_vol = np.std(downside_returns) * np.sqrt(252)
            sortino = (annual_return - self.config.risk_free_rate) / downside_vol if downside_vol > 0 else 0
        else:
            sortino = sharpe

        # Calmar
        calmar = annual_return / max_drawdown if max_drawdown > 0 else 0

        # Turnover stats
        total_turnover = sum(t['turnover'] for t in self.trade_history)
        avg_turnover = total_turnover / len(returns) if len(returns) > 0 else 0

        return {
            'total_return': total_return,
            'annual_return': annual_return,
            'volatility': volatility,
            'sharpe': sharpe,
            'sortino': sortino,
            'calmar': calmar,
            'max_drawdown': max_drawdown,
            'total_turnover': total_turnover,
            'avg_daily_turnover': avg_turnover,
            'n_trades': len(self.trade_history),
            'n_steps': len(returns),
            'final_value': self.portfolio_value,
        }


# Entry point for testing
if __name__ == "__main__":
    # Test with synthetic data
    np.random.seed(42)
    n_days = 500
    n_assets = 5

    # Generate synthetic prices
    prices = np.zeros((n_days, n_assets))
    prices[0] = 100

    for t in range(1, n_days):
        returns = np.random.normal(0.0005, 0.02, n_assets)
        prices[t] = prices[t-1] * (1 + returns)

    # Create environment
    config = PortfolioEnvConfig(
        lookback_window=20,
        episode_length=100,
        transaction_cost_pct=0.001,
        reward_type=RewardType.SHARPE
    )

    env = PortfolioTradingEnv(
        prices=prices,
        asset_names=['AAPL', 'GOOGL', 'MSFT', 'AMZN', 'META'],
        config=config,
        seed=42
    )

    # Run test episode
    obs, info = env.reset()
    print(f"Initial observation shape: {obs.shape}")
    print(f"Action space: {env.action_space}")

    total_reward = 0
    for step in range(100):
        # Random action
        action = np.random.random(n_assets)
        obs, reward, terminated, truncated, info = env.step(action)
        total_reward += reward

        if terminated or truncated:
            break

    # Print stats
    stats = env.get_episode_stats()
    print("\nEpisode Statistics:")
    for key, value in stats.items():
        if isinstance(value, float):
            print(f"  {key}: {value:.4f}")
        else:
            print(f"  {key}: {value}")

    print(f"\nTotal Reward: {total_reward:.4f}")

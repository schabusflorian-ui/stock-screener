# python/agents/ppo_agent.py
"""
Proximal Policy Optimization (PPO) Agent for Portfolio Optimization.

Implements PPO with:
- Actor-Critic architecture
- Generalized Advantage Estimation (GAE)
- Clipped surrogate objective
- Value function clipping
- Entropy regularization
- Continuous action space (portfolio weights)
"""

import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
from torch.distributions import Normal
from typing import Dict, List, Optional, Tuple, Any
from dataclasses import dataclass, field
from pathlib import Path
import json
import time
from collections import deque


@dataclass
class PPOConfig:
    """Configuration for PPO agent."""
    # Network architecture
    hidden_sizes: List[int] = field(default_factory=lambda: [256, 256])
    activation: str = "tanh"

    # PPO hyperparameters
    learning_rate: float = 3e-4
    gamma: float = 0.99  # Discount factor
    gae_lambda: float = 0.95  # GAE lambda
    clip_epsilon: float = 0.2  # PPO clip parameter
    clip_value: bool = True  # Clip value function
    value_clip_epsilon: float = 0.2

    # Training parameters
    n_epochs: int = 10  # Epochs per update
    batch_size: int = 64
    n_steps: int = 2048  # Steps before update
    normalize_advantages: bool = True

    # Regularization
    entropy_coef: float = 0.01
    value_coef: float = 0.5
    max_grad_norm: float = 0.5

    # Action space
    action_std_init: float = 0.6  # Initial action std
    action_std_decay: float = 0.05  # Std decay per update
    action_std_min: float = 0.1  # Minimum std

    # Logging
    log_interval: int = 10

    # Device
    device: str = "cpu"  # "cpu", "cuda", "mps"


class ActorCritic(nn.Module):
    """
    Actor-Critic network for PPO.

    Actor outputs mean and (optionally) std for continuous actions.
    Critic outputs state value.
    """

    def __init__(
        self,
        obs_dim: int,
        action_dim: int,
        hidden_sizes: List[int] = [256, 256],
        activation: str = "tanh",
        action_std_init: float = 0.6
    ):
        super().__init__()

        self.obs_dim = obs_dim
        self.action_dim = action_dim

        # Activation function
        if activation == "tanh":
            act_fn = nn.Tanh
        elif activation == "relu":
            act_fn = nn.ReLU
        elif activation == "elu":
            act_fn = nn.ELU
        else:
            act_fn = nn.Tanh

        # Shared feature extractor
        layers = []
        in_dim = obs_dim
        for hidden_size in hidden_sizes[:-1]:
            layers.extend([
                nn.Linear(in_dim, hidden_size),
                act_fn(),
            ])
            in_dim = hidden_size

        self.shared = nn.Sequential(*layers) if layers else nn.Identity()

        # Actor head (outputs action mean)
        self.actor_mean = nn.Sequential(
            nn.Linear(in_dim, hidden_sizes[-1]),
            act_fn(),
            nn.Linear(hidden_sizes[-1], action_dim),
            nn.Softmax(dim=-1)  # Ensure weights sum to 1
        )

        # Learnable action log std
        self.action_log_std = nn.Parameter(
            torch.ones(action_dim) * np.log(action_std_init)
        )

        # Critic head (outputs value)
        self.critic = nn.Sequential(
            nn.Linear(in_dim, hidden_sizes[-1]),
            act_fn(),
            nn.Linear(hidden_sizes[-1], 1)
        )

        # Initialize weights
        self._init_weights()

    def _init_weights(self):
        """Initialize network weights."""
        for module in self.modules():
            if isinstance(module, nn.Linear):
                nn.init.orthogonal_(module.weight, gain=np.sqrt(2))
                nn.init.constant_(module.bias, 0)

        # Smaller init for output layers
        for layer in [self.actor_mean[-2], self.critic[-1]]:
            if isinstance(layer, nn.Linear):
                nn.init.orthogonal_(layer.weight, gain=0.01)

    def forward(self, obs: torch.Tensor) -> Tuple[torch.Tensor, torch.Tensor]:
        """Forward pass returning action distribution params and value."""
        features = self.shared(obs)
        action_mean = self.actor_mean(features)
        value = self.critic(features)
        return action_mean, value

    def get_action(
        self,
        obs: torch.Tensor,
        deterministic: bool = False
    ) -> Tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        """
        Get action from policy.

        Returns:
            action: Sampled or deterministic action
            log_prob: Log probability of action
            value: State value estimate
        """
        action_mean, value = self.forward(obs)
        action_std = torch.exp(self.action_log_std).expand_as(action_mean)

        if deterministic:
            action = action_mean
            log_prob = torch.zeros(obs.shape[0], device=obs.device)
        else:
            # Create normal distribution for each action dimension
            dist = Normal(action_mean, action_std)
            action = dist.sample()
            log_prob = dist.log_prob(action).sum(dim=-1)

            # Apply softmax to ensure valid portfolio weights
            action = torch.softmax(action, dim=-1)

        return action, log_prob, value.squeeze(-1)

    def evaluate_actions(
        self,
        obs: torch.Tensor,
        actions: torch.Tensor
    ) -> Tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        """
        Evaluate actions for PPO update.

        Returns:
            log_prob: Log probability of actions
            value: State value estimates
            entropy: Policy entropy
        """
        action_mean, value = self.forward(obs)
        action_std = torch.exp(self.action_log_std).expand_as(action_mean)

        dist = Normal(action_mean, action_std)

        # Use action mean for log prob (actions are softmax'd)
        # This is an approximation for the softmax transformation
        log_prob = dist.log_prob(actions).sum(dim=-1)
        entropy = dist.entropy().sum(dim=-1)

        return log_prob, value.squeeze(-1), entropy


class RolloutBuffer:
    """Buffer for storing rollout experience."""

    def __init__(self, buffer_size: int, obs_dim: int, action_dim: int, device: str = "cpu"):
        self.buffer_size = buffer_size
        self.device = device
        self.ptr = 0
        self.full = False

        # Storage
        self.observations = np.zeros((buffer_size, obs_dim), dtype=np.float32)
        self.actions = np.zeros((buffer_size, action_dim), dtype=np.float32)
        self.rewards = np.zeros(buffer_size, dtype=np.float32)
        self.values = np.zeros(buffer_size, dtype=np.float32)
        self.log_probs = np.zeros(buffer_size, dtype=np.float32)
        self.dones = np.zeros(buffer_size, dtype=np.float32)
        self.advantages = np.zeros(buffer_size, dtype=np.float32)
        self.returns = np.zeros(buffer_size, dtype=np.float32)

    def add(
        self,
        obs: np.ndarray,
        action: np.ndarray,
        reward: float,
        value: float,
        log_prob: float,
        done: bool
    ):
        """Add experience to buffer."""
        self.observations[self.ptr] = obs
        self.actions[self.ptr] = action
        self.rewards[self.ptr] = reward
        self.values[self.ptr] = value
        self.log_probs[self.ptr] = log_prob
        self.dones[self.ptr] = done

        self.ptr += 1
        if self.ptr >= self.buffer_size:
            self.full = True
            self.ptr = 0

    def compute_returns_and_advantages(
        self,
        last_value: float,
        gamma: float,
        gae_lambda: float
    ):
        """Compute returns and GAE advantages."""
        size = self.buffer_size if self.full else self.ptr

        # GAE computation
        last_gae = 0
        for t in reversed(range(size)):
            if t == size - 1:
                next_value = last_value
                next_non_terminal = 1.0 - self.dones[t]
            else:
                next_value = self.values[t + 1]
                next_non_terminal = 1.0 - self.dones[t]

            delta = self.rewards[t] + gamma * next_value * next_non_terminal - self.values[t]
            last_gae = delta + gamma * gae_lambda * next_non_terminal * last_gae
            self.advantages[t] = last_gae
            self.returns[t] = self.advantages[t] + self.values[t]

    def get_batches(self, batch_size: int, normalize_advantages: bool = True):
        """Generate batches for training."""
        size = self.buffer_size if self.full else self.ptr
        indices = np.random.permutation(size)

        # Normalize advantages
        if normalize_advantages:
            adv_mean = self.advantages[:size].mean()
            adv_std = self.advantages[:size].std() + 1e-8
            advantages = (self.advantages[:size] - adv_mean) / adv_std
        else:
            advantages = self.advantages[:size]

        # Generate batches
        for start in range(0, size, batch_size):
            end = min(start + batch_size, size)
            batch_indices = indices[start:end]

            yield {
                'observations': torch.FloatTensor(self.observations[batch_indices]).to(self.device),
                'actions': torch.FloatTensor(self.actions[batch_indices]).to(self.device),
                'old_log_probs': torch.FloatTensor(self.log_probs[batch_indices]).to(self.device),
                'advantages': torch.FloatTensor(advantages[batch_indices]).to(self.device),
                'returns': torch.FloatTensor(self.returns[batch_indices]).to(self.device),
                'old_values': torch.FloatTensor(self.values[batch_indices]).to(self.device),
            }

    def reset(self):
        """Reset buffer."""
        self.ptr = 0
        self.full = False


class PPOAgent:
    """
    Proximal Policy Optimization agent for portfolio management.

    Features:
    - Actor-Critic architecture with shared features
    - GAE for advantage estimation
    - Clipped surrogate objective
    - Automatic action std decay
    - Training logging and checkpointing
    """

    def __init__(
        self,
        obs_dim: int,
        action_dim: int,
        config: Optional[PPOConfig] = None
    ):
        """
        Initialize PPO agent.

        Args:
            obs_dim: Observation dimension
            action_dim: Action dimension (number of assets)
            config: Agent configuration
        """
        self.config = config or PPOConfig()
        self.obs_dim = obs_dim
        self.action_dim = action_dim

        # Set device
        if self.config.device == "cuda" and torch.cuda.is_available():
            self.device = torch.device("cuda")
        elif self.config.device == "mps" and torch.backends.mps.is_available():
            self.device = torch.device("mps")
        else:
            self.device = torch.device("cpu")

        # Create network
        self.policy = ActorCritic(
            obs_dim=obs_dim,
            action_dim=action_dim,
            hidden_sizes=self.config.hidden_sizes,
            activation=self.config.activation,
            action_std_init=self.config.action_std_init
        ).to(self.device)

        # Optimizer
        self.optimizer = optim.Adam(
            self.policy.parameters(),
            lr=self.config.learning_rate,
            eps=1e-5
        )

        # Rollout buffer
        self.buffer = RolloutBuffer(
            buffer_size=self.config.n_steps,
            obs_dim=obs_dim,
            action_dim=action_dim,
            device=self.device
        )

        # Training stats
        self.total_timesteps = 0
        self.n_updates = 0
        self.episode_rewards = deque(maxlen=100)
        self.training_stats = []

        # Current action std
        self.current_action_std = self.config.action_std_init

    def select_action(
        self,
        obs: np.ndarray,
        deterministic: bool = False
    ) -> Tuple[np.ndarray, float, float]:
        """
        Select action given observation.

        Args:
            obs: Observation
            deterministic: Use deterministic policy

        Returns:
            action: Selected action
            log_prob: Log probability
            value: State value
        """
        with torch.no_grad():
            obs_tensor = torch.FloatTensor(obs).unsqueeze(0).to(self.device)
            action, log_prob, value = self.policy.get_action(obs_tensor, deterministic)

        return (
            action.cpu().numpy()[0],
            log_prob.cpu().item(),
            value.cpu().item()
        )

    def store_transition(
        self,
        obs: np.ndarray,
        action: np.ndarray,
        reward: float,
        value: float,
        log_prob: float,
        done: bool
    ):
        """Store transition in buffer."""
        self.buffer.add(obs, action, reward, value, log_prob, done)

    def update(self) -> Dict[str, float]:
        """
        Perform PPO update.

        Returns:
            Dictionary of training metrics
        """
        # Get last value for bootstrapping
        # (In practice, would use the actual last observation)
        last_value = 0.0

        # Compute advantages
        self.buffer.compute_returns_and_advantages(
            last_value=last_value,
            gamma=self.config.gamma,
            gae_lambda=self.config.gae_lambda
        )

        # Training metrics
        policy_losses = []
        value_losses = []
        entropy_losses = []
        approx_kls = []
        clip_fractions = []

        # Multiple epochs over the data
        for epoch in range(self.config.n_epochs):
            for batch in self.buffer.get_batches(
                self.config.batch_size,
                self.config.normalize_advantages
            ):
                # Get current policy outputs
                log_probs, values, entropy = self.policy.evaluate_actions(
                    batch['observations'],
                    batch['actions']
                )

                # Compute ratio
                ratio = torch.exp(log_probs - batch['old_log_probs'])

                # Clipped surrogate objective
                surr1 = ratio * batch['advantages']
                surr2 = torch.clamp(
                    ratio,
                    1.0 - self.config.clip_epsilon,
                    1.0 + self.config.clip_epsilon
                ) * batch['advantages']
                policy_loss = -torch.min(surr1, surr2).mean()

                # Value loss with optional clipping
                if self.config.clip_value:
                    value_clipped = batch['old_values'] + torch.clamp(
                        values - batch['old_values'],
                        -self.config.value_clip_epsilon,
                        self.config.value_clip_epsilon
                    )
                    value_loss1 = (values - batch['returns']) ** 2
                    value_loss2 = (value_clipped - batch['returns']) ** 2
                    value_loss = 0.5 * torch.max(value_loss1, value_loss2).mean()
                else:
                    value_loss = 0.5 * ((values - batch['returns']) ** 2).mean()

                # Entropy loss
                entropy_loss = -entropy.mean()

                # Total loss
                loss = (
                    policy_loss +
                    self.config.value_coef * value_loss +
                    self.config.entropy_coef * entropy_loss
                )

                # Optimize
                self.optimizer.zero_grad()
                loss.backward()
                nn.utils.clip_grad_norm_(
                    self.policy.parameters(),
                    self.config.max_grad_norm
                )
                self.optimizer.step()

                # Record metrics
                policy_losses.append(policy_loss.item())
                value_losses.append(value_loss.item())
                entropy_losses.append(entropy_loss.item())

                # Approximate KL divergence
                with torch.no_grad():
                    approx_kl = ((ratio - 1) - torch.log(ratio)).mean().item()
                    approx_kls.append(approx_kl)
                    clip_fraction = (torch.abs(ratio - 1) > self.config.clip_epsilon).float().mean().item()
                    clip_fractions.append(clip_fraction)

        # Decay action std
        self._decay_action_std()

        # Reset buffer
        self.buffer.reset()
        self.n_updates += 1

        return {
            'policy_loss': np.mean(policy_losses),
            'value_loss': np.mean(value_losses),
            'entropy_loss': np.mean(entropy_losses),
            'approx_kl': np.mean(approx_kls),
            'clip_fraction': np.mean(clip_fractions),
            'action_std': self.current_action_std,
        }

    def _decay_action_std(self):
        """Decay action standard deviation."""
        self.current_action_std = max(
            self.config.action_std_min,
            self.current_action_std - self.config.action_std_decay
        )

        # Update network parameter
        with torch.no_grad():
            self.policy.action_log_std.fill_(np.log(self.current_action_std))

    def train(
        self,
        env,
        total_timesteps: int,
        callback=None,
        log_interval: int = 10,
        eval_env=None,
        eval_freq: int = 10000
    ) -> Dict[str, List]:
        """
        Train the agent.

        Args:
            env: Training environment
            total_timesteps: Total training timesteps
            callback: Optional callback function
            log_interval: Logging interval (episodes)
            eval_env: Optional evaluation environment
            eval_freq: Evaluation frequency (timesteps)

        Returns:
            Training history
        """
        obs, info = env.reset()
        episode_reward = 0
        episode_length = 0
        n_episodes = 0

        history = {
            'timesteps': [],
            'episode_rewards': [],
            'episode_lengths': [],
            'policy_loss': [],
            'value_loss': [],
            'entropy': [],
        }

        start_time = time.time()

        for timestep in range(total_timesteps):
            self.total_timesteps += 1

            # Select action
            action, log_prob, value = self.select_action(obs)

            # Step environment
            next_obs, reward, terminated, truncated, info = env.step(action)
            done = terminated or truncated

            # Store transition
            self.store_transition(obs, action, reward, value, log_prob, done)

            episode_reward += reward
            episode_length += 1
            obs = next_obs

            # Episode done
            if done:
                self.episode_rewards.append(episode_reward)
                history['timesteps'].append(self.total_timesteps)
                history['episode_rewards'].append(episode_reward)
                history['episode_lengths'].append(episode_length)

                n_episodes += 1

                # Log
                if n_episodes % log_interval == 0:
                    mean_reward = np.mean(list(self.episode_rewards))
                    elapsed = time.time() - start_time
                    fps = self.total_timesteps / elapsed

                    print(f"Episode {n_episodes} | "
                          f"Timestep {self.total_timesteps} | "
                          f"Mean Reward: {mean_reward:.2f} | "
                          f"FPS: {fps:.0f}")

                # Reset
                obs, info = env.reset()
                episode_reward = 0
                episode_length = 0

            # PPO Update
            if self.buffer.ptr >= self.config.n_steps or self.buffer.full:
                update_stats = self.update()

                history['policy_loss'].append(update_stats['policy_loss'])
                history['value_loss'].append(update_stats['value_loss'])
                history['entropy'].append(-update_stats['entropy_loss'])

            # Callback
            if callback is not None:
                if callback(locals(), globals()) is False:
                    break

            # Evaluation
            if eval_env is not None and self.total_timesteps % eval_freq == 0:
                eval_reward = self.evaluate(eval_env, n_episodes=5)
                print(f"Evaluation reward: {eval_reward:.2f}")

        return history

    def evaluate(
        self,
        env,
        n_episodes: int = 10,
        deterministic: bool = True
    ) -> float:
        """
        Evaluate the agent.

        Args:
            env: Evaluation environment
            n_episodes: Number of episodes
            deterministic: Use deterministic policy

        Returns:
            Mean episode reward
        """
        episode_rewards = []

        for _ in range(n_episodes):
            obs, info = env.reset()
            episode_reward = 0
            done = False

            while not done:
                action, _, _ = self.select_action(obs, deterministic=deterministic)
                obs, reward, terminated, truncated, info = env.step(action)
                episode_reward += reward
                done = terminated or truncated

            episode_rewards.append(episode_reward)

        return np.mean(episode_rewards)

    def save(self, path: str):
        """Save agent to file."""
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)

        checkpoint = {
            'policy_state_dict': self.policy.state_dict(),
            'optimizer_state_dict': self.optimizer.state_dict(),
            'config': self.config.__dict__,
            'obs_dim': self.obs_dim,
            'action_dim': self.action_dim,
            'total_timesteps': self.total_timesteps,
            'n_updates': self.n_updates,
            'current_action_std': self.current_action_std,
        }

        torch.save(checkpoint, path)
        print(f"Agent saved to {path}")

    @classmethod
    def load(cls, path: str, device: str = None) -> 'PPOAgent':
        """Load agent from file."""
        checkpoint = torch.load(path, map_location='cpu')

        config = PPOConfig(**checkpoint['config'])
        if device is not None:
            config.device = device

        agent = cls(
            obs_dim=checkpoint['obs_dim'],
            action_dim=checkpoint['action_dim'],
            config=config
        )

        agent.policy.load_state_dict(checkpoint['policy_state_dict'])
        agent.optimizer.load_state_dict(checkpoint['optimizer_state_dict'])
        agent.total_timesteps = checkpoint['total_timesteps']
        agent.n_updates = checkpoint['n_updates']
        agent.current_action_std = checkpoint['current_action_std']

        print(f"Agent loaded from {path}")
        return agent

    def get_policy_info(self) -> Dict[str, Any]:
        """Get information about the policy."""
        return {
            'obs_dim': self.obs_dim,
            'action_dim': self.action_dim,
            'total_timesteps': self.total_timesteps,
            'n_updates': self.n_updates,
            'current_action_std': self.current_action_std,
            'device': str(self.device),
            'n_parameters': sum(p.numel() for p in self.policy.parameters()),
        }


# Entry point for testing
if __name__ == "__main__":
    from environments.portfolio_env import PortfolioTradingEnv, PortfolioEnvConfig, RewardType

    print("Testing PPO Agent...")

    # Create synthetic data
    np.random.seed(42)
    n_days = 1000
    n_assets = 5

    prices = np.zeros((n_days, n_assets))
    prices[0] = 100
    for t in range(1, n_days):
        returns = np.random.normal(0.0005, 0.02, n_assets)
        prices[t] = prices[t-1] * (1 + returns)

    # Create environment
    env_config = PortfolioEnvConfig(
        lookback_window=20,
        episode_length=100,
        reward_type=RewardType.SHARPE
    )

    env = PortfolioTradingEnv(prices=prices, config=env_config, seed=42)

    # Get dimensions
    obs, _ = env.reset()
    obs_dim = obs.shape[0]
    action_dim = env.action_space.shape[0]

    print(f"Observation dim: {obs_dim}")
    print(f"Action dim: {action_dim}")

    # Create agent
    agent_config = PPOConfig(
        hidden_sizes=[128, 128],
        learning_rate=3e-4,
        n_steps=256,
        n_epochs=5,
        batch_size=32,
    )

    agent = PPOAgent(obs_dim=obs_dim, action_dim=action_dim, config=agent_config)

    print(f"\nAgent info: {agent.get_policy_info()}")

    # Quick training test
    print("\nTraining for 1000 timesteps...")
    history = agent.train(env, total_timesteps=1000, log_interval=5)

    # Evaluate
    print("\nEvaluating...")
    eval_reward = agent.evaluate(env, n_episodes=5)
    print(f"Mean evaluation reward: {eval_reward:.4f}")

    # Save and load test
    agent.save("/tmp/ppo_test.pt")
    loaded_agent = PPOAgent.load("/tmp/ppo_test.pt")
    print(f"\nLoaded agent info: {loaded_agent.get_policy_info()}")

    print("\nPPO Agent test complete!")

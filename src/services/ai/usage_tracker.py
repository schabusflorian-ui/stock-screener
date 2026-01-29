# src/services/ai/usage_tracker.py

import sqlite3
import json
from datetime import datetime, timedelta
from typing import Dict, List, Optional
import logging
import os

logger = logging.getLogger(__name__)


class UsageTracker:
    """
    Track LLM API usage and costs.

    Provides:
    - Cost tracking per model
    - Usage statistics
    - Budget alerts
    - Rate limiting support
    """

    def __init__(self, db_path: str = None):
        """
        Initialize usage tracker.

        Args:
            db_path: Path to SQLite database for persistent storage
        """
        self.db_path = db_path or os.path.join(
            os.path.dirname(__file__), '..', '..', '..', 'data', 'llm_usage.db'
        )
        self._ensure_db()

        # In-memory cache for current session
        self._session_stats = {
            'requests': 0,
            'tokens': 0,
            'cost': 0.0,
            'start_time': datetime.now()
        }

        # Budget settings
        self.daily_budget = float(os.getenv('LLM_DAILY_BUDGET', '10.0'))
        self.monthly_budget = float(os.getenv('LLM_MONTHLY_BUDGET', '100.0'))

    def _ensure_db(self):
        """Ensure database and tables exist"""
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)

        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS usage_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT NOT NULL,
                model TEXT NOT NULL,
                task_type TEXT,
                input_tokens INTEGER DEFAULT 0,
                output_tokens INTEGER DEFAULT 0,
                total_tokens INTEGER DEFAULT 0,
                cost_usd REAL DEFAULT 0.0,
                latency_ms INTEGER DEFAULT 0,
                success INTEGER DEFAULT 1,
                error_message TEXT,
                metadata TEXT
            )
        ''')

        cursor.execute('''
            CREATE INDEX IF NOT EXISTS idx_usage_timestamp
            ON usage_log(timestamp)
        ''')

        cursor.execute('''
            CREATE INDEX IF NOT EXISTS idx_usage_model
            ON usage_log(model)
        ''')

        conn.commit()
        conn.close()

    def log_request(self,
                    model: str,
                    task_type: str = None,
                    input_tokens: int = 0,
                    output_tokens: int = 0,
                    cost_usd: float = 0.0,
                    latency_ms: int = 0,
                    success: bool = True,
                    error_message: str = None,
                    metadata: Dict = None):
        """
        Log an LLM request.

        Args:
            model: Model name
            task_type: Type of task
            input_tokens: Input tokens used
            output_tokens: Output tokens generated
            cost_usd: Cost in USD
            latency_ms: Latency in milliseconds
            success: Whether request succeeded
            error_message: Error message if failed
            metadata: Additional metadata
        """
        total_tokens = input_tokens + output_tokens

        # Update session stats
        self._session_stats['requests'] += 1
        self._session_stats['tokens'] += total_tokens
        self._session_stats['cost'] += cost_usd

        # Persist to database
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()

            cursor.execute('''
                INSERT INTO usage_log
                (timestamp, model, task_type, input_tokens, output_tokens,
                 total_tokens, cost_usd, latency_ms, success, error_message, metadata)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                datetime.now().isoformat(),
                model,
                task_type,
                input_tokens,
                output_tokens,
                total_tokens,
                cost_usd,
                latency_ms,
                1 if success else 0,
                error_message,
                json.dumps(metadata) if metadata else None
            ))

            conn.commit()
            conn.close()
        except Exception as e:
            logger.error(f"Failed to log usage: {e}")

    def get_daily_usage(self, date: datetime = None) -> Dict:
        """Get usage statistics for a specific day"""
        date = date or datetime.now()
        date_str = date.strftime('%Y-%m-%d')

        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        cursor.execute('''
            SELECT
                COUNT(*) as requests,
                SUM(total_tokens) as tokens,
                SUM(cost_usd) as cost,
                AVG(latency_ms) as avg_latency
            FROM usage_log
            WHERE timestamp LIKE ?
        ''', (f'{date_str}%',))

        row = cursor.fetchone()
        conn.close()

        return {
            'date': date_str,
            'requests': row[0] or 0,
            'tokens': row[1] or 0,
            'cost': row[2] or 0.0,
            'avg_latency_ms': row[3] or 0
        }

    def get_monthly_usage(self, year: int = None, month: int = None) -> Dict:
        """Get usage statistics for a specific month"""
        now = datetime.now()
        year = year or now.year
        month = month or now.month
        month_str = f'{year}-{month:02d}'

        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        cursor.execute('''
            SELECT
                COUNT(*) as requests,
                SUM(total_tokens) as tokens,
                SUM(cost_usd) as cost,
                AVG(latency_ms) as avg_latency
            FROM usage_log
            WHERE timestamp LIKE ?
        ''', (f'{month_str}%',))

        row = cursor.fetchone()
        conn.close()

        return {
            'month': month_str,
            'requests': row[0] or 0,
            'tokens': row[1] or 0,
            'cost': row[2] or 0.0,
            'avg_latency_ms': row[3] or 0
        }

    def get_usage_by_model(self, days: int = 30) -> List[Dict]:
        """Get usage breakdown by model"""
        cutoff = (datetime.now() - timedelta(days=days)).isoformat()

        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        cursor.execute('''
            SELECT
                model,
                COUNT(*) as requests,
                SUM(total_tokens) as tokens,
                SUM(cost_usd) as cost,
                AVG(latency_ms) as avg_latency
            FROM usage_log
            WHERE timestamp > ?
            GROUP BY model
            ORDER BY cost DESC
        ''', (cutoff,))

        rows = cursor.fetchall()
        conn.close()

        return [
            {
                'model': row[0],
                'requests': row[1],
                'tokens': row[2] or 0,
                'cost': row[3] or 0.0,
                'avg_latency_ms': row[4] or 0
            }
            for row in rows
        ]

    def get_usage_by_task(self, days: int = 30) -> List[Dict]:
        """Get usage breakdown by task type"""
        cutoff = (datetime.now() - timedelta(days=days)).isoformat()

        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        cursor.execute('''
            SELECT
                task_type,
                COUNT(*) as requests,
                SUM(total_tokens) as tokens,
                SUM(cost_usd) as cost,
                AVG(latency_ms) as avg_latency
            FROM usage_log
            WHERE timestamp > ? AND task_type IS NOT NULL
            GROUP BY task_type
            ORDER BY requests DESC
        ''', (cutoff,))

        rows = cursor.fetchall()
        conn.close()

        return [
            {
                'task_type': row[0],
                'requests': row[1],
                'tokens': row[2] or 0,
                'cost': row[3] or 0.0,
                'avg_latency_ms': row[4] or 0
            }
            for row in rows
        ]

    def check_budget(self) -> Dict:
        """Check if within budget limits"""
        daily = self.get_daily_usage()
        monthly = self.get_monthly_usage()

        daily_remaining = self.daily_budget - daily['cost']
        monthly_remaining = self.monthly_budget - monthly['cost']

        return {
            'daily': {
                'used': daily['cost'],
                'budget': self.daily_budget,
                'remaining': daily_remaining,
                'exceeded': daily_remaining < 0
            },
            'monthly': {
                'used': monthly['cost'],
                'budget': self.monthly_budget,
                'remaining': monthly_remaining,
                'exceeded': monthly_remaining < 0
            },
            'can_proceed': daily_remaining > 0 and monthly_remaining > 0
        }

    def get_session_stats(self) -> Dict:
        """Get statistics for current session"""
        duration = datetime.now() - self._session_stats['start_time']

        return {
            'requests': self._session_stats['requests'],
            'tokens': self._session_stats['tokens'],
            'cost': self._session_stats['cost'],
            'duration_seconds': duration.total_seconds(),
            'avg_tokens_per_request': (
                self._session_stats['tokens'] / self._session_stats['requests']
                if self._session_stats['requests'] > 0 else 0
            )
        }

    def get_cost_projection(self) -> Dict:
        """Project costs based on current usage patterns"""
        # Get last 7 days
        week_ago = (datetime.now() - timedelta(days=7)).isoformat()

        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        cursor.execute('''
            SELECT
                DATE(timestamp) as date,
                SUM(cost_usd) as daily_cost
            FROM usage_log
            WHERE timestamp > ?
            GROUP BY DATE(timestamp)
            ORDER BY date
        ''', (week_ago,))

        rows = cursor.fetchall()
        conn.close()

        if not rows:
            return {
                'avg_daily_cost': 0.0,
                'projected_monthly': 0.0,
                'trend': 'stable'
            }

        daily_costs = [row[1] for row in rows]
        avg_daily = sum(daily_costs) / len(daily_costs)

        # Detect trend
        if len(daily_costs) >= 3:
            recent = sum(daily_costs[-3:]) / 3
            earlier = sum(daily_costs[:3]) / 3
            if recent > earlier * 1.2:
                trend = 'increasing'
            elif recent < earlier * 0.8:
                trend = 'decreasing'
            else:
                trend = 'stable'
        else:
            trend = 'insufficient_data'

        return {
            'avg_daily_cost': avg_daily,
            'projected_monthly': avg_daily * 30,
            'trend': trend,
            'days_analyzed': len(daily_costs)
        }

    def get_recent_errors(self, limit: int = 10) -> List[Dict]:
        """Get recent error logs"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        cursor.execute('''
            SELECT timestamp, model, task_type, error_message
            FROM usage_log
            WHERE success = 0
            ORDER BY timestamp DESC
            LIMIT ?
        ''', (limit,))

        rows = cursor.fetchall()
        conn.close()

        return [
            {
                'timestamp': row[0],
                'model': row[1],
                'task_type': row[2],
                'error': row[3]
            }
            for row in rows
        ]

    def export_usage_report(self, days: int = 30) -> Dict:
        """Generate comprehensive usage report"""
        return {
            'generated_at': datetime.now().isoformat(),
            'period_days': days,
            'daily_usage': self.get_daily_usage(),
            'monthly_usage': self.get_monthly_usage(),
            'by_model': self.get_usage_by_model(days),
            'by_task': self.get_usage_by_task(days),
            'budget_status': self.check_budget(),
            'cost_projection': self.get_cost_projection(),
            'recent_errors': self.get_recent_errors(5)
        }


# Singleton instance
_tracker_instance = None


def get_tracker(db_path: str = None) -> UsageTracker:
    """Get or create the usage tracker singleton"""
    global _tracker_instance
    if _tracker_instance is None:
        _tracker_instance = UsageTracker(db_path)
    return _tracker_instance

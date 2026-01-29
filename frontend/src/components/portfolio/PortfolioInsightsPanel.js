// frontend/src/components/portfolio/PortfolioInsightsPanel.js
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bot, Sparkles, RefreshCw, ChevronRight, AlertTriangle, TrendingUp, Shield, PieChart, Loader } from '../icons';
import { analystAPI } from '../../services/api';
import { useAskAI } from '../../hooks';
import './PortfolioInsightsPanel.css';

/**
 * AI-powered insights panel for portfolio analysis
 */
export default function PortfolioInsightsPanel({
  portfolio,
  holdings,
  performance,
  riskMetrics,
  allocation
}) {
  const navigate = useNavigate();
  const [insights, setInsights] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [llmEnabled, setLlmEnabled] = useState(null);

  // Ask AI context for portfolio insights
  const askAIProps = useAskAI(() => ({
    type: 'metric',
    metric: 'portfolio_insights',
    label: 'Portfolio Insights',
    portfolioName: portfolio?.name,
    totalValue: portfolio?.total_value,
    holdingsCount: holdings?.length || 0,
    topHolding: holdings?.[0]?.symbol,
    topHoldingWeight: holdings?.[0] && portfolio?.total_value
      ? ((holdings[0].current_value / portfolio.total_value) * 100).toFixed(1)
      : null,
    sharpeRatio: performance?.sharpeRatio,
    cashPercent: portfolio?.cash_balance && portfolio?.total_value
      ? ((portfolio.cash_balance / portfolio.total_value) * 100).toFixed(1)
      : null
  }));

  // Check if LLM is enabled
  useEffect(() => {
    const checkLLM = async () => {
      try {
        const response = await analystAPI.health();
        setLlmEnabled(response.data.llm?.enabled || false);
      } catch {
        setLlmEnabled(false);
      }
    };
    checkLLM();
  }, []);

  // Generate insights based on portfolio data
  const generateInsights = useCallback(async () => {
    if (!portfolio || holdings.length === 0) return;

    setLoading(true);
    setError(null);

    try {
      // Build context for the AI
      const portfolioContext = buildPortfolioContext();

      // Create conversation with the value analyst (best for portfolio analysis)
      const convResponse = await analystAPI.createConversation({
        analystId: 'value'
      });

      const conversation = convResponse.data.conversation;

      // Request portfolio analysis
      const msgResponse = await analystAPI.sendMessage(
        conversation.id,
        `Please analyze this portfolio and provide 3-5 key insights:

${portfolioContext}

Focus on:
1. Portfolio concentration and diversification
2. Risk factors and potential issues
3. Specific actionable recommendations
4. Any positions that may need attention

Keep your response concise with bullet points.`,
        null
      );

      setInsights({
        content: msgResponse.data.message.content,
        timestamp: new Date().toISOString(),
        conversationId: conversation.id
      });
    } catch (err) {
      console.error('Failed to generate insights:', err);
      setError('Failed to generate insights. Try again later.');
      // Fall back to rule-based insights
      setInsights(generateRuleBasedInsights());
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portfolio, holdings, performance, riskMetrics, allocation]);

  // Build context string for AI
  const buildPortfolioContext = () => {
    const topHoldings = holdings
      .slice(0, 10)
      .map(h => `- ${h.symbol}: ${((h.current_value / portfolio.total_value) * 100).toFixed(1)}% weight, ${h.unrealized_gain_pct >= 0 ? '+' : ''}${h.unrealized_gain_pct?.toFixed(1)}% gain`)
      .join('\n');

    const sectorBreakdown = allocation?.sectors
      ? Object.entries(allocation.sectors)
          .sort((a, b) => b[1].weight - a[1].weight)
          .slice(0, 5)
          .map(([sector, data]) => `- ${sector}: ${data.weight?.toFixed(1)}%`)
          .join('\n')
      : 'Not available';

    return `PORTFOLIO SUMMARY:
- Total Value: $${portfolio.total_value?.toLocaleString()}
- Total Return: ${portfolio.total_gain_pct?.toFixed(2)}%
- Cash: $${portfolio.cash_balance?.toLocaleString()} (${((portfolio.cash_balance / portfolio.total_value) * 100).toFixed(1)}%)
- Positions: ${holdings.length}

PERFORMANCE METRICS:
${performance ? `- 1Y Return: ${performance.totalReturn?.toFixed(2)}%
- Volatility: ${performance.volatility?.toFixed(2)}%
- Sharpe Ratio: ${performance.sharpeRatio?.toFixed(2)}
- Max Drawdown: ${performance.maxDrawdown?.toFixed(2)}%` : 'Not available'}

RISK METRICS:
${riskMetrics ? `- Beta: ${riskMetrics.beta?.toFixed(2)}
- Alpha: ${riskMetrics.alpha?.toFixed(2)}%` : 'Not available'}

TOP HOLDINGS:
${topHoldings}

SECTOR ALLOCATION:
${sectorBreakdown}`;
  };

  // Generate rule-based insights when AI is unavailable
  const generateRuleBasedInsights = () => {
    const insights = [];
    const totalValue = portfolio.total_value || 0;

    // Check concentration
    if (holdings.length > 0) {
      const topWeight = (holdings[0].current_value / totalValue) * 100;
      if (topWeight > 25) {
        insights.push({
          type: 'warning',
          icon: AlertTriangle,
          title: 'High Concentration',
          text: `${holdings[0].symbol} represents ${topWeight.toFixed(1)}% of your portfolio. Consider diversifying.`
        });
      }
    }

    // Check cash level
    const cashPct = (portfolio.cash_balance / totalValue) * 100;
    if (cashPct > 20) {
      insights.push({
        type: 'info',
        icon: PieChart,
        title: 'High Cash Position',
        text: `${cashPct.toFixed(1)}% cash may be underperforming. Consider deploying capital.`
      });
    } else if (cashPct < 5) {
      insights.push({
        type: 'info',
        icon: Shield,
        title: 'Low Cash Reserves',
        text: 'Consider maintaining some cash for opportunities or emergencies.'
      });
    }

    // Check diversification
    if (holdings.length < 5) {
      insights.push({
        type: 'warning',
        icon: AlertTriangle,
        title: 'Limited Diversification',
        text: `Only ${holdings.length} positions. Consider adding more stocks to reduce risk.`
      });
    }

    // Check for big winners
    const bigWinners = holdings.filter(h => h.unrealized_gain_pct > 50);
    if (bigWinners.length > 0) {
      insights.push({
        type: 'success',
        icon: TrendingUp,
        title: 'Strong Performers',
        text: `${bigWinners.map(h => h.symbol).join(', ')} ${bigWinners.length === 1 ? 'is' : 'are'} up over 50%. Consider taking some profits.`
      });
    }

    // Check for big losers
    const bigLosers = holdings.filter(h => h.unrealized_gain_pct < -30);
    if (bigLosers.length > 0) {
      insights.push({
        type: 'warning',
        icon: AlertTriangle,
        title: 'Underperformers',
        text: `${bigLosers.map(h => h.symbol).join(', ')} ${bigLosers.length === 1 ? 'is' : 'are'} down over 30%. Review thesis or consider tax-loss harvesting.`
      });
    }

    // Performance insights
    if (performance?.sharpeRatio !== undefined) {
      if (performance.sharpeRatio > 1.5) {
        insights.push({
          type: 'success',
          icon: Shield,
          title: 'Excellent Risk-Adjusted Returns',
          text: `Sharpe ratio of ${performance.sharpeRatio.toFixed(2)} indicates strong risk-adjusted performance.`
        });
      } else if (performance.sharpeRatio < 0.5) {
        insights.push({
          type: 'warning',
          icon: Shield,
          title: 'Low Risk-Adjusted Returns',
          text: `Consider rebalancing to improve risk-adjusted returns.`
        });
      }
    }

    return {
      rulesBased: true,
      items: insights.slice(0, 5),
      timestamp: new Date().toISOString()
    };
  };

  // Auto-generate rule-based insights on mount
  useEffect(() => {
    if (portfolio && holdings.length > 0 && !insights && !loading) {
      setInsights(generateRuleBasedInsights());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portfolio, holdings]);

  if (!portfolio || holdings.length === 0) {
    return null;
  }

  return (
    <div className={`portfolio-insights-panel ${expanded ? 'expanded' : ''}`} {...askAIProps}>
      <div className="insights-header">
        <div className="insights-title">
          <Sparkles size={18} className="insights-icon" />
          <h3>AI Insights</h3>
          {llmEnabled === false && (
            <span className="insights-badge demo">Demo</span>
          )}
          {llmEnabled === true && (
            <span className="insights-badge live">AI</span>
          )}
        </div>
        <div className="insights-actions">
          {llmEnabled && (
            <button
              className="insights-refresh-btn"
              onClick={generateInsights}
              disabled={loading}
              title="Get AI Analysis"
            >
              {loading ? (
                <Loader size={14} className="spin" />
              ) : (
                <RefreshCw size={14} />
              )}
            </button>
          )}
        </div>
      </div>

      <div className="insights-content">
        {loading ? (
          <div className="insights-loading">
            <Bot size={24} className="loading-icon" />
            <span>Analyzing portfolio...</span>
          </div>
        ) : error ? (
          <div className="insights-error">
            <AlertTriangle size={16} />
            <span>{error}</span>
          </div>
        ) : insights?.rulesBased ? (
          // Rule-based insights
          <div className="insights-list">
            {insights.items.map((insight, idx) => (
              <div key={idx} className={`insight-item ${insight.type}`}>
                <insight.icon size={16} className="insight-icon" />
                <div className="insight-text">
                  <strong>{insight.title}</strong>
                  <span>{insight.text}</span>
                </div>
              </div>
            ))}
            {llmEnabled && (
              <button
                className="get-ai-analysis-btn"
                onClick={generateInsights}
                disabled={loading}
              >
                <Bot size={14} />
                Get Detailed AI Analysis
              </button>
            )}
          </div>
        ) : insights?.content ? (
          // AI-generated insights
          <div className="ai-insights">
            <div className={`ai-content ${expanded ? 'expanded' : ''}`}>
              {insights.content}
            </div>
            {insights.content.length > 300 && (
              <button
                className="expand-btn"
                onClick={() => setExpanded(!expanded)}
              >
                {expanded ? 'Show Less' : 'Show More'}
              </button>
            )}
            <button
              className="continue-chat-btn"
              onClick={() => navigate(`/analyst?symbol=${holdings[0]?.symbol}`)}
            >
              <Bot size={14} />
              Continue in AI Analyst
              <ChevronRight size={14} />
            </button>
          </div>
        ) : (
          <div className="no-insights">
            <p>No insights available yet.</p>
            {llmEnabled && (
              <button
                className="get-ai-analysis-btn"
                onClick={generateInsights}
                disabled={loading}
              >
                <Bot size={14} />
                Generate AI Insights
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

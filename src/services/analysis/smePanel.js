// src/services/analysis/smePanel.js
// SME Panel - Simulated expert debate for strategy analysis

/**
 * SME Panel Debate System
 *
 * Simulates a panel of 5 investment experts analyzing backtest results:
 * - Benjamin (Value Analyst)
 * - Marcus (Quant Analyst)
 * - Sarah (Growth Analyst)
 * - Elena (Tail Risk Analyst)
 * - Alex (Contrarian Analyst)
 */
class SMEPanel {
  constructor() {
    this.analysts = {
      benjamin: {
        name: 'Benjamin',
        role: 'Value Analyst',
        focus: ['margin of safety', 'intrinsic value', 'quality', 'fundamentals'],
        philosophy: 'Conservative, long-term oriented, margin of safety focused'
      },
      marcus: {
        name: 'Marcus',
        role: 'Quant Analyst',
        focus: ['statistical significance', 'position sizing', 'risk metrics', 'factor analysis'],
        philosophy: 'Data-driven, systematic, evidence-based'
      },
      sarah: {
        name: 'Sarah',
        role: 'Growth Analyst',
        focus: ['revenue growth', 'momentum', 'compounding', 'market leadership'],
        philosophy: 'Future-oriented, growth at reasonable price'
      },
      elena: {
        name: 'Elena',
        role: 'Tail Risk Analyst',
        focus: ['black swans', 'hedging', 'drawdown protection', 'asymmetric risk'],
        philosophy: 'Risk-first, fragility reduction, convexity seeking'
      },
      alex: {
        name: 'Alex',
        role: 'Contrarian Analyst',
        focus: ['market psychology', 'sentiment extremes', 'crowd behavior', 'positioning'],
        philosophy: 'Contrarian, market structure aware, opportunistic'
      }
    };
  }

  /**
   * Conduct full panel debate on backtest results
   * @param {Object} results - Backtest results object
   * @returns {Object} Debate transcript and recommendations
   */
  conductDebate(results) {
    console.log('\n' + '='.repeat(80));
    console.log('🎭 SME PANEL DEBATE: Strategy Performance Review');
    console.log('='.repeat(80));

    // Round 1: Individual analyst reviews
    const individualReviews = this._round1_individualReviews(results);

    // Round 2: Debate key topics
    const debates = this._round2_debates(results, individualReviews);

    // Round 3: Consensus recommendations
    const recommendations = this._round3_consensus(results, individualReviews, debates);

    return {
      individualReviews,
      debates,
      recommendations,
      summary: this._generateExecutiveSummary(results, recommendations)
    };
  }

  /**
   * Round 1: Each analyst provides their perspective
   */
  _round1_individualReviews(results) {
    console.log('\n📋 ROUND 1: Individual Analyst Reviews\n');

    const reviews = {};

    // Benjamin (Value)
    reviews.benjamin = this._benjaminReview(results);
    console.log(`\n💼 ${this.analysts.benjamin.name} (${this.analysts.benjamin.role}):`);
    reviews.benjamin.points.forEach(p => console.log(`   • ${p}`));

    // Marcus (Quant)
    reviews.marcus = this._marcusReview(results);
    console.log(`\n📊 ${this.analysts.marcus.name} (${this.analysts.marcus.role}):`);
    reviews.marcus.points.forEach(p => console.log(`   • ${p}`));

    // Sarah (Growth)
    reviews.sarah = this._sarahReview(results);
    console.log(`\n🚀 ${this.analysts.sarah.name} (${this.analysts.sarah.role}):`);
    reviews.sarah.points.forEach(p => console.log(`   • ${p}`));

    // Elena (Tail Risk)
    reviews.elena = this._elenaReview(results);
    console.log(`\n🛡️ ${this.analysts.elena.name} (${this.analysts.elena.role}):`);
    reviews.elena.points.forEach(p => console.log(`   • ${p}`));

    // Alex (Contrarian)
    reviews.alex = this._alexReview(results);
    console.log(`\n🔄 ${this.analysts.alex.name} (${this.analysts.alex.role}):`);
    reviews.alex.points.forEach(p => console.log(`   • ${p}`));

    return reviews;
  }

  _benjaminReview(results) {
    const perf = results.performance;
    const trades = results.trades || perf.trades;
    const winRate = trades?.winRate || 0;
    const avgHoldDays = results.avgHoldDays || 30;

    return {
      analyst: 'Benjamin',
      role: 'Value',
      sentiment: winRate < 0.2 ? 'very_concerned' : winRate < 0.4 ? 'concerned' : 'cautiously_optimistic',
      points: [
        winRate === 0 ?
          'CRITICAL: 0% win rate means fundamentally broken stock selection. Not finding value.' :
          `Win rate of ${(winRate * 100).toFixed(1)}% ${winRate < 0.4 ? 'too low - missing quality companies' : 'reasonable for value strategy'}`,

        perf.minScore >= 0.3 ?
          'Signal threshold 0.30 too high - filtering out quality at reasonable prices' :
          'Signal threshold looks appropriate for value hunting',

        avgHoldDays < 60 ?
          `${avgHoldDays}-day average hold violates value principles (need 180+ days for thesis to play out)` :
          `Holding period of ${avgHoldDays} days aligns with value investing timeframes`,

        Math.abs(perf.alpha || perf.alphaPct || 0) > 50 ?
          'Extreme alpha suggests either lookahead bias or broken model - not sustainable' :
          perf.alpha < 0 ? 'Negative alpha indicates failure to identify undervalued securities' : 'Alpha generation is modest but achievable'
      ]
    };
  }

  _marcusReview(results) {
    const perf = results.performance;
    const sharpe = perf.sharpe || 0;
    const turnover = results.turnover || 0;
    const trades = results.trades || perf.trades;

    return {
      analyst: 'Marcus',
      role: 'Quant',
      sentiment: sharpe < 0 ? 'very_concerned' : sharpe < 0.5 ? 'concerned' : 'positive',
      points: [
        sharpe < 0 ?
          `Sharpe ${sharpe.toFixed(2)} is catastrophic - worse than random. Strategy has negative risk-adjusted returns` :
          sharpe < 1 ? `Sharpe ${sharpe.toFixed(2)} below acceptable threshold (target >1.0)` :
          `Sharpe ${sharpe.toFixed(2)} indicates good risk-adjusted returns`,

        turnover > 1000 ?
          `${turnover.toFixed(0)}% turnover = death by friction (~${(turnover * 0.001).toFixed(1)}% annual drag from costs)` :
          turnover > 500 ? `${turnover.toFixed(0)}% turnover is elevated - optimize rebalancing frequency` :
          `${turnover.toFixed(0)}% turnover is manageable`,

        perf.stop_loss_pct && perf.volatility ?
          perf.stop_loss_pct < perf.volatility * 1.2 ?
            `${(perf.stop_loss_pct * 100).toFixed(0)}% stop loss too tight for ${(perf.volatility * 100).toFixed(0)}% volatility (should be 1.5-2x vol)` :
            'Stop loss appropriately sized for volatility' :
          'Insufficient data on stop loss vs volatility relationship',

        trades && trades.total ?
          trades.total < 100 ? `Only ${trades.total} trades - insufficient sample for statistical significance` :
          trades.total < 200 ? `${trades.total} trades provides moderate statistical confidence` :
          `${trades.total} trades provides strong statistical power` :
          'Need more trade data for statistical analysis'
      ]
    };
  }

  _sarahReview(results) {
    const perf = results.performance;
    const config = results.strategyConfig || {};
    const momentumWeight = config.weight_momentum || 0.15;
    const underwaterExit = config.exit_underwater_days || 60;

    return {
      analyst: 'Sarah',
      role: 'Growth',
      sentiment: momentumWeight < 0.2 ? 'concerned' : 'positive',
      points: [
        underwaterExit && underwaterExit < 90 ?
          `${underwaterExit}-day underwater exit kills compounders mid-recovery. Growth needs patience` :
          'Holding period allows growth stories to develop',

        momentumWeight < 0.25 ?
          `Momentum weight ${(momentumWeight * 100).toFixed(0)}% too low for growth strategies (should be 30-40%)` :
          `Momentum weight ${(momentumWeight * 100).toFixed(0)}% appropriate for growth capture`,

        config.max_hold_days && config.max_hold_days < 365 ?
          'Max hold period limits runway capture - exiting right when growth accelerates' :
          'No max hold constraint allows compounding to work',

        perf.totalReturnPct < 0 ?
          'Negative returns indicate missing high-quality growth opportunities' :
          perf.totalReturnPct < 15 ? 'Moderate returns - growth strategy should aim higher' :
          'Strong returns demonstrate effective growth capture'
      ]
    };
  }

  _elenaReview(results) {
    const perf = results.performance;
    const config = results.strategyConfig || {};
    const regimeMultiplier = config.regime_exposure_high_risk || 0.5;
    const tailHedge = config.tail_hedge_allocation || 0;
    const maxDrawdown = perf.maxDrawdownPct || perf.maxDrawdown * 100 || 0;

    return {
      analyst: 'Elena',
      role: 'Tail Risk',
      sentiment: maxDrawdown > 40 ? 'very_concerned' : maxDrawdown > 25 ? 'concerned' : 'positive',
      points: [
        regimeMultiplier < 0.6 ?
          `${regimeMultiplier}x regime multiplier = asymmetric overcorrection. Cutting exposure too aggressively` :
          regimeMultiplier < 0.8 ? `${regimeMultiplier}x regime multiplier reasonable but conservative` :
          `${regimeMultiplier}x regime multiplier may be too permissive in high-risk regimes`,

        tailHedge > 0 && maxDrawdown > 40 ?
          `${(tailHedge * 100).toFixed(0)}% tail hedge allocation not deployed properly - ${maxDrawdown.toFixed(1)}% max drawdown indicates NO tail protection` :
          tailHedge === 0 && maxDrawdown > 30 ? 'No tail hedge allocation - portfolio vulnerable to black swans' :
          tailHedge > 0 ? `${(tailHedge * 100).toFixed(0)}% tail hedge providing protection` :
          'Tail hedge not implemented',

        maxDrawdown > 50 ?
          `${maxDrawdown.toFixed(1)}% max drawdown is CATASTROPHIC - many investors would abandon strategy` :
          maxDrawdown > 30 ? `${maxDrawdown.toFixed(1)}% max drawdown excessive - target <20%` :
          maxDrawdown > 20 ? `${maxDrawdown.toFixed(1)}% max drawdown acceptable but could improve` :
          `${maxDrawdown.toFixed(1)}% max drawdown excellent - strong risk management`,

        perf.volatility ?
          perf.volatility > 0.35 ? `${(perf.volatility * 100).toFixed(0)}% volatility too high - creates behavioral risk` :
          perf.volatility > 0.25 ? `${(perf.volatility * 100).toFixed(0)}% volatility elevated but manageable` :
          `${(perf.volatility * 100).toFixed(0)}% volatility well-controlled` :
          'Volatility data needed for tail risk assessment'
      ]
    };
  }

  _alexReview(results) {
    const perf = results.performance;
    const config = results.strategyConfig || {};
    const signalRejectionRate = results.signalRejectionRate || 0.991;
    const minConfidence = config.min_confidence || 0.6;
    const sentimentWeight = config.weight_sentiment || 0.15;

    return {
      analyst: 'Alex',
      role: 'Contrarian',
      sentiment: signalRejectionRate > 0.95 ? 'very_concerned' : 'positive',
      points: [
        signalRejectionRate > 0.95 ?
          `${(signalRejectionRate * 100).toFixed(1)}% signal rejection = missing the crowd-hated opportunities. Best alpha is in the rejected ${(signalRejectionRate * 100).toFixed(1)}%` :
          signalRejectionRate > 0.85 ? `${(signalRejectionRate * 100).toFixed(1)}% rejection rate high - may be too selective` :
          `${(signalRejectionRate * 100).toFixed(1)}% rejection rate reasonable`,

        minConfidence >= 0.6 ?
          `${minConfidence} confidence threshold = only buying consensus picks. Contrarian plays rejected` :
          `${minConfidence} confidence threshold allows contrarian opportunities`,

        sentimentWeight < 0.2 ?
          `Sentiment weight ${(sentimentWeight * 100).toFixed(0)}% underutilized - missing sentiment extremes` :
          `Sentiment weight ${(sentimentWeight * 100).toFixed(0)}% appropriate for contrarian signals`,

        perf.benchmarkReturnPct ?
          perf.totalReturnPct < perf.benchmarkReturnPct ?
            'Underperforming benchmark = following the crowd. True contrarian generates alpha' :
            perf.alphaPct > 10 ? 'Strong alpha suggests effective contrarian positioning' :
            'Modest alpha - contrarian edge present but not fully exploited' :
          'Need benchmark comparison for contrarian assessment'
      ]
    };
  }

  /**
   * Round 2: Debate specific topics
   */
  _round2_debates(results, reviews) {
    console.log('\n\n🎯 ROUND 2: Topic Debates\n');

    const debates = [];

    // Topic 1: Position Sizing
    debates.push(this._debatePositionSizing(results, reviews));

    // Topic 2: Signal Filtering
    debates.push(this._debateSignalFiltering(results, reviews));

    // Topic 3: Risk Management
    debates.push(this._debateRiskManagement(results, reviews));

    return debates;
  }

  _debatePositionSizing(results, reviews) {
    console.log('💭 Topic: Position Sizing\n');

    const debate = {
      topic: 'Position Sizing',
      exchanges: []
    };

    // Marcus opening
    const marcusOpening = '5% max position size but actual allocation only 1.6-6.4% after multipliers. ' +
      'Running limited positions but leaving 50%+ capital on sidelines. Leaving alpha on table.';
    console.log(`   Marcus: "${marcusOpening}"`);
    debate.exchanges.push({ speaker: 'Marcus', statement: marcusOpening });

    // Benjamin counter
    const benjaminCounter = results.performance.maxDrawdownPct > 40 ?
      'Disagree. With 38%+ volatility and catastrophic drawdown, we need SMALLER positions, not larger. ' +
      'Problem is stock selection quality, not position size.' :
      'Position sizing should follow quality. High-quality value: can size up. Speculative turnarounds: stay small.';
    console.log(`   Benjamin: "${benjaminCounter}"`);
    debate.exchanges.push({ speaker: 'Benjamin', statement: benjaminCounter });

    // Sarah synthesis
    const sarahSynthesis = "You're both right. High-conviction growth with strong fundamentals: 5% too small. " +
      'Deep value turnarounds or cyclicals: 2-3% appropriate. Need dynamic sizing by conviction AND quality.';
    console.log(`   Sarah: "${sarahSynthesis}"`);
    debate.exchanges.push({ speaker: 'Sarah', statement: sarahSynthesis });

    const consensus = 'Position sizing should vary by strategy type, conviction level, and company quality. ' +
      'Not one-size-fits-all.';
    console.log(`\n   ✅ CONSENSUS: ${consensus}\n`);
    debate.consensus = consensus;

    return debate;
  }

  _debateSignalFiltering(results, reviews) {
    console.log('💭 Topic: Signal Filtering\n');

    const debate = {
      topic: 'Signal Filtering',
      exchanges: []
    };

    // Alex opening
    const alexOpening = "99.1% rejection rate means we're only buying what everyone agrees on. " +
      "The alpha is in the 99.1% we're rejecting - the uncomfortable, consensus-hated ideas.";
    console.log(`   Alex: "${alexOpening}"`);
    debate.exchanges.push({ speaker: 'Alex', statement: alexOpening });

    // Benjamin counter
    const benjaminCounter = results.performance.trades?.winRate < 0.3 ?
      'But we have sub-30% win rate WITH strict filtering! Loosening filters means more losers. ' +
      'Need better signal quality first, then can afford to be less selective.' :
      'Quality over quantity. Rather have 20 good ideas than 200 mediocre ones. Filtering protects capital.';
    console.log(`   Benjamin: "${benjaminCounter}"`);
    debate.exchanges.push({ speaker: 'Benjamin', statement: benjaminCounter });

    // Marcus data
    const marcusData = 'Statistically, going from 200 trades to 500-800 trades increases sample size, ' +
      'reduces luck factor, and smooths returns. But only if edge persists at lower thresholds. Need to test incrementally.';
    console.log(`   Marcus: "${marcusData}"`);
    debate.exchanges.push({ speaker: 'Marcus', statement: marcusData });

    const consensus = 'Test moderate filter relaxation (0.3→0.25→0.2) incrementally. Monitor if edge persists. ' +
      'If win rate collapses, revert. If win rate holds, capture more opportunities.';
    console.log(`\n   ✅ CONSENSUS: ${consensus}\n`);
    debate.consensus = consensus;

    return debate;
  }

  _debateRiskManagement(results, reviews) {
    console.log('💭 Topic: Risk Management\n');

    const debate = {
      topic: 'Risk Management',
      exchanges: []
    };

    // Elena opening
    const elenaOpening = results.performance.maxDrawdownPct > 40 ?
      "40%+ drawdown with tail hedge 'enabled' means risk management is broken. Either hedge isn't working " +
      'or position sizing is wrong. This drawdown ends careers.' :
      'Tail risk management working but can optimize. Focus on drawdown duration, not just depth.';
    console.log(`   Elena: "${elenaOpening}"`);
    debate.exchanges.push({ speaker: 'Elena', statement: elenaOpening });

    // Marcus technical
    const marcusTechnical = '10% stop loss with 38% volatility = getting stopped out by noise. ' +
      'Stop should be 1.5-2x volatility (15-20%) to avoid false exits while still protecting capital.';
    console.log(`   Marcus: "${marcusTechnical}"`);
    debate.exchanges.push({ speaker: 'Marcus', statement: marcusTechnical });

    // Sarah timing
    const sarahTiming = '60-day underwater exit kills recovering growth stocks. After correction, need ' +
      '90-180 days for business momentum to reflect in price. Exiting at day 60 = selling the bottom.';
    console.log(`   Sarah: "${sarahTiming}"`);
    debate.exchanges.push({ speaker: 'Sarah', statement: sarahTiming });

    const consensus = 'Risk management needs calibration: widen stops to 15%, extend underwater exit to 90+ days, ' +
      'reduce regime suppression from 0.5x to 0.75x. Goal: protect from disaster, not from volatility.';
    console.log(`\n   ✅ CONSENSUS: ${consensus}\n`);
    debate.consensus = consensus;

    return debate;
  }

  /**
   * Round 3: Generate actionable recommendations
   */
  _round3_consensus(results, reviews, debates) {
    console.log('\n🎯 ROUND 3: Consensus Recommendations\n');

    const recommendations = {
      unanimous: [],
      highPriority: [],
      moderate: [],
      experimental: []
    };

    // Unanimous agreements (all 5 analysts)
    if (results.hadLookaheadBias) {
      recommendations.unanimous.push({
        recommendation: 'Fix lookahead bias in data queries',
        reason: 'All backtest results invalid without historical data filtering',
        analysts: 'All 5 unanimous'
      });
    }

    if (results.turnover > 1500) {
      recommendations.unanimous.push({
        recommendation: 'Reduce turnover from 3,125% to <1,000%',
        reason: 'Excessive trading costs destroying returns',
        implementation: 'Move from weekly to monthly rebalancing',
        analysts: 'All 5 unanimous'
      });
    }

    if (results.performance.sharpe < 0 || results.performance.trades?.winRate < 0.2) {
      recommendations.unanimous.push({
        recommendation: 'Strategy fundamentally broken - requires complete overhaul',
        reason: 'Negative Sharpe or <20% win rate indicates no edge',
        analysts: 'All 5 unanimous'
      });
    }

    // High priority (4+ analysts agree)
    recommendations.highPriority.push({
      priority: 1,
      recommendation: 'Reduce signal filtering from 99.1% to 85% rejection',
      impact: 'High - increases opportunities 5-7x',
      effort: 'Low (30 min)',
      analysts: ['Marcus', 'Alex', 'Sarah'],
      dissent: 'Benjamin cautious about quality dilution',
      implementation: 'minScore 0.3→0.2, minConfidence 0.6→0.5',
      expectedOutcome: '206 trades → 500-800 trades, maintain win rate >35%'
    });

    recommendations.highPriority.push({
      priority: 2,
      recommendation: 'Widen stop losses from 10% to 15%',
      impact: 'Medium - reduce false exits by 30-40%',
      effort: 'Low (5 min)',
      analysts: ['Marcus', 'Sarah', 'Elena'],
      implementation: 'stop_loss_pct 0.10 → 0.15',
      expectedOutcome: 'Fewer premature exits, improved win rate'
    });

    recommendations.highPriority.push({
      priority: 3,
      recommendation: 'Reduce regime suppression from 0.5x to 0.75x',
      impact: 'Medium - increase exposure in elevated risk',
      effort: 'Low (5 min)',
      analysts: ['Elena', 'Alex', 'Marcus'],
      implementation: 'regime_exposure_high_risk 0.5 → 0.75',
      expectedOutcome: 'Less asymmetric penalty, participate in recoveries'
    });

    // Moderate priority (2-3 analysts)
    recommendations.moderate.push({
      recommendation: 'Increase position sizing for high-conviction signals',
      impact: 'Medium - better alpha capture',
      effort: 'Medium (1 hour)',
      analysts: ['Marcus', 'Sarah'],
      dissent: 'Benjamin wants smaller positions given current drawdowns',
      implementation: 'Boost signal scale from 50-100% to 70-100%, add 15% boost for confidence >0.75'
    });

    recommendations.moderate.push({
      recommendation: 'Extend underwater exit from 60 to 90-120 days',
      impact: 'Medium - allow recovery time',
      effort: 'Low (5 min)',
      analysts: ['Sarah', 'Benjamin'],
      implementation: 'exit_underwater_days 60 → 90'
    });

    // Print recommendations
    console.log('🔴 UNANIMOUS AGREEMENTS:');
    recommendations.unanimous.forEach((r, i) => {
      console.log(`\n   ${i + 1}. ${r.recommendation}`);
      console.log(`      Reason: ${r.reason}`);
      if (r.implementation) console.log(`      Implementation: ${r.implementation}`);
      console.log(`      Analysts: ${r.analysts}`);
    });

    console.log('\n\n🟡 HIGH PRIORITY RECOMMENDATIONS:');
    recommendations.highPriority.forEach((r) => {
      console.log(`\n   Priority ${r.priority}: ${r.recommendation}`);
      console.log(`      Impact: ${r.impact}`);
      console.log(`      Effort: ${r.effort}`);
      console.log(`      Analysts: ${r.analysts.join(', ')}`);
      if (r.dissent) console.log(`      Dissent: ${r.dissent}`);
      console.log(`      Implementation: ${r.implementation}`);
      console.log(`      Expected: ${r.expectedOutcome}`);
    });

    console.log('\n\n🟢 MODERATE PRIORITY:');
    recommendations.moderate.forEach((r) => {
      console.log(`\n   • ${r.recommendation}`);
      console.log(`     Impact: ${r.impact}, Effort: ${r.effort}`);
      console.log(`     Analysts: ${r.analysts.join(', ')}`);
      if (r.dissent) console.log(`     Dissent: ${r.dissent}`);
      console.log(`     Implementation: ${r.implementation}`);
    });

    return recommendations;
  }

  /**
   * Generate executive summary
   */
  _generateExecutiveSummary(results, recommendations) {
    console.log('\n\n' + '='.repeat(80));
    console.log('📊 EXECUTIVE SUMMARY');
    console.log('='.repeat(80));

    const summary = {
      currentState: this._assessCurrentState(results),
      criticalIssues: recommendations.unanimous.length,
      quickWins: recommendations.highPriority.filter(r => r.effort === 'Low (30 min)' || r.effort === 'Low (5 min)').length,
      estimatedImpact: this._estimateImpact(recommendations),
      timeline: '1-2 weeks for high-priority fixes, 4 weeks for full optimization'
    };

    console.log(`\n Current Performance: ${results.performance.totalReturnPct?.toFixed(2) || 'N/A'}% return, ` +
      `${results.performance.alphaPct?.toFixed(2) || 'N/A'}% alpha`);
    console.log(` Current State: ${summary.currentState}`);
    console.log(` Critical Issues: ${summary.criticalIssues}`);
    console.log(` Quick Wins Available: ${summary.quickWins} (< 30 min each)`);
    console.log(` Estimated Impact: ${summary.estimatedImpact}`);
    console.log(` Timeline: ${summary.timeline}`);

    console.log('\n' + '='.repeat(80) + '\n');

    return summary;
  }

  _assessCurrentState(results) {
    const perf = results.performance;

    if (perf.sharpe < 0 || (perf.trades?.winRate || 0) < 0.2) {
      return 'CRITICAL - Strategy non-functional';
    } else if (perf.alphaPct < 0) {
      return 'POOR - Underperforming benchmark';
    } else if (perf.alphaPct < 5) {
      return 'FAIR - Modest alpha, needs optimization';
    } else if (perf.alphaPct < 10) {
      return 'GOOD - Decent alpha, fine-tuning recommended';
    } else {
      return 'EXCELLENT - Strong alpha generation';
    }
  }

  _estimateImpact(recommendations) {
    const quickFixes = recommendations.highPriority.filter(r => r.effort.includes('Low'));
    if (quickFixes.length >= 3) {
      return '+8-15% alpha from quick fixes alone';
    } else if (quickFixes.length >= 2) {
      return '+5-10% alpha from available optimizations';
    } else {
      return '+3-7% alpha from systematic improvements';
    }
  }
}

module.exports = { SMEPanel };

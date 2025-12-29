// src/services/ai/factorContextProvider.js
/**
 * Factor Context Provider for AI Analysts
 *
 * Enriches company context with factor analysis data to help AI analysts
 * provide more data-driven insights based on:
 * - Current factor scores (value, quality, momentum, growth, size, volatility)
 * - Factor percentile rankings vs universe
 * - Historical factor trends
 * - Factor-based peer comparison
 * - Investor holding patterns by factor
 */

const { getFactorAnalysisService } = require('../factors');

/**
 * Get historical intelligence service lazily to avoid circular deps
 */
function getHistoricalService() {
  const { getHistoricalIntelligence } = require('../historical');
  return getHistoricalIntelligence();
}

class FactorContextProvider {
  constructor() {
    this.factorService = null;
    this.db = null;
  }

  _ensureInitialized() {
    if (!this.factorService) {
      this.factorService = getFactorAnalysisService();
      this.db = require('../../database').db;
    }
  }

  /**
   * Get comprehensive factor context for a stock
   * Used to enrich AI analyst prompts with factor data
   */
  async getFactorContext(symbol, options = {}) {
    this._ensureInitialized();
    const { includeHistory = true, includePeers = true, includeInvestors = true, includePrecedents = true } = options;

    const context = {
      symbol,
      factorScores: null,
      factorRanking: null,
      factorTrend: null,
      peerComparison: null,
      investorProfile: null,
      historicalPrecedents: null,
      factorSummary: null
    };

    try {
      // Get current factor scores
      const scores = this.factorService.getStockFactorScores(symbol);
      if (scores) {
        // Calculate composite score from main factors
        const valueP = scores.value_percentile || 0;
        const qualityP = scores.quality_percentile || 0;
        const momentumP = scores.momentum_percentile || 0;
        const growthP = scores.growth_percentile || 0;
        const composite = Math.round((valueP + qualityP + momentumP + growthP) / 4);

        context.factorScores = {
          value: scores.value_score,
          quality: scores.quality_score,
          momentum: scores.momentum_score,
          growth: scores.growth_score,
          size: scores.size_score,
          volatility: scores.volatility_score,
          composite: composite,
          scoreDate: scores.score_date
        };

        context.factorRanking = {
          valuePercentile: scores.value_percentile,
          qualityPercentile: scores.quality_percentile,
          momentumPercentile: scores.momentum_percentile,
          growthPercentile: scores.growth_percentile,
          sizePercentile: scores.size_percentile,
          volatilityPercentile: scores.volatility_percentile
        };

        // Determine dominant factor
        const factors = ['value', 'quality', 'momentum', 'growth'];
        const percentiles = factors.map(f => ({
          factor: f,
          percentile: scores[`${f}_percentile`] || 0
        }));
        percentiles.sort((a, b) => b.percentile - a.percentile);
        context.dominantFactor = percentiles[0];
        context.weakestFactor = percentiles[percentiles.length - 1];
      }

      // Get factor history for trend analysis
      if (includeHistory) {
        const history = this.factorService.getStockFactorHistory(symbol, { limit: 8 });
        if (history && history.length >= 2) {
          const latest = history[0];
          const oldest = history[history.length - 1];

          context.factorTrend = {
            periods: history.length,
            fromDate: oldest.score_date,
            toDate: latest.score_date,
            valueChange: (latest.value_percentile || 0) - (oldest.value_percentile || 0),
            qualityChange: (latest.quality_percentile || 0) - (oldest.quality_percentile || 0),
            momentumChange: (latest.momentum_percentile || 0) - (oldest.momentum_percentile || 0),
            growthChange: (latest.growth_percentile || 0) - (oldest.growth_percentile || 0)
          };

          // Determine if factors are improving or deteriorating
          const changes = [
            context.factorTrend.valueChange,
            context.factorTrend.qualityChange,
            context.factorTrend.momentumChange,
            context.factorTrend.growthChange
          ];
          const avgChange = changes.reduce((a, b) => a + b, 0) / changes.length;
          context.factorTrend.overallTrend = avgChange > 5 ? 'improving' : avgChange < -5 ? 'deteriorating' : 'stable';
        }
      }

      // Get peer comparison (same sector, similar size)
      if (includePeers) {
        context.peerComparison = await this._getPeerFactorComparison(symbol);
      }

      // Get investor profile - who owns this stock and their factor preferences
      if (includeInvestors) {
        context.investorProfile = this._getInvestorFactorProfile(symbol);
      }

      // Get historical precedents - what famous investors did with this stock
      if (includePrecedents) {
        context.historicalPrecedents = this._getHistoricalPrecedents(symbol, context.factorRanking);
      }

      // Generate human-readable factor summary
      context.factorSummary = this._generateFactorSummary(context);

    } catch (err) {
      console.error(`Error getting factor context for ${symbol}:`, err.message);
    }

    return context;
  }

  /**
   * Compare stock's factor scores against sector peers
   */
  async _getPeerFactorComparison(symbol) {
    try {
      // Get company's sector
      const company = this.db.prepare(`
        SELECT id, sector, market_cap FROM companies WHERE symbol = ?
      `).get(symbol);

      if (!company || !company.sector) return null;

      // Get factor scores for same sector
      const peers = this.db.prepare(`
        SELECT
          c.symbol,
          c.name,
          sfs.value_percentile,
          sfs.quality_percentile,
          sfs.momentum_percentile,
          sfs.growth_percentile,
          (COALESCE(sfs.value_percentile, 0) + COALESCE(sfs.quality_percentile, 0) +
           COALESCE(sfs.momentum_percentile, 0) + COALESCE(sfs.growth_percentile, 0)) / 4.0 as composite_score
        FROM stock_factor_scores sfs
        JOIN companies c ON sfs.company_id = c.id
        WHERE c.sector = ?
          AND sfs.score_date = (SELECT MAX(score_date) FROM stock_factor_scores)
        ORDER BY composite_score DESC
        LIMIT 20
      `).all(company.sector);

      if (peers.length === 0) return null;

      // Find target stock in peer list
      const targetIndex = peers.findIndex(p => p.symbol === symbol);
      const targetStock = targetIndex >= 0 ? peers[targetIndex] : null;

      // Calculate sector averages
      const avgValue = peers.reduce((a, b) => a + (b.value_percentile || 0), 0) / peers.length;
      const avgQuality = peers.reduce((a, b) => a + (b.quality_percentile || 0), 0) / peers.length;
      const avgMomentum = peers.reduce((a, b) => a + (b.momentum_percentile || 0), 0) / peers.length;
      const avgGrowth = peers.reduce((a, b) => a + (b.growth_percentile || 0), 0) / peers.length;

      return {
        sector: company.sector,
        peerCount: peers.length,
        sectorRank: targetIndex >= 0 ? targetIndex + 1 : null,
        topPeers: peers.slice(0, 5).map(p => ({
          symbol: p.symbol,
          compositeScore: p.composite_score
        })),
        sectorAverages: {
          value: Math.round(avgValue),
          quality: Math.round(avgQuality),
          momentum: Math.round(avgMomentum),
          growth: Math.round(avgGrowth)
        },
        vsAverage: targetStock ? {
          valueVsAvg: Math.round((targetStock.value_percentile || 0) - avgValue),
          qualityVsAvg: Math.round((targetStock.quality_percentile || 0) - avgQuality),
          momentumVsAvg: Math.round((targetStock.momentum_percentile || 0) - avgMomentum),
          growthVsAvg: Math.round((targetStock.growth_percentile || 0) - avgGrowth)
        } : null
      };
    } catch (err) {
      console.error('Error in peer comparison:', err.message);
      return null;
    }
  }

  /**
   * Get investor profile for a stock - what type of investors own it
   */
  _getInvestorFactorProfile(symbol) {
    try {
      // Get investors who hold this stock and their factor profiles
      const investors = this.db.prepare(`
        SELECT
          fi.name,
          fi.investment_style,
          pfe.style_box,
          pfe.value_tilt,
          pfe.quality_tilt,
          pfe.momentum_tilt,
          pfe.growth_tilt,
          ih.shares,
          ih.market_value
        FROM investor_holdings ih
        JOIN famous_investors fi ON ih.investor_id = fi.id
        JOIN companies c ON ih.company_id = c.id
        LEFT JOIN portfolio_factor_exposures pfe ON pfe.investor_id = fi.id
          AND pfe.snapshot_date = (SELECT MAX(snapshot_date) FROM portfolio_factor_exposures WHERE investor_id = fi.id)
        WHERE c.symbol = ?
        ORDER BY ih.market_value DESC
        LIMIT 10
      `).all(symbol);

      if (investors.length === 0) return null;

      // Count investment styles
      const styleCounts = {};
      investors.forEach(inv => {
        const style = inv.investment_style || 'unknown';
        styleCounts[style] = (styleCounts[style] || 0) + 1;
      });

      // Determine dominant investor type
      const dominantStyle = Object.entries(styleCounts)
        .sort((a, b) => b[1] - a[1])[0];

      return {
        investorCount: investors.length,
        dominantInvestorStyle: dominantStyle ? dominantStyle[0] : null,
        styleMix: styleCounts,
        topHolders: investors.slice(0, 5).map(inv => ({
          name: inv.name,
          style: inv.investment_style,
          styleBox: inv.style_box
        })),
        factorTilts: {
          avgValueTilt: this._avgField(investors, 'value_tilt'),
          avgQualityTilt: this._avgField(investors, 'quality_tilt'),
          avgMomentumTilt: this._avgField(investors, 'momentum_tilt'),
          avgGrowthTilt: this._avgField(investors, 'growth_tilt')
        }
      };
    } catch (err) {
      console.error('Error in investor profile:', err.message);
      return null;
    }
  }

  _avgField(arr, field) {
    const vals = arr.filter(x => x[field] != null).map(x => x[field]);
    if (vals.length === 0) return null;
    return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length * 100) / 100;
  }

  /**
   * Get historical precedents - what famous investors did with this stock
   * Also finds similar factor situations from history
   */
  _getHistoricalPrecedents(symbol, factorRanking) {
    try {
      // Get recent decisions by famous investors on this stock
      const recentDecisions = this.db.prepare(`
        SELECT
          d.decision_date,
          d.decision_type,
          d.shares,
          d.position_value,
          d.shares_change_pct,
          d.return_1y,
          d.alpha_1y,
          fi.name as investor_name,
          fi.investment_style
        FROM investment_decisions d
        JOIN famous_investors fi ON d.investor_id = fi.id
        WHERE d.symbol = ?
        ORDER BY d.decision_date DESC
        LIMIT 15
      `).all(symbol);

      // Group by decision type
      const decisionsByType = {
        new_position: recentDecisions.filter(d => d.decision_type === 'new_position'),
        increased: recentDecisions.filter(d => d.decision_type === 'increased'),
        decreased: recentDecisions.filter(d => d.decision_type === 'decreased'),
        sold_out: recentDecisions.filter(d => d.decision_type === 'sold_out')
      };

      // Get similar factor situations - stocks with similar factor profile
      let similarSituations = null;
      if (factorRanking) {
        const tolerance = 15; // +/- 15 percentile points
        similarSituations = this.db.prepare(`
          SELECT
            d.symbol,
            d.decision_date,
            d.decision_type,
            d.return_1y,
            fi.name as investor_name,
            fi.investment_style,
            dfc.value_percentile,
            dfc.quality_percentile,
            dfc.momentum_percentile
          FROM decision_factor_context dfc
          JOIN investment_decisions d ON dfc.decision_id = d.id
          JOIN famous_investors fi ON d.investor_id = fi.id
          WHERE dfc.value_percentile BETWEEN ? AND ?
            AND dfc.quality_percentile BETWEEN ? AND ?
            AND d.symbol != ?
            AND d.return_1y IS NOT NULL
          ORDER BY d.decision_date DESC
          LIMIT 10
        `).all(
          (factorRanking.valuePercentile || 50) - tolerance,
          (factorRanking.valuePercentile || 50) + tolerance,
          (factorRanking.qualityPercentile || 50) - tolerance,
          (factorRanking.qualityPercentile || 50) + tolerance,
          symbol
        );
      }

      // Calculate success rate of similar situations
      let similarOutcomes = null;
      if (similarSituations && similarSituations.length > 0) {
        const winCount = similarSituations.filter(s => s.return_1y > 0).length;
        const avgReturn = similarSituations.reduce((sum, s) => sum + (s.return_1y || 0), 0) / similarSituations.length;
        similarOutcomes = {
          count: similarSituations.length,
          winRate: Math.round(winCount / similarSituations.length * 100),
          avgReturn: Math.round(avgReturn * 10) / 10
        };
      }

      // Generate narrative for precedents
      const narrative = this._generatePrecedentNarrative(symbol, recentDecisions, similarOutcomes);

      return {
        recentDecisions: recentDecisions.slice(0, 5),
        decisionSummary: {
          totalDecisions: recentDecisions.length,
          buys: decisionsByType.new_position.length + decisionsByType.increased.length,
          sells: decisionsByType.decreased.length + decisionsByType.sold_out.length
        },
        similarFactorSituations: similarSituations?.slice(0, 5) || [],
        similarOutcomes,
        narrative
      };
    } catch (err) {
      console.error('Error getting historical precedents:', err.message);
      return null;
    }
  }

  /**
   * Generate narrative for historical precedents
   */
  _generatePrecedentNarrative(symbol, decisions, similarOutcomes) {
    const parts = [];

    if (decisions.length > 0) {
      const recentBuyers = decisions
        .filter(d => d.decision_type === 'new_position' || d.decision_type === 'increased')
        .slice(0, 3);
      const recentSellers = decisions
        .filter(d => d.decision_type === 'sold_out' || d.decision_type === 'decreased')
        .slice(0, 3);

      if (recentBuyers.length > 0) {
        const buyerNames = recentBuyers.map(b => b.investor_name).join(', ');
        parts.push(`Recent buyers include: ${buyerNames}.`);
      }

      if (recentSellers.length > 0) {
        const sellerNames = recentSellers.map(s => s.investor_name).join(', ');
        parts.push(`Recent sellers include: ${sellerNames}.`);
      }
    }

    if (similarOutcomes && similarOutcomes.count >= 3) {
      parts.push(`Stocks with similar factor profiles had a ${similarOutcomes.winRate}% win rate with ${similarOutcomes.avgReturn > 0 ? '+' : ''}${similarOutcomes.avgReturn}% avg return (n=${similarOutcomes.count}).`);
    }

    return parts.length > 0 ? parts.join(' ') : null;
  }

  /**
   * Generate human-readable factor summary for AI prompts
   */
  _generateFactorSummary(context) {
    if (!context.factorScores) {
      return 'No factor scores available for this stock.';
    }

    const { factorRanking, dominantFactor, weakestFactor, factorTrend, peerComparison, historicalPrecedents } = context;

    let summary = [];

    // Overall positioning
    const composite = context.factorScores.composite;
    if (composite >= 70) {
      summary.push(`${context.symbol} ranks in the top tier of the factor universe with a composite score of ${composite}.`);
    } else if (composite >= 50) {
      summary.push(`${context.symbol} has above-average factor characteristics with a composite score of ${composite}.`);
    } else if (composite >= 30) {
      summary.push(`${context.symbol} has below-average factor characteristics with a composite score of ${composite}.`);
    } else {
      summary.push(`${context.symbol} ranks in the bottom tier with a composite score of ${composite}.`);
    }

    // Dominant factor
    if (dominantFactor && dominantFactor.percentile >= 70) {
      summary.push(`Its strongest characteristic is ${dominantFactor.factor} (${dominantFactor.percentile}th percentile).`);
    }

    // Weakest factor
    if (weakestFactor && weakestFactor.percentile <= 30) {
      summary.push(`Its weakest characteristic is ${weakestFactor.factor} (${weakestFactor.percentile}th percentile).`);
    }

    // Factor trends
    if (factorTrend) {
      if (factorTrend.overallTrend === 'improving') {
        summary.push(`Factor profile has been improving over the past ${factorTrend.periods} quarters.`);
      } else if (factorTrend.overallTrend === 'deteriorating') {
        summary.push(`Factor profile has been deteriorating over the past ${factorTrend.periods} quarters.`);
      }
    }

    // Peer comparison
    if (peerComparison && peerComparison.sectorRank) {
      summary.push(`Ranks #${peerComparison.sectorRank} out of ${peerComparison.peerCount} in the ${peerComparison.sector} sector.`);
    }

    // Historical precedents
    if (historicalPrecedents && historicalPrecedents.narrative) {
      summary.push(historicalPrecedents.narrative);
    }

    return summary.join(' ');
  }

  /**
   * Generate analyst-specific historical precedent insights
   * Each analyst gets tailored historical context relevant to their investment style
   */
  _getAnalystHistoricalInsight(analystId, historicalPrecedents, factorRanking) {
    if (!historicalPrecedents) return null;

    const { recentDecisions, decisionSummary, similarOutcomes, similarFactorSituations } = historicalPrecedents;

    // Filter decisions by investor style relevant to each analyst
    const valueInvestors = ['deep_value', 'quality_value', 'value'];
    const growthInvestors = ['growth', 'garp'];
    const contrarianInvestors = ['contrarian', 'special_situations'];

    switch (analystId) {
      case 'value': {
        // Benjamin: Focus on what value investors did and outcomes
        const valueBuys = recentDecisions?.filter(d =>
          valueInvestors.includes(d.investment_style) &&
          (d.decision_type === 'new_position' || d.decision_type === 'increased')
        ) || [];

        const valueBuysWithOutcomes = valueBuys.filter(d => d.return_1y != null);
        const valueWinRate = valueBuysWithOutcomes.length > 0
          ? Math.round(valueBuysWithOutcomes.filter(d => d.return_1y > 0).length / valueBuysWithOutcomes.length * 100)
          : null;
        const valueAvgReturn = valueBuysWithOutcomes.length > 0
          ? Math.round(valueBuysWithOutcomes.reduce((sum, d) => sum + d.return_1y, 0) / valueBuysWithOutcomes.length * 10) / 10
          : null;

        if (valueBuys.length > 0) {
          const investors = [...new Set(valueBuys.map(d => d.investor_name))].slice(0, 3).join(', ');
          let narrative = `Value investors (${investors}) have taken positions here.`;

          if (valueWinRate !== null && valueBuysWithOutcomes.length >= 2) {
            narrative += ` Historical outcomes: ${valueWinRate}% win rate, ${valueAvgReturn > 0 ? '+' : ''}${valueAvgReturn}% avg return (n=${valueBuysWithOutcomes.length}).`;
          }

          if (similarOutcomes && similarOutcomes.count >= 3) {
            narrative += ` Similar value setups historically: ${similarOutcomes.winRate}% win rate.`;
          }

          return {
            type: 'historical_value_precedent',
            data: { valueBuys: valueBuys.length, winRate: valueWinRate, avgReturn: valueAvgReturn },
            narrative
          };
        }
        break;
      }

      case 'growth': {
        // Catherine: Focus on growth investor activity and momentum outcomes
        const growthBuys = recentDecisions?.filter(d =>
          growthInvestors.includes(d.investment_style) &&
          (d.decision_type === 'new_position' || d.decision_type === 'increased')
        ) || [];

        if (growthBuys.length > 0 || (similarOutcomes && factorRanking?.momentumPercentile >= 50)) {
          let narrative = '';

          if (growthBuys.length > 0) {
            const investors = [...new Set(growthBuys.map(d => d.investor_name))].slice(0, 3).join(', ');
            narrative = `Growth investors (${investors}) have accumulated positions.`;
          }

          if (similarOutcomes && similarOutcomes.count >= 3) {
            const momentumContext = factorRanking?.momentumPercentile >= 60 ? 'with positive momentum' : 'at this momentum level';
            narrative += ` Stocks ${momentumContext} had ${similarOutcomes.winRate}% success rate historically.`;
          }

          if (narrative) {
            return {
              type: 'historical_growth_precedent',
              data: { growthBuys: growthBuys.length, similarOutcomes },
              narrative
            };
          }
        }
        break;
      }

      case 'contrarian': {
        // Diana: Focus on contrarian signals - heavy selling, out-of-favor situations
        const recentSells = recentDecisions?.filter(d =>
          d.decision_type === 'sold_out' || d.decision_type === 'decreased'
        ) || [];
        const recentBuys = recentDecisions?.filter(d =>
          d.decision_type === 'new_position' || d.decision_type === 'increased'
        ) || [];

        const sellRatio = recentDecisions?.length > 0
          ? recentSells.length / recentDecisions.length
          : 0;

        if (sellRatio >= 0.6 && recentSells.length >= 2) {
          // Heavy institutional selling - contrarian opportunity?
          let narrative = `Heavy institutional selling detected (${recentSells.length} sells vs ${recentBuys.length} buys).`;

          if (similarOutcomes && similarOutcomes.count >= 3) {
            narrative += ` When value investors bought similar setups after selloffs: ${similarOutcomes.winRate}% rebounded with ${similarOutcomes.avgReturn > 0 ? '+' : ''}${similarOutcomes.avgReturn}% avg return.`;
          }

          return {
            type: 'historical_contrarian_precedent',
            data: { sellRatio, sells: recentSells.length, buys: recentBuys.length },
            narrative
          };
        } else if (recentBuys.length >= 3) {
          // Many buying - consensus may be wrong
          return {
            type: 'historical_consensus_warning',
            data: { buys: recentBuys.length },
            narrative: `High institutional buying activity (${recentBuys.length} recent accumulations). Crowded trade risk - watch for late-cycle entry.`
          };
        }
        break;
      }

      case 'quant': {
        // Marcus: Full quantitative breakdown with statistics
        if (similarOutcomes && similarOutcomes.count >= 3) {
          const { winRate, avgReturn, count } = similarOutcomes;
          const alpha = factorRanking?.valuePercentile >= 60 && factorRanking?.qualityPercentile >= 50
            ? 'Quality-Value combo'
            : factorRanking?.momentumPercentile >= 70
            ? 'High momentum setup'
            : 'Current factor profile';

          return {
            type: 'historical_quant_stats',
            data: {
              winRate,
              avgReturn,
              sampleSize: count,
              factors: factorRanking
            },
            narrative: `Historical factor backtest: ${alpha} showed ${winRate}% hit rate, ${avgReturn > 0 ? '+' : ''}${avgReturn}% avg 1Y return (n=${count}). Statistical edge: ${winRate >= 60 ? 'positive' : winRate >= 50 ? 'neutral' : 'negative'}.`
          };
        }
        break;
      }

      case 'tailrisk': {
        // Nikolai: Focus on fragility signals and drawdown history
        const highVolatilityDecisions = recentDecisions?.filter(d => d.return_1y != null && d.return_1y < -20) || [];
        const maxDrawdown = highVolatilityDecisions.length > 0
          ? Math.min(...highVolatilityDecisions.map(d => d.return_1y))
          : null;

        if (maxDrawdown !== null || (factorRanking?.volatilityPercentile >= 60)) {
          let narrative = '';

          if (maxDrawdown !== null) {
            narrative = `Historical drawdown warning: Investors who bought similar setups saw ${maxDrawdown}% worst-case outcome.`;
          }

          if (factorRanking?.volatilityPercentile >= 70) {
            narrative += ` High volatility profile (${factorRanking.volatilityPercentile}th %ile) suggests elevated tail risk.`;
          }

          if (similarOutcomes && similarOutcomes.count >= 3) {
            const lossRate = 100 - similarOutcomes.winRate;
            narrative += ` ${lossRate}% of similar positions experienced losses.`;
          }

          if (narrative) {
            return {
              type: 'historical_tailrisk_precedent',
              data: { maxDrawdown, volatilityPercentile: factorRanking?.volatilityPercentile },
              narrative
            };
          }
        }
        break;
      }

      case 'tech': {
        // Elena: Focus on tech/growth investor activity and disruption patterns
        const techGrowthBuys = recentDecisions?.filter(d =>
          (growthInvestors.includes(d.investment_style) || d.investment_style === 'tech') &&
          (d.decision_type === 'new_position' || d.decision_type === 'increased')
        ) || [];

        if (techGrowthBuys.length > 0) {
          const investors = [...new Set(techGrowthBuys.map(d => d.investor_name))].slice(0, 3).join(', ');
          let narrative = `Tech-focused investors (${investors}) have accumulated.`;

          if (similarOutcomes && similarOutcomes.count >= 3) {
            narrative += ` Growth stocks at similar factor scores: ${similarOutcomes.winRate}% outperformed, ${similarOutcomes.avgReturn > 0 ? '+' : ''}${similarOutcomes.avgReturn}% avg return.`;
            if (similarOutcomes.winRate < 50) {
              narrative += ` Caution: Historical outcomes diverged significantly.`;
            }
          }

          return {
            type: 'historical_tech_precedent',
            data: { techBuys: techGrowthBuys.length, similarOutcomes },
            narrative
          };
        }
        break;
      }
    }

    // Fallback: general precedent narrative if available
    if (historicalPrecedents.narrative) {
      return {
        type: 'historical_general',
        data: historicalPrecedents,
        narrative: historicalPrecedents.narrative
      };
    }

    return null;
  }

  /**
   * Get factor context formatted specifically for different analyst types
   */
  async getAnalystSpecificContext(symbol, analystId) {
    const fullContext = await this.getFactorContext(symbol);

    if (!fullContext.factorScores) {
      return { factors: null, relevantInsights: [] };
    }

    const insights = [];
    const { factorRanking, factorTrend, peerComparison, historicalPrecedents } = fullContext;

    // Add analyst-specific historical precedent insights
    const historicalInsight = this._getAnalystHistoricalInsight(analystId, historicalPrecedents, factorRanking);
    if (historicalInsight) {
      insights.push(historicalInsight);
    }

    switch (analystId) {
      case 'value':
        // Benjamin - Value Analyst
        insights.push({
          type: 'value_assessment',
          data: {
            valuePercentile: factorRanking.valuePercentile,
            qualityPercentile: factorRanking.qualityPercentile,
            isDeepValue: factorRanking.valuePercentile >= 80,
            isQualityValue: factorRanking.valuePercentile >= 60 && factorRanking.qualityPercentile >= 60
          },
          narrative: factorRanking.valuePercentile >= 70
            ? `Strong value characteristics (${factorRanking.valuePercentile}th percentile) - potential margin of safety opportunity.`
            : factorRanking.valuePercentile <= 30
            ? `Weak value metrics (${factorRanking.valuePercentile}th percentile) - likely trading at a premium.`
            : `Moderate value positioning (${factorRanking.valuePercentile}th percentile).`
        });

        if (factorTrend) {
          insights.push({
            type: 'value_trend',
            data: { valueChange: factorTrend.valueChange },
            narrative: factorTrend.valueChange > 10
              ? `Value score improving - stock becoming cheaper relative to fundamentals.`
              : factorTrend.valueChange < -10
              ? `Value score declining - stock becoming more expensive relative to fundamentals.`
              : null
          });
        }
        break;

      case 'growth':
        // Catherine - Growth Analyst
        insights.push({
          type: 'growth_assessment',
          data: {
            growthPercentile: factorRanking.growthPercentile,
            momentumPercentile: factorRanking.momentumPercentile,
            isHighGrowth: factorRanking.growthPercentile >= 75,
            hasGrowthMomentum: factorRanking.growthPercentile >= 60 && factorRanking.momentumPercentile >= 60
          },
          narrative: factorRanking.growthPercentile >= 70
            ? `Strong growth characteristics (${factorRanking.growthPercentile}th percentile) with solid fundamentals.`
            : factorRanking.growthPercentile <= 30
            ? `Limited growth profile (${factorRanking.growthPercentile}th percentile) - may be a mature business.`
            : `Moderate growth positioning (${factorRanking.growthPercentile}th percentile).`
        });

        if (factorTrend) {
          insights.push({
            type: 'growth_trend',
            data: { growthChange: factorTrend.growthChange },
            narrative: factorTrend.growthChange > 10
              ? `Growth trajectory accelerating - fundamentals improving.`
              : factorTrend.growthChange < -10
              ? `Growth trajectory decelerating - potential slowdown concern.`
              : null
          });
        }
        break;

      case 'contrarian':
        // Diana - Contrarian Analyst
        insights.push({
          type: 'contrarian_assessment',
          data: {
            valuePercentile: factorRanking.valuePercentile,
            momentumPercentile: factorRanking.momentumPercentile,
            qualityPercentile: factorRanking.qualityPercentile,
            isContrarian: factorRanking.valuePercentile >= 60 && factorRanking.momentumPercentile <= 40,
            valueTrap: factorRanking.valuePercentile >= 70 && factorRanking.qualityPercentile <= 30
          },
          narrative: factorRanking.valuePercentile >= 70 && factorRanking.momentumPercentile <= 30
            ? `Classic contrarian setup: cheap (${factorRanking.valuePercentile}th %ile) but unloved (${factorRanking.momentumPercentile}th %ile momentum).`
            : factorRanking.valuePercentile >= 70 && factorRanking.qualityPercentile <= 30
            ? `Potential value trap warning: cheap but poor quality metrics.`
            : null
        });

        if (factorTrend && factorTrend.momentumChange) {
          insights.push({
            type: 'sentiment_shift',
            data: { momentumChange: factorTrend.momentumChange },
            narrative: factorTrend.momentumChange > 15
              ? `Momentum improving significantly - sentiment may be shifting positive.`
              : factorTrend.momentumChange < -15
              ? `Momentum deteriorating - sentiment continuing to worsen.`
              : null
          });
        }
        break;

      case 'quant':
        // Marcus - Quantitative Analyst (gets the full factor breakdown)
        insights.push({
          type: 'full_factor_profile',
          data: {
            value: factorRanking.valuePercentile,
            quality: factorRanking.qualityPercentile,
            momentum: factorRanking.momentumPercentile,
            growth: factorRanking.growthPercentile,
            size: factorRanking.sizePercentile,
            volatility: factorRanking.volatilityPercentile,
            composite: fullContext.factorScores.composite
          },
          narrative: `Factor Profile: V=${factorRanking.valuePercentile} Q=${factorRanking.qualityPercentile} M=${factorRanking.momentumPercentile} G=${factorRanking.growthPercentile} (composite: ${fullContext.factorScores.composite})`
        });

        if (peerComparison) {
          insights.push({
            type: 'sector_positioning',
            data: peerComparison,
            narrative: `Sector rank: #${peerComparison.sectorRank}/${peerComparison.peerCount} in ${peerComparison.sector}`
          });
        }

        if (factorTrend) {
          insights.push({
            type: 'factor_trend',
            data: factorTrend,
            narrative: `Trend: ${factorTrend.overallTrend} (V:${factorTrend.valueChange > 0 ? '+' : ''}${factorTrend.valueChange}, Q:${factorTrend.qualityChange > 0 ? '+' : ''}${factorTrend.qualityChange})`
          });
        }
        break;

      case 'tailrisk':
        // Nikolai - Tail Risk Analyst
        insights.push({
          type: 'fragility_assessment',
          data: {
            volatilityPercentile: factorRanking.volatilityPercentile,
            qualityPercentile: factorRanking.qualityPercentile,
            sizePercentile: factorRanking.sizePercentile,
            isFragile: factorRanking.volatilityPercentile >= 70 && factorRanking.qualityPercentile <= 40,
            isAntifragile: factorRanking.qualityPercentile >= 70 && factorRanking.volatilityPercentile <= 40
          },
          narrative: factorRanking.volatilityPercentile >= 70
            ? `High volatility exposure (${factorRanking.volatilityPercentile}th %ile) - potential fragility concern.`
            : factorRanking.volatilityPercentile <= 30 && factorRanking.qualityPercentile >= 60
            ? `Low volatility with quality characteristics - more anti-fragile profile.`
            : null
        });
        break;

      case 'tech':
        // Elena - Technology Analyst
        insights.push({
          type: 'tech_assessment',
          data: {
            growthPercentile: factorRanking.growthPercentile,
            momentumPercentile: factorRanking.momentumPercentile,
            qualityPercentile: factorRanking.qualityPercentile,
            isHighGrowthTech: factorRanking.growthPercentile >= 70,
            hasTechMomentum: factorRanking.momentumPercentile >= 60
          },
          narrative: factorRanking.growthPercentile >= 70
            ? `Strong growth factor (${factorRanking.growthPercentile}th %ile) - consistent with tech disruptor profile.`
            : `Growth factor at ${factorRanking.growthPercentile}th percentile - evaluate disruption potential beyond factor scores.`
        });
        break;

      default:
        insights.push({
          type: 'general',
          data: factorRanking,
          narrative: fullContext.factorSummary
        });
    }

    return {
      factors: fullContext.factorScores,
      rankings: factorRanking,
      insights: insights.filter(i => i.narrative != null),
      fullContext
    };
  }
}

// Singleton instance
let instance = null;

function getFactorContextProvider() {
  if (!instance) {
    instance = new FactorContextProvider();
  }
  return instance;
}

module.exports = {
  FactorContextProvider,
  getFactorContextProvider
};

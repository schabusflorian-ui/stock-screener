// src/services/trendAnalysis.js
const db = require('../database');

/**
 * Trend Analysis Service
 * 
 * Analyzes historical data to identify:
 * - Improving vs declining companies
 * - Growth trends
 * - Quality trends
 * - Warning signs
 */
class TrendAnalysis {
  constructor() {
    this.db = db.getDatabase();
    console.log('✅ Trend Analysis initialized');
  }
  
  /**
   * Get historical metrics for a company
   */
  getCompanyHistory(symbol, years = 5) {
    const company = this.db.prepare('SELECT id FROM companies WHERE symbol = ?')
      .get(symbol.toUpperCase());
    
    if (!company) return null;
    
    const metrics = this.db.prepare(`
      SELECT 
        fiscal_period,
        roic,
        roe,
        fcf,
        fcf_yield,
        net_margin,
        gross_margin,
        debt_to_equity,
        pe_ratio,
        pb_ratio,
        data_quality_score
      FROM calculated_metrics
      WHERE company_id = ?
      ORDER BY fiscal_period DESC
      LIMIT ?
    `).all(company.id, years);
    
    return metrics.reverse(); // Oldest first for trend calculation
  }
  
  /**
   * Calculate year-over-year change
   */
  calculateYoYChange(current, previous) {
    if (!previous || previous === 0) return null;
    return ((current - previous) / Math.abs(previous)) * 100;
  }
  
  /**
   * Analyze metric trend
   */
  analyzeTrend(values) {
    if (values.length < 2) return { trend: 'insufficient_data' };
    
    const first = values[0];
    const last = values[values.length - 1];
    const change = this.calculateYoYChange(last, first);
    
    // Calculate consistency (low variance = consistent)
    const changes = [];
    for (let i = 1; i < values.length; i++) {
      const yoy = this.calculateYoYChange(values[i], values[i - 1]);
      if (yoy !== null) changes.push(yoy);
    }
    
    const avgChange = changes.reduce((a, b) => a + b, 0) / changes.length;
    const variance = changes.reduce((sum, c) => sum + Math.pow(c - avgChange, 2), 0) / changes.length;
    const consistency = Math.max(0, 100 - variance); // Higher = more consistent
    
    return {
      first,
      last,
      change: change ? change.toFixed(1) : null,
      trend: change > 5 ? 'improving' : change < -5 ? 'declining' : 'stable',
      consistency: consistency.toFixed(0),
      allChanges: changes.map(c => c.toFixed(1))
    };
  }
  
  /**
   * Get comprehensive company trends
   */
  getCompanyTrends(symbol) {
    const history = this.getCompanyHistory(symbol, 5);
    
    if (!history || history.length < 2) {
      return { error: 'Insufficient data' };
    }
    
    const companyInfo = this.db.prepare(`
      SELECT symbol, name, sector FROM companies WHERE symbol = ?
    `).get(symbol.toUpperCase());
    
    return {
      company: companyInfo,
      dataPoints: history.length,
      years: history.map(h => h.fiscal_period),
      
      roic: this.analyzeTrend(history.map(h => h.roic).filter(v => v !== null)),
      roe: this.analyzeTrend(history.map(h => h.roe).filter(v => v !== null)),
      fcfYield: this.analyzeTrend(history.map(h => h.fcf_yield).filter(v => v !== null)),
      netMargin: this.analyzeTrend(history.map(h => h.net_margin).filter(v => v !== null)),
      grossMargin: this.analyzeTrend(history.map(h => h.gross_margin).filter(v => v !== null)),
      debtToEquity: this.analyzeTrend(history.map(h => h.debt_to_equity).filter(v => v !== null)),
      peRatio: this.analyzeTrend(history.map(h => h.pe_ratio).filter(v => v !== null)),
      quality: this.analyzeTrend(history.map(h => h.data_quality_score).filter(v => v !== null))
    };
  }
  
  /**
   * Classify company health based on trends
   */
  classifyCompanyHealth(trends) {
    let score = 0;
    const signals = [];
    
    // Positive signals
    if (trends.roic.trend === 'improving') {
      score += 3;
      signals.push('✅ ROIC improving');
    }
    if (trends.netMargin.trend === 'improving') {
      score += 2;
      signals.push('✅ Margins expanding');
    }
    if (trends.debtToEquity.trend === 'declining') {
      score += 2;
      signals.push('✅ Debt decreasing');
    }
    if (trends.fcfYield.trend === 'improving') {
      score += 2;
      signals.push('✅ FCF yield improving');
    }
    
    // Negative signals
    if (trends.roic.trend === 'declining') {
      score -= 3;
      signals.push('⚠️  ROIC declining');
    }
    if (trends.netMargin.trend === 'declining') {
      score -= 2;
      signals.push('⚠️  Margins compressing');
    }
    if (trends.debtToEquity.trend === 'improving') { // Higher debt is bad
      score -= 2;
      signals.push('⚠️  Debt increasing');
    }
    
    // Classify
    let health;
    if (score >= 5) health = 'IMPROVING';
    else if (score >= 2) health = 'STABLE_POSITIVE';
    else if (score >= -2) health = 'STABLE';
    else if (score >= -5) health = 'DETERIORATING';
    else health = 'DECLINING';
    
    return { health, score, signals };
  }
  
  /**
   * Generate company trend report
   */
  generateCompanyReport(symbol) {
    const trends = this.getCompanyTrends(symbol);
    
    if (trends.error) {
      console.log(`\n❌ ${symbol}: ${trends.error}\n`);
      return;
    }
    
    const health = this.classifyCompanyHealth(trends);
    
    console.log('\n' + '='.repeat(60));
    console.log(`📊 TREND ANALYSIS: ${trends.company.symbol} - ${trends.company.name}`);
    console.log(`   Sector: ${trends.company.sector}`);
    console.log(`   Data: ${trends.dataPoints} years (${trends.years[0]} - ${trends.years[trends.years.length - 1]})`);
    console.log('='.repeat(60));
    
    console.log(`\n🏥 HEALTH: ${health.health} (Score: ${health.score})`);
    health.signals.forEach(s => console.log(`   ${s}`));
    
    console.log('\n📈 KEY METRICS:');
    
    if (trends.roic.first !== undefined) {
      const arrow = trends.roic.trend === 'improving' ? '📈' : 
                    trends.roic.trend === 'declining' ? '📉' : '➡️';
      console.log(`\n   ROIC: ${trends.roic.first.toFixed(1)}% → ${trends.roic.last.toFixed(1)}% (${trends.roic.change > 0 ? '+' : ''}${trends.roic.change}%) ${arrow}`);
      console.log(`   Consistency: ${trends.roic.consistency}%`);
      console.log(`   YoY changes: ${trends.roic.allChanges.join('%, ')}%`);
    }
    
    if (trends.netMargin.first !== undefined) {
      const arrow = trends.netMargin.trend === 'improving' ? '📈' : 
                    trends.netMargin.trend === 'declining' ? '📉' : '➡️';
      console.log(`\n   Net Margin: ${trends.netMargin.first.toFixed(1)}% → ${trends.netMargin.last.toFixed(1)}% (${trends.netMargin.change > 0 ? '+' : ''}${trends.netMargin.change}%) ${arrow}`);
    }
    
    if (trends.fcfYield.first !== undefined) {
      const arrow = trends.fcfYield.trend === 'improving' ? '📈' : 
                    trends.fcfYield.trend === 'declining' ? '📉' : '➡️';
      console.log(`\n   FCF Yield: ${trends.fcfYield.first.toFixed(1)}% → ${trends.fcfYield.last.toFixed(1)}% (${trends.fcfYield.change > 0 ? '+' : ''}${trends.fcfYield.change}%) ${arrow}`);
    }
    
    if (trends.debtToEquity.first !== undefined) {
      const arrow = trends.debtToEquity.trend === 'declining' ? '📈' : 
                    trends.debtToEquity.trend === 'improving' ? '📉' : '➡️';
      console.log(`\n   Debt/Equity: ${trends.debtToEquity.first.toFixed(2)} → ${trends.debtToEquity.last.toFixed(2)} (${trends.debtToEquity.change > 0 ? '+' : ''}${trends.debtToEquity.change}%) ${arrow}`);
    }
    
    console.log('\n' + '='.repeat(60) + '\n');
    
    return { trends, health };
  }
  
  /**
   * Compare multiple companies
   */
  compareCompanies(symbols) {
    console.log('\n' + '█'.repeat(60));
    console.log('📊 COMPARATIVE TREND ANALYSIS');
    console.log('█'.repeat(60));
    
    const results = [];
    
    for (const symbol of symbols) {
      const trends = this.getCompanyTrends(symbol);
      if (!trends.error) {
        const health = this.classifyCompanyHealth(trends);
        results.push({
          symbol: trends.company.symbol,
          name: trends.company.name,
          health: health.health,
          score: health.score,
          roicChange: parseFloat(trends.roic.change) || 0,
          marginChange: parseFloat(trends.netMargin.change) || 0,
          debtChange: parseFloat(trends.debtToEquity.change) || 0
        });
      }
    }
    
    // Sort by health score
    results.sort((a, b) => b.score - a.score);
    
    console.log('\n🏆 RANKED BY TREND QUALITY:\n');
    
    results.forEach((r, i) => {
      const healthEmoji = 
        r.health === 'IMPROVING' ? '🟢' :
        r.health === 'STABLE_POSITIVE' ? '🟡' :
        r.health === 'STABLE' ? '⚪' :
        r.health === 'DETERIORATING' ? '🟠' : '🔴';
      
      console.log(`${i + 1}. ${healthEmoji} ${r.symbol} - ${r.name}`);
      console.log(`   Health: ${r.health} (${r.score})`);
      console.log(`   ROIC: ${r.roicChange > 0 ? '+' : ''}${r.roicChange.toFixed(1)}% | Margin: ${r.marginChange > 0 ? '+' : ''}${r.marginChange.toFixed(1)}% | Debt: ${r.debtChange > 0 ? '+' : ''}${r.debtChange.toFixed(1)}%`);
      console.log('');
    });
    
    console.log('█'.repeat(60) + '\n');
    
    return results;
  }
  
  /**
   * Find best trending stocks
   */
  findBestTrends(minScore = 3) {
    const companies = this.db.prepare('SELECT symbol FROM companies WHERE is_active = 1').all();
    const improving = [];
    
    for (const company of companies) {
      const trends = this.getCompanyTrends(company.symbol);
      if (!trends.error) {
        const health = this.classifyCompanyHealth(trends);
        if (health.score >= minScore) {
          improving.push({
            symbol: trends.company.symbol,
            name: trends.company.name,
            score: health.score,
            signals: health.signals
          });
        }
      }
    }
    
    improving.sort((a, b) => b.score - a.score);
    
    console.log('\n🌟 IMPROVING COMPANIES\n');
    improving.forEach((c, i) => {
      console.log(`${i + 1}. ${c.symbol} - ${c.name} (Score: ${c.score})`);
      c.signals.forEach(s => console.log(`   ${s}`));
      console.log('');
    });
    
    return improving;
  }
}

module.exports = TrendAnalysis;
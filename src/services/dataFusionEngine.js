// src/services/dataFusionEngine.js
// Intelligent Data Fusion Engine for PRISM Reports
//
// This is the "magic blackbox" that thinks like an equity analyst:
// - Weights data sources by reliability and relevance
// - Filters out low-quality signals (garbage in = garbage out)
// - Detects conflicts between sources (valuable information!)
// - Adapts analysis based on company type
// - Produces a confidence-adjusted, analyst-ready data package

class DataFusionEngine {
  constructor() {
    // Source credibility tiers (0-100 scale)
    // Based on: auditability, legal requirements, professional standards
    this.sourceCredibility = {
      // Tier S: Legally mandated, audited
      secFilings: 100,        // 10-K, 10-Q - audited, legally required
      financialStatements: 95, // Derived from SEC filings
      insiderTransactions: 90, // SEC Form 4 - legally required disclosure

      // Tier A: Professional sources
      analystEstimates: 75,   // Professional analysts, but conflicts of interest
      earningsTranscripts: 80, // Direct from management, but biased/optimistic
      wikipedia: 70,          // Curated, but can be outdated
      institutionalHoldings: 65, // 13F filings, 45-day lag

      // Tier B: Quality news sources
      newsBloomberg: 70,
      newsReuters: 70,
      newsWSJ: 65,
      newsFinancialTimes: 65,
      newsGeneral: 50,        // Mixed quality

      // Tier C: Social/retail sentiment (high noise)
      stocktwits: 40,         // Retail sentiment, useful for contrarian
      reddit: 35,             // High noise, but extreme readings matter
      redditWSB: 30,          // Entertainment + research mixed
    };

    // Company type profiles - which signals matter most
    this.companyProfiles = {
      megaCap: {
        // AAPL, MSFT, GOOGL - mature, stable, moat-focused
        weights: {
          fundamentals: 1.2,    // Emphasize
          moatDurability: 1.3,
          capitalAllocation: 1.2,
          socialSentiment: 0.5, // De-emphasize (noise for large caps)
          newsSentiment: 0.7,
          insiderActivity: 0.8, // Routine sales common
        },
        minSocialQuality: 50,   // Higher bar for social signals
      },

      growthStock: {
        // High growth, often unprofitable
        weights: {
          revenueGrowth: 1.4,
          marketSize: 1.3,
          fundamentals: 0.7,    // Profitability less relevant
          socialSentiment: 0.8, // Retail loves growth
          analystEstimates: 1.1,
        },
        minSocialQuality: 30,
      },

      valueStock: {
        // Undervalued, cyclical, turnaround
        weights: {
          fundamentals: 1.3,
          balanceSheet: 1.4,
          fcfYield: 1.3,
          insiderActivity: 1.2, // Insider buying = conviction
          socialSentiment: 0.4, // Retail often wrong on value
        },
        minSocialQuality: 40,
      },

      smallCap: {
        // Less coverage, higher information asymmetry
        weights: {
          insiderActivity: 1.4, // Very important signal
          fundamentals: 1.1,
          socialSentiment: 0.9, // Can move prices
          analystEstimates: 0.7, // Less coverage
        },
        minSocialQuality: 25,
      },

      memeStock: {
        // High retail attention, momentum-driven
        weights: {
          socialSentiment: 1.3, // Actually matters (contrarian)
          shortInterest: 1.4,
          fundamentals: 0.5,    // Often disconnected from price
          technicals: 1.2,
        },
        minSocialQuality: 20,
        invertSocialSignal: true, // Extreme bullish = sell signal
      },
    };

    // Quality thresholds for filtering
    this.qualityThresholds = {
      reddit: {
        minScore: 10,           // Minimum upvotes
        minComments: 3,         // Some engagement
        minContentLength: 100,  // Not just "AAPL 🚀"
        maxAge: 7,              // Days
        excludeSubreddits: ['memes', 'dankmemes'], // Filter noise
        qualitySubreddits: ['investing', 'stocks', 'valueinvesting', 'securityanalysis'],
      },
      stocktwits: {
        minFollowers: 50,       // User has some credibility
        minAccountAge: 30,      // Days - filter bots
        requireSentimentTag: true,
      },
      news: {
        premiumSources: ['Bloomberg', 'Reuters', 'WSJ', 'Financial Times', 'Barrons'],
        qualitySources: ['CNBC', 'MarketWatch', 'Seeking Alpha', 'Yahoo Finance'],
        excludeSources: ['clickbait', 'crypto-spam'],
        maxAge: 30,             // Days for relevance
      },
    };
  }

  /**
   * Main entry point: Fuse all data sources into analyst-ready package
   */
  async fuseData(rawDataPackage) {
    const symbol = rawDataPackage.symbol;
    console.log(`\n🔬 Data Fusion Engine: Processing ${symbol}...`);

    // Step 1: Determine company profile
    const companyProfile = this.classifyCompany(rawDataPackage);
    console.log(`  Company Profile: ${companyProfile.type} (${companyProfile.reason})`);

    // Step 2: Score and filter each data source
    const scoredSources = {
      financials: this.scoreFinancialData(rawDataPackage),
      analyst: this.scoreAnalystData(rawDataPackage),
      insiders: this.scoreInsiderData(rawDataPackage),
      news: this.scoreAndFilterNews(rawDataPackage, companyProfile),
      social: this.scoreAndFilterSocial(rawDataPackage, companyProfile),
      secFiling: this.scoreSECData(rawDataPackage),
      transcripts: this.scoreTranscriptData(rawDataPackage),
    };

    // Step 3: Detect conflicts between sources
    const conflicts = this.detectConflicts(scoredSources, rawDataPackage);
    console.log(`  Conflicts Detected: ${conflicts.length}`);

    // Step 4: Calculate overall data confidence
    const dataConfidence = this.calculateDataConfidence(scoredSources, conflicts);
    console.log(`  Data Confidence: ${dataConfidence.level} (${dataConfidence.score}/100)`);

    // Step 5: Generate analyst briefing
    const analystBriefing = this.generateAnalystBriefing(
      scoredSources,
      conflicts,
      companyProfile,
      rawDataPackage
    );

    // Return fused data package
    return {
      symbol,
      companyProfile,

      // Scored and filtered sources
      sources: scoredSources,

      // Conflict analysis (the gold!)
      conflicts,

      // Overall confidence assessment
      dataConfidence,

      // Pre-formatted analyst briefing for AI
      analystBriefing,

      // Raw data preserved for reference
      rawData: rawDataPackage,

      // Metadata
      fusedAt: new Date().toISOString(),
      engineVersion: '1.0',
    };
  }

  /**
   * Classify company type for adaptive weighting
   */
  classifyCompany(data) {
    const marketCap = data.company.marketCap || 0;
    const revenueGrowth = data.metrics?.latest?.revenue_growth_yoy || 0;
    const peRatio = data.metrics?.latest?.pe_ratio;
    const netMargin = data.metrics?.latest?.net_margin || 0;
    const socialMentions = (data.sentiment?.reddit?.postCount || 0) +
                          (data.sentiment?.stocktwits?.messageCount || 0);

    // Mega-cap: > $200B market cap
    if (marketCap > 200e9) {
      return {
        type: 'megaCap',
        reason: `$${(marketCap/1e9).toFixed(0)}B market cap`,
        profile: this.companyProfiles.megaCap
      };
    }

    // Meme stock detection: High social mentions + disconnected valuation
    if (socialMentions > 100 && (peRatio > 100 || peRatio < 0)) {
      return {
        type: 'memeStock',
        reason: `${socialMentions} social mentions, extreme valuation`,
        profile: this.companyProfiles.memeStock
      };
    }

    // Growth stock: High revenue growth, may be unprofitable
    if (revenueGrowth > 20 || (revenueGrowth > 10 && netMargin < 5)) {
      return {
        type: 'growthStock',
        reason: `${revenueGrowth.toFixed(1)}% revenue growth`,
        profile: this.companyProfiles.growthStock
      };
    }

    // Small cap: < $2B market cap
    if (marketCap < 2e9 && marketCap > 0) {
      return {
        type: 'smallCap',
        reason: `$${(marketCap/1e6).toFixed(0)}M market cap`,
        profile: this.companyProfiles.smallCap
      };
    }

    // Default to value stock analysis
    return {
      type: 'valueStock',
      reason: 'Standard company profile',
      profile: this.companyProfiles.valueStock
    };
  }

  /**
   * Score financial data quality
   */
  scoreFinancialData(data) {
    const result = {
      available: false,
      quality: 0,
      credibility: this.sourceCredibility.financialStatements,
      dataPoints: [],
      warnings: [],
    };

    const financials = data.financials;
    const metrics = data.metrics;

    if (!financials?.latest && !metrics?.latest) {
      result.warnings.push('No financial data available');
      return result;
    }

    result.available = true;
    let qualityScore = 0;

    // Check data completeness
    if (financials?.annual?.length >= 3) {
      qualityScore += 25;
      result.dataPoints.push(`${financials.annual.length} years of annual data`);
    }
    if (financials?.quarterly?.length >= 4) {
      qualityScore += 20;
      result.dataPoints.push(`${financials.quarterly.length} quarters of data`);
    }

    // Check key metrics availability
    const keyMetrics = ['roic', 'roe', 'fcf_margin', 'revenue_growth_yoy'];
    const availableMetrics = keyMetrics.filter(m => metrics?.latest?.[m] != null);
    qualityScore += (availableMetrics.length / keyMetrics.length) * 30;
    result.dataPoints.push(`${availableMetrics.length}/${keyMetrics.length} key metrics`);

    // Check for data freshness
    if (financials?.latest?.fiscal_year) {
      const currentYear = new Date().getFullYear();
      const dataYear = parseInt(financials.latest.fiscal_year);
      if (currentYear - dataYear <= 1) {
        qualityScore += 25;
        result.dataPoints.push('Recent financial data');
      } else {
        result.warnings.push(`Data is ${currentYear - dataYear} years old`);
        qualityScore += 10;
      }
    }

    result.quality = Math.min(100, qualityScore);
    return result;
  }

  /**
   * Score analyst data quality
   */
  scoreAnalystData(data) {
    const result = {
      available: false,
      quality: 0,
      credibility: this.sourceCredibility.analystEstimates,
      dataPoints: [],
      warnings: [],
      signal: null,
    };

    const analyst = data.analyst;
    if (!analyst?.estimates) {
      result.warnings.push('No analyst coverage');
      return result;
    }

    result.available = true;
    const est = analyst.estimates;
    let qualityScore = 0;

    // Number of analysts covering
    const analystCount = est.analyst_count || 0;
    if (analystCount >= 20) {
      qualityScore += 40;
      result.dataPoints.push(`Strong coverage: ${analystCount} analysts`);
    } else if (analystCount >= 10) {
      qualityScore += 25;
      result.dataPoints.push(`Moderate coverage: ${analystCount} analysts`);
    } else if (analystCount >= 3) {
      qualityScore += 15;
      result.dataPoints.push(`Limited coverage: ${analystCount} analysts`);
    } else {
      result.warnings.push(`Very thin coverage: ${analystCount} analysts`);
      qualityScore += 5;
    }

    // Price target spread (tighter = more consensus)
    if (est.target_high && est.target_low && est.target_mean) {
      const spread = (est.target_high - est.target_low) / est.target_mean;
      if (spread < 0.3) {
        qualityScore += 30;
        result.dataPoints.push('Tight price target consensus');
      } else if (spread < 0.5) {
        qualityScore += 20;
        result.dataPoints.push('Moderate price target spread');
      } else {
        qualityScore += 10;
        result.warnings.push(`Wide analyst disagreement: ${(spread*100).toFixed(0)}% spread`);
      }
    }

    // Recommendation consensus strength
    if (est.buy_percent != null) {
      if (est.buy_percent >= 80) {
        result.signal = { direction: 'bullish', strength: 'strong', reason: `${est.buy_percent}% buy ratings` };
        qualityScore += 30;
      } else if (est.buy_percent >= 60) {
        result.signal = { direction: 'bullish', strength: 'moderate', reason: `${est.buy_percent}% buy ratings` };
        qualityScore += 25;
      } else if (est.buy_percent >= 40) {
        result.signal = { direction: 'neutral', strength: 'weak', reason: 'Mixed analyst sentiment' };
        qualityScore += 20;
      } else {
        result.signal = { direction: 'bearish', strength: 'moderate', reason: `Only ${est.buy_percent}% buy ratings` };
        qualityScore += 20;
      }
    }

    result.quality = Math.min(100, qualityScore);
    return result;
  }

  /**
   * Score insider activity - one of the most valuable signals
   */
  scoreInsiderData(data) {
    const result = {
      available: false,
      quality: 0,
      credibility: this.sourceCredibility.insiderTransactions,
      dataPoints: [],
      warnings: [],
      signal: null,
    };

    const insiders = data.insiders;
    if (!insiders?.recentTransactions?.length) {
      result.warnings.push('No recent insider transactions');
      return result;
    }

    result.available = true;
    const txns = insiders.recentTransactions;
    const netActivity = insiders.netActivity;
    let qualityScore = 50; // Base score for having data

    // Analyze transaction patterns
    const purchases = txns.filter(t =>
      t.transaction_code === 'P' || t.transaction_type === 'Purchase'
    );
    const sales = txns.filter(t =>
      t.transaction_code === 'S' || t.transaction_type === 'Sale'
    );

    result.dataPoints.push(`${purchases.length} purchases, ${sales.length} sales (12 months)`);

    // Cluster buying is a strong signal
    if (purchases.length >= 3 && netActivity?.netValue > 0) {
      result.signal = {
        direction: 'bullish',
        strength: 'strong',
        reason: `${purchases.length} insider purchases totaling $${this.formatCurrency(netActivity.totalBuys)}`
      };
      qualityScore += 40;
      result.dataPoints.push('Cluster insider buying detected');
    }
    // Heavy selling could be routine or concerning
    else if (sales.length >= 5 && netActivity?.netValue < -1000000) {
      // Check if it's C-suite selling (more significant)
      const execSales = sales.filter(s =>
        s.insider_title?.toLowerCase().includes('ceo') ||
        s.insider_title?.toLowerCase().includes('cfo') ||
        s.insider_title?.toLowerCase().includes('president')
      );

      if (execSales.length >= 2) {
        result.signal = {
          direction: 'bearish',
          strength: 'moderate',
          reason: `Executive selling: $${this.formatCurrency(Math.abs(netActivity.netValue))} net sales`
        };
        result.warnings.push('Significant executive selling');
        qualityScore += 30;
      } else {
        result.signal = {
          direction: 'neutral',
          strength: 'weak',
          reason: 'Routine insider selling (likely compensation-related)'
        };
        qualityScore += 20;
      }
    } else {
      result.signal = { direction: 'neutral', strength: 'weak', reason: 'Mixed/routine insider activity' };
      qualityScore += 20;
    }

    result.quality = Math.min(100, qualityScore);
    return result;
  }

  /**
   * Score and filter news - remove low quality sources
   */
  scoreAndFilterNews(data, companyProfile) {
    const result = {
      available: false,
      quality: 0,
      credibility: this.sourceCredibility.newsGeneral,
      filteredArticles: [],
      themes: [],
      sentiment: null,
      dataPoints: [],
      warnings: [],
      discarded: 0,
    };

    const news = data.news;
    if (!news?.recent?.length) {
      result.warnings.push('No recent news');
      return result;
    }

    const thresholds = this.qualityThresholds.news;
    const filtered = [];
    let discardedCount = 0;

    for (const article of news.recent) {
      const source = article.source?.toLowerCase() || '';

      // Check if premium source
      const isPremium = thresholds.premiumSources.some(s =>
        source.includes(s.toLowerCase())
      );
      const isQuality = thresholds.qualitySources.some(s =>
        source.includes(s.toLowerCase())
      );

      // Filter out excluded sources
      const isExcluded = thresholds.excludeSources.some(s =>
        source.includes(s.toLowerCase())
      );

      if (isExcluded) {
        discardedCount++;
        continue;
      }

      // Check age
      const articleAge = this.daysSince(article.published_at);
      if (articleAge > thresholds.maxAge) {
        discardedCount++;
        continue;
      }

      // Score the article
      let articleScore = 50;
      if (isPremium) articleScore = 90;
      else if (isQuality) articleScore = 70;

      // Recency bonus
      if (articleAge <= 3) articleScore += 10;
      else if (articleAge <= 7) articleScore += 5;

      filtered.push({
        ...article,
        qualityScore: articleScore,
        isPremium,
        ageInDays: articleAge,
      });
    }

    result.filteredArticles = filtered.sort((a, b) => b.qualityScore - a.qualityScore);
    result.discarded = discardedCount;
    result.available = filtered.length > 0;

    // Calculate quality-weighted sentiment
    if (filtered.length > 0) {
      const premiumArticles = filtered.filter(a => a.isPremium);
      const qualityArticles = filtered.filter(a => a.qualityScore >= 70);

      // Weight sentiment by article quality
      let weightedSentiment = 0;
      let totalWeight = 0;

      for (const article of filtered) {
        if (article.sentiment_score != null) {
          const weight = article.qualityScore / 100;
          weightedSentiment += article.sentiment_score * weight;
          totalWeight += weight;
        }
      }

      if (totalWeight > 0) {
        const avgSentiment = weightedSentiment / totalWeight;
        result.sentiment = {
          score: avgSentiment,
          label: avgSentiment > 0.1 ? 'positive' : avgSentiment < -0.1 ? 'negative' : 'neutral',
          confidence: premiumArticles.length >= 3 ? 'high' : qualityArticles.length >= 5 ? 'medium' : 'low',
        };
      }

      // Extract themes from quality articles only
      if (news.themes) {
        result.themes = news.themes;
      }

      result.dataPoints.push(`${filtered.length} quality articles (${discardedCount} filtered out)`);
      result.dataPoints.push(`${premiumArticles.length} premium source articles`);

      // Update credibility based on source quality
      if (premiumArticles.length >= 5) {
        result.credibility = 75;
      } else if (qualityArticles.length >= 10) {
        result.credibility = 65;
      }
    }

    result.quality = Math.min(100, (filtered.length / Math.max(1, news.recent.length)) * 100);
    return result;
  }

  /**
   * Score and filter social sentiment - aggressive noise filtering
   */
  scoreAndFilterSocial(data, companyProfile) {
    const result = {
      available: false,
      quality: 0,
      credibility: 35, // Default low credibility
      reddit: null,
      stocktwits: null,
      combinedSignal: null,
      dataPoints: [],
      warnings: [],
      discarded: { reddit: 0, stocktwits: 0 },
    };

    const sentiment = data.sentiment;
    const profile = companyProfile.profile;
    const minQuality = profile.minSocialQuality || 30;

    // Process Reddit
    if (sentiment?.reddit?.topPosts?.length) {
      const redditThresholds = this.qualityThresholds.reddit;
      const posts = sentiment.reddit.topPosts;
      const filtered = [];
      let discarded = 0;

      for (const post of posts) {
        // Quality filters
        if (post.score < redditThresholds.minScore) { discarded++; continue; }
        if ((post.num_comments || 0) < redditThresholds.minComments) { discarded++; continue; }
        if ((post.body?.length || 0) < redditThresholds.minContentLength &&
            (post.title?.length || 0) < 50) { discarded++; continue; }

        // Subreddit quality check
        const subreddit = post.subreddit?.toLowerCase() || '';
        const isQualitySubreddit = redditThresholds.qualitySubreddits.some(s =>
          subreddit.includes(s)
        );
        const isExcluded = redditThresholds.excludeSubreddits.some(s =>
          subreddit.includes(s)
        );

        if (isExcluded) { discarded++; continue; }

        filtered.push({
          ...post,
          isQualitySubreddit,
          qualityScore: isQualitySubreddit ? 70 : 40,
        });
      }

      result.discarded.reddit = discarded;

      if (filtered.length > 0) {
        // Calculate quality-weighted sentiment
        const qualityPosts = filtered.filter(p => p.isQualitySubreddit);
        let avgSentiment = 0;
        let postCount = 0;

        for (const post of filtered) {
          if (post.sentiment_score != null) {
            const weight = post.isQualitySubreddit ? 2 : 1;
            avgSentiment += post.sentiment_score * weight;
            postCount += weight;
          }
        }

        if (postCount > 0) {
          avgSentiment /= postCount;
        }

        result.reddit = {
          postCount: filtered.length,
          qualityPostCount: qualityPosts.length,
          avgSentiment,
          sentimentLabel: avgSentiment > 0.15 ? 'bullish' : avgSentiment < -0.15 ? 'bearish' : 'neutral',
          topSubreddits: this.getTopSubreddits(filtered),
        };

        result.dataPoints.push(`Reddit: ${filtered.length} quality posts (${discarded} filtered)`);
      }
    }

    // Process StockTwits
    if (sentiment?.stocktwits) {
      const st = sentiment.stocktwits;

      if (st.messageCount > 0) {
        const bullishRatio = st.bullishCount / st.messageCount;
        const bearishRatio = st.bearishCount / st.messageCount;

        result.stocktwits = {
          messageCount: st.messageCount,
          bullishRatio,
          bearishRatio,
          sentiment: bullishRatio > 0.6 ? 'bullish' : bearishRatio > 0.6 ? 'bearish' : 'mixed',
        };

        result.dataPoints.push(`StockTwits: ${st.messageCount} messages, ${(bullishRatio*100).toFixed(0)}% bullish`);
      }
    }

    // Generate combined social signal
    if (result.reddit || result.stocktwits) {
      result.available = true;

      // Combine signals with appropriate skepticism
      let combinedSentiment = 0;
      let sources = 0;

      if (result.reddit && result.reddit.qualityPostCount >= 3) {
        combinedSentiment += result.reddit.avgSentiment;
        sources++;
      }

      if (result.stocktwits && result.stocktwits.messageCount >= 20) {
        const stScore = result.stocktwits.bullishRatio - result.stocktwits.bearishRatio;
        combinedSentiment += stScore;
        sources++;
      }

      if (sources > 0) {
        combinedSentiment /= sources;

        // For meme stocks, invert extreme signals (contrarian)
        if (profile.invertSocialSignal && Math.abs(combinedSentiment) > 0.3) {
          result.combinedSignal = {
            direction: combinedSentiment > 0 ? 'bearish' : 'bullish', // Inverted!
            strength: 'contrarian',
            reason: `Extreme retail sentiment (${combinedSentiment > 0 ? 'bullish' : 'bearish'}) - contrarian signal`,
            rawSentiment: combinedSentiment,
          };
          result.warnings.push('Contrarian signal: extreme retail sentiment often marks tops/bottoms');
        } else {
          result.combinedSignal = {
            direction: combinedSentiment > 0.1 ? 'bullish' : combinedSentiment < -0.1 ? 'bearish' : 'neutral',
            strength: Math.abs(combinedSentiment) > 0.2 ? 'moderate' : 'weak',
            reason: `Social sentiment: ${(combinedSentiment * 100).toFixed(0)}%`,
            rawSentiment: combinedSentiment,
          };
        }
      }

      // Quality score based on signal reliability
      result.quality = Math.min(100,
        (result.reddit?.qualityPostCount || 0) * 10 +
        (result.stocktwits?.messageCount || 0) / 2
      );

      // Adjust credibility based on data quality
      if (result.reddit?.qualityPostCount >= 5 && result.stocktwits?.messageCount >= 30) {
        result.credibility = 50; // Higher credibility with good data
      }
    }

    return result;
  }

  /**
   * Score SEC filing data
   */
  scoreSECData(data) {
    const result = {
      available: false,
      quality: 0,
      credibility: this.sourceCredibility.secFilings,
      dataPoints: [],
      warnings: [],
      keyInsights: [],
    };

    const sec = data.secFiling;
    if (!sec?.latest10K && !sec?.businessDescription) {
      result.warnings.push('No SEC filing data available');
      return result;
    }

    result.available = true;
    let qualityScore = 0;

    if (sec.businessDescription) {
      qualityScore += 30;
      result.dataPoints.push('Business description available');
    }
    if (sec.riskFactors) {
      qualityScore += 25;
      result.dataPoints.push('Risk factors available');
    }
    if (sec.mdaDiscussion) {
      qualityScore += 25;
      result.dataPoints.push('MD&A discussion available');
    }
    if (sec.competitionSection) {
      qualityScore += 20;
      result.dataPoints.push('Competition analysis available');
    }

    result.quality = Math.min(100, qualityScore);
    return result;
  }

  /**
   * Score earnings transcript data
   */
  scoreTranscriptData(data) {
    const result = {
      available: false,
      quality: 0,
      credibility: this.sourceCredibility.earningsTranscripts,
      dataPoints: [],
      warnings: [],
      managementTone: null,
    };

    const transcripts = data.transcripts;
    if (!transcripts?.available) {
      result.warnings.push('No earnings transcript data');
      return result;
    }

    result.available = true;
    const summary = transcripts.summary;
    let qualityScore = 50; // Base for having transcripts

    if (summary?.transcriptsAvailable >= 4) {
      qualityScore += 30;
      result.dataPoints.push(`${summary.transcriptsAvailable} quarters of transcripts`);
    } else if (summary?.transcriptsAvailable >= 2) {
      qualityScore += 15;
    }

    // Management tone analysis
    if (summary?.latestCall) {
      result.managementTone = {
        tone: summary.latestCall.tone,
        sentimentScore: summary.latestCall.sentimentScore,
        trend: summary.toneTrend,
      };
      qualityScore += 20;
      result.dataPoints.push(`Management tone: ${summary.latestCall.tone}`);
    }

    if (transcripts.keyQuotes?.length > 0) {
      result.dataPoints.push(`${transcripts.keyQuotes.length} key quotes extracted`);
    }

    result.quality = Math.min(100, qualityScore);
    return result;
  }

  /**
   * Detect conflicts between data sources - this is GOLD
   */
  detectConflicts(sources, rawData) {
    const conflicts = [];

    // Conflict 1: Insider selling + Bullish analyst sentiment
    if (sources.insiders?.signal?.direction === 'bearish' &&
        sources.analyst?.signal?.direction === 'bullish') {
      conflicts.push({
        type: 'INSIDER_VS_ANALYST',
        severity: 'high',
        description: 'Insiders selling while analysts remain bullish',
        interpretation: 'Management may have visibility into challenges not yet reflected in analyst models. Warrants caution.',
        sources: ['insiders', 'analyst'],
        recommendation: 'INVESTIGATE - What do insiders know?',
      });
    }

    // Conflict 2: Strong fundamentals + Weak price performance
    const priceChange = rawData.prices?.performance?.oneMonth || 0;
    const roic = rawData.metrics?.latest?.roic || 0;
    if (roic > 15 && priceChange < -10) {
      conflicts.push({
        type: 'FUNDAMENTALS_VS_PRICE',
        severity: 'medium',
        description: `Strong ROIC (${roic.toFixed(1)}%) but stock down ${Math.abs(priceChange).toFixed(1)}%`,
        interpretation: 'Market may be pricing in future deterioration, or this could be a value opportunity.',
        sources: ['financials', 'prices'],
        recommendation: 'DIG DEEPER - Is this value or value trap?',
      });
    }

    // Conflict 3: Social bullish + News bearish
    if (sources.social?.combinedSignal?.direction === 'bullish' &&
        sources.news?.sentiment?.label === 'negative') {
      conflicts.push({
        type: 'SOCIAL_VS_NEWS',
        severity: 'medium',
        description: 'Retail sentiment bullish while news coverage negative',
        interpretation: 'Retail may be catching a falling knife, or institutional selling creating opportunity.',
        sources: ['social', 'news'],
        recommendation: 'BE SKEPTICAL - Retail often wrong at extremes',
      });
    }

    // Conflict 4: Social bearish + News bullish (potential opportunity)
    if (sources.social?.combinedSignal?.direction === 'bearish' &&
        sources.news?.sentiment?.label === 'positive') {
      conflicts.push({
        type: 'CONTRARIAN_OPPORTUNITY',
        severity: 'low',
        description: 'Retail bearish while news positive',
        interpretation: 'Could indicate retail capitulation at a bottom. Worth investigating.',
        sources: ['social', 'news'],
        recommendation: 'POTENTIAL OPPORTUNITY - Retail capitulation?',
      });
    }

    // Conflict 5: Management optimistic + Guidance cautious
    if (sources.transcripts?.managementTone?.tone === 'optimistic' &&
        rawData.transcripts?.guidanceAnalysis?.uncertaintyLevel > 15) {
      conflicts.push({
        type: 'TONE_VS_GUIDANCE',
        severity: 'medium',
        description: 'Optimistic management tone but high uncertainty language in guidance',
        interpretation: 'Management may be painting a rosier picture than fundamentals support.',
        sources: ['transcripts'],
        recommendation: 'READ BETWEEN THE LINES - Focus on specific guidance, not tone',
      });
    }

    return conflicts;
  }

  /**
   * Calculate overall data confidence
   */
  calculateDataConfidence(sources, conflicts) {
    let totalScore = 0;
    let totalWeight = 0;
    const components = [];

    // Weight sources by credibility
    const sourceWeights = {
      financials: 3,
      secFiling: 2.5,
      insiders: 2,
      analyst: 1.5,
      transcripts: 1.5,
      news: 1,
      social: 0.5,
    };

    for (const [name, source] of Object.entries(sources)) {
      if (source?.available) {
        const weight = sourceWeights[name] || 1;
        const score = (source.quality * source.credibility) / 100;
        totalScore += score * weight;
        totalWeight += weight;

        components.push({
          source: name,
          quality: source.quality,
          credibility: source.credibility,
          contribution: score * weight,
        });
      }
    }

    const baseScore = totalWeight > 0 ? totalScore / totalWeight : 0;

    // Reduce confidence if there are high-severity conflicts
    const highSeverityConflicts = conflicts.filter(c => c.severity === 'high').length;
    const conflictPenalty = highSeverityConflicts * 10;

    const finalScore = Math.max(0, Math.min(100, baseScore - conflictPenalty));

    return {
      score: Math.round(finalScore),
      level: finalScore >= 70 ? 'HIGH' : finalScore >= 50 ? 'MEDIUM' : 'LOW',
      components,
      conflictPenalty,
      recommendation: finalScore < 50
        ? 'Limited data quality - conclusions should be viewed with skepticism'
        : finalScore < 70
        ? 'Moderate data quality - some uncertainty in analysis'
        : 'Strong data foundation - analysis well-supported',
    };
  }

  /**
   * Generate pre-formatted analyst briefing for AI consumption
   */
  generateAnalystBriefing(sources, conflicts, companyProfile, rawData) {
    const briefing = {
      // Executive context
      companyContext: this.formatCompanyContext(rawData, companyProfile),

      // Key signals (ranked by reliability)
      keySignals: this.extractKeySignals(sources, conflicts),

      // Conflict summary (the interesting stuff)
      conflictSummary: this.formatConflictSummary(conflicts),

      // Data gaps (what we DON'T know)
      dataGaps: this.identifyDataGaps(sources),

      // Source-by-source summaries for deep dive
      sourceSummaries: {
        fundamentals: this.formatFundamentalsSummary(sources, rawData),
        marketSignals: this.formatMarketSignalsSummary(sources),
        qualitative: this.formatQualitativeSummary(sources, rawData),
        alternative: this.formatAlternativeSummary(sources),
      },
    };

    return briefing;
  }

  formatCompanyContext(rawData, companyProfile) {
    return {
      name: rawData.company.name,
      symbol: rawData.symbol,
      sector: rawData.company.sector,
      industry: rawData.company.industry,
      marketCap: rawData.company.marketCap,
      profileType: companyProfile.type,
      profileReason: companyProfile.reason,
      analysisApproach: this.getAnalysisApproach(companyProfile.type),
    };
  }

  getAnalysisApproach(profileType) {
    const approaches = {
      megaCap: 'Focus on moat durability, capital allocation efficiency, and long-term competitive position. De-emphasize short-term sentiment.',
      growthStock: 'Emphasize revenue growth trajectory, market opportunity (TAM), and path to profitability. Accept higher valuation multiples if growth justifies.',
      valueStock: 'Focus on balance sheet strength, free cash flow generation, and margin of safety. Be skeptical of turnaround narratives.',
      smallCap: 'Pay close attention to insider activity and management quality. Limited analyst coverage means more information asymmetry.',
      memeStock: 'Treat retail sentiment as contrarian indicator. Focus on fundamentals disconnection and short interest. High risk.',
    };
    return approaches[profileType] || approaches.valueStock;
  }

  extractKeySignals(sources, conflicts) {
    const signals = [];

    // Add signals in order of reliability
    if (sources.financials?.available) {
      signals.push({
        source: 'Fundamentals',
        credibility: 'HIGH',
        signal: `Quality: ${sources.financials.quality}/100`,
        details: sources.financials.dataPoints.join('; '),
      });
    }

    if (sources.insiders?.signal) {
      signals.push({
        source: 'Insider Activity',
        credibility: 'HIGH',
        signal: `${sources.insiders.signal.direction.toUpperCase()} (${sources.insiders.signal.strength})`,
        details: sources.insiders.signal.reason,
      });
    }

    if (sources.analyst?.signal) {
      signals.push({
        source: 'Analyst Consensus',
        credibility: 'MEDIUM-HIGH',
        signal: `${sources.analyst.signal.direction.toUpperCase()} (${sources.analyst.signal.strength})`,
        details: sources.analyst.signal.reason,
      });
    }

    if (sources.news?.sentiment) {
      signals.push({
        source: 'News Sentiment',
        credibility: sources.news.sentiment.confidence === 'high' ? 'MEDIUM' : 'LOW-MEDIUM',
        signal: sources.news.sentiment.label.toUpperCase(),
        details: `Based on ${sources.news.filteredArticles?.length || 0} quality articles`,
      });
    }

    if (sources.social?.combinedSignal) {
      signals.push({
        source: 'Social Sentiment',
        credibility: 'LOW',
        signal: sources.social.combinedSignal.direction.toUpperCase(),
        details: sources.social.combinedSignal.reason,
        warning: 'Use with caution - high noise, best as contrarian indicator',
      });
    }

    return signals;
  }

  formatConflictSummary(conflicts) {
    if (conflicts.length === 0) {
      return {
        hasConflicts: false,
        summary: 'No significant conflicts detected between data sources',
        conflicts: [],
      };
    }

    return {
      hasConflicts: true,
      summary: `${conflicts.length} conflict(s) detected - these warrant investigation`,
      conflicts: conflicts.map(c => ({
        type: c.type,
        severity: c.severity,
        description: c.description,
        interpretation: c.interpretation,
        recommendation: c.recommendation,
      })),
    };
  }

  identifyDataGaps(sources) {
    const gaps = [];

    if (!sources.secFiling?.available) {
      gaps.push({
        gap: 'SEC Filing Data',
        impact: 'HIGH',
        description: 'No 10-K filing data - cannot assess business risks, competition, or management discussion',
      });
    }

    if (!sources.transcripts?.available) {
      gaps.push({
        gap: 'Earnings Transcripts',
        impact: 'MEDIUM',
        description: 'No earnings call data - cannot assess management tone or guidance quality',
      });
    }

    if (!sources.analyst?.available) {
      gaps.push({
        gap: 'Analyst Coverage',
        impact: 'MEDIUM',
        description: 'No analyst estimates - limited visibility into market expectations',
      });
    }

    if (!sources.insiders?.available) {
      gaps.push({
        gap: 'Insider Activity',
        impact: 'LOW-MEDIUM',
        description: 'No recent insider transactions - cannot gauge management confidence',
      });
    }

    return gaps;
  }

  formatFundamentalsSummary(sources, rawData) {
    const metrics = rawData.metrics?.latest || {};
    const financials = rawData.financials?.latest || {};

    return {
      available: sources.financials?.available || false,
      quality: sources.financials?.quality || 0,
      highlights: [
        metrics.roic != null ? `ROIC: ${metrics.roic.toFixed(1)}%` : null,
        metrics.roe != null ? `ROE: ${metrics.roe.toFixed(1)}%` : null,
        metrics.fcf_margin != null ? `FCF Margin: ${metrics.fcf_margin.toFixed(1)}%` : null,
        metrics.revenue_growth_yoy != null ? `Revenue Growth: ${metrics.revenue_growth_yoy.toFixed(1)}%` : null,
        metrics.debt_to_equity != null ? `D/E: ${metrics.debt_to_equity.toFixed(2)}x` : null,
      ].filter(Boolean),
      warnings: sources.financials?.warnings || [],
    };
  }

  formatMarketSignalsSummary(sources) {
    return {
      analyst: sources.analyst?.signal || null,
      insiders: sources.insiders?.signal || null,
      analystDetails: sources.analyst?.dataPoints || [],
      insiderDetails: sources.insiders?.dataPoints || [],
    };
  }

  formatQualitativeSummary(sources, rawData) {
    return {
      secFilingAvailable: sources.secFiling?.available || false,
      transcriptsAvailable: sources.transcripts?.available || false,
      managementTone: sources.transcripts?.managementTone || null,
      newsThemes: sources.news?.themes || [],
      newsSentiment: sources.news?.sentiment || null,
    };
  }

  formatAlternativeSummary(sources) {
    return {
      redditSentiment: sources.social?.reddit || null,
      stocktwitsSentiment: sources.social?.stocktwits || null,
      combinedSocialSignal: sources.social?.combinedSignal || null,
      warnings: sources.social?.warnings || [],
      discarded: sources.social?.discarded || {},
    };
  }

  // Utility methods
  formatCurrency(value) {
    if (!value) return '0';
    if (value >= 1e9) return `${(value/1e9).toFixed(1)}B`;
    if (value >= 1e6) return `${(value/1e6).toFixed(1)}M`;
    if (value >= 1e3) return `${(value/1e3).toFixed(1)}K`;
    return value.toFixed(0);
  }

  daysSince(dateStr) {
    if (!dateStr) return 999;
    const date = new Date(dateStr);
    const now = new Date();
    return Math.floor((now - date) / (1000 * 60 * 60 * 24));
  }

  getTopSubreddits(posts) {
    const counts = {};
    for (const post of posts) {
      const sub = post.subreddit || 'unknown';
      counts[sub] = (counts[sub] || 0) + 1;
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));
  }
}

module.exports = DataFusionEngine;

// Test if run directly
if (require.main === module) {
  console.log('DataFusionEngine loaded successfully');
  console.log('Use with PRISMDataCollector to create analyst-ready data packages');
}

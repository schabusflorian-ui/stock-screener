// tests/stress/utils/conversationGrader.js
// Conversation Quality Grader for AI Analyst Chat

/**
 * Analyst-specific keywords that should appear in responses
 * Higher presence = better persona adherence
 */
const ANALYST_KEYWORDS = {
  value: {
    core: ['moat', 'intrinsic value', 'margin of safety', 'capital allocation', 'durable', 'competitive advantage'],
    influences: ['buffett', 'munger', 'graham', 'klarman', 'marks'],
    frameworks: ['circle of competence', 'wonderful company', 'fair price', 'owner earnings', 'return on equity']
  },
  growth: {
    core: ['tam', 'total addressable market', 'revenue growth', 'market opportunity', 'disruptive', 'scalable', 'network effects'],
    influences: ['fisher', 'lynch', 'gurley', 'wood', 'cathie'],
    frameworks: ['peg ratio', 'ten-bagger', 'growth at reasonable price', 'path to profitability', 'market penetration']
  },
  contrarian: {
    core: ['sentiment', 'beaten-down', 'catalyst', 'contrarian', 'pessimism', 'asymmetric', 'value trap'],
    influences: ['marks', 'burry', 'dreman', 'templeton'],
    frameworks: ['second-level thinking', 'cycle', 'mean reversion', 'sentiment extreme', 'short interest']
  },
  quant: {
    core: ['factor', 'alpha', 'sharpe', 'correlation', 'systematic', 'quantitative', 'position sizing'],
    influences: ['oshaughnessy', 'asness', 'aqr', 'two sigma', 'renaissance'],
    frameworks: ['momentum', 'value factor', 'quality factor', 'volatility', 'risk-adjusted', 'information ratio']
  },
  tailrisk: {
    core: ['antifragile', 'convexity', 'black swan', 'tail risk', 'optionality', 'barbell', 'fragile'],
    influences: ['taleb', 'spitznagel', 'universa'],
    frameworks: ['fat tails', 'negative convexity', 'skin in the game', 'via negativa', 'lindy effect']
  },
  tech: {
    core: ['disruption', 'platform', 'flywheel', 'winner-take-all', 'defensibility', 'network', 'moat'],
    influences: ['a16z', 'andreessen', 'horowitz', 'ark', 'benchmark'],
    frameworks: ['product-market fit', 'unit economics', 'saas metrics', 'ltv', 'cac', 'cohort analysis']
  }
};

/**
 * Fluency and naturalness indicators
 */
const FLUENCY_INDICATORS = {
  positive: [
    // Conversational markers
    /\b(I think|I believe|In my view|Looking at|Based on|Considering)\b/gi,
    // Structured transitions
    /\b(First|Second|Additionally|Furthermore|However|That said|On the other hand)\b/gi,
    // Explanatory phrases
    /\b(This means|In other words|For example|Specifically|To put it simply)\b/gi,
    // Engagement markers
    /\b(Let me|Allow me|I'd recommend|I suggest|You might consider)\b/gi
  ],
  negative: [
    // Robotic/templated phrases
    /\b(As an AI|I cannot|I don't have access|error|undefined|null)\b/gi,
    // Incomplete sentences
    /\.\.\.$|\.\.$/,
    // Very short responses (under 50 chars)
  ]
};

class ConversationGrader {
  constructor() {
    this.weights = {
      personaAdherence: 0.30,
      analystKnowledge: 0.25,
      specificity: 0.20,
      fluency: 0.15,
      frameworkDepth: 0.10
    };
  }

  /**
   * Grade how well the response reflects the analyst's persona
   * @param {string} analystId - The analyst ID (value, growth, quant, etc.)
   * @param {string} response - The response content
   * @returns {number} - Score 0-100
   */
  scorePersonaAdherence(analystId, response) {
    const keywords = ANALYST_KEYWORDS[analystId];
    if (!keywords) return 50; // Unknown analyst, neutral score

    const responseLower = response.toLowerCase();
    let score = 0;
    let maxScore = 0;

    // Check core keywords (worth more)
    for (const keyword of keywords.core) {
      maxScore += 15;
      if (responseLower.includes(keyword.toLowerCase())) {
        score += 15;
      }
    }

    // Check framework keywords
    for (const keyword of keywords.frameworks) {
      maxScore += 10;
      if (responseLower.includes(keyword.toLowerCase())) {
        score += 10;
      }
    }

    // Normalize to 0-100
    const normalizedScore = maxScore > 0 ? (score / maxScore) * 100 : 50;

    // Bonus for multiple keyword categories
    const coreMatches = keywords.core.filter(k => responseLower.includes(k.toLowerCase())).length;
    const frameworkMatches = keywords.frameworks.filter(k => responseLower.includes(k.toLowerCase())).length;

    if (coreMatches >= 2 && frameworkMatches >= 1) {
      return Math.min(100, normalizedScore + 15);
    }

    return Math.round(normalizedScore);
  }

  /**
   * Grade how well the response references the analyst's influences
   * @param {string} analystId - The analyst ID
   * @param {string} response - The response content
   * @returns {number} - Score 0-100
   */
  scoreAnalystKnowledge(analystId, response) {
    const keywords = ANALYST_KEYWORDS[analystId];
    if (!keywords) return 50;

    const responseLower = response.toLowerCase();
    let influenceMatches = 0;

    for (const influence of keywords.influences) {
      if (responseLower.includes(influence.toLowerCase())) {
        influenceMatches++;
      }
    }

    // Score based on influence mentions
    if (influenceMatches >= 3) return 100;
    if (influenceMatches >= 2) return 85;
    if (influenceMatches >= 1) return 70;

    // Check for implicit knowledge (concepts without naming)
    const conceptMatches = keywords.frameworks.filter(k =>
      responseLower.includes(k.toLowerCase())
    ).length;

    if (conceptMatches >= 2) return 60;
    if (conceptMatches >= 1) return 45;

    return 30; // No relevant knowledge demonstrated
  }

  /**
   * Grade how well the response addresses the specific question
   * @param {string} question - The user's question
   * @param {string} response - The response content
   * @returns {number} - Score 0-100
   */
  scoreSpecificity(question, response) {
    const questionLower = question.toLowerCase();
    const responseLower = response.toLowerCase();

    let score = 50; // Base score

    // Extract key terms from question
    const questionWords = questionLower
      .replace(/[?.,!]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 3);

    // Check if response addresses key terms
    let addressedTerms = 0;
    for (const word of questionWords) {
      if (responseLower.includes(word)) {
        addressedTerms++;
      }
    }

    const termRatio = questionWords.length > 0
      ? addressedTerms / questionWords.length
      : 0;

    score += termRatio * 30;

    // Bonus for substantive response length
    if (response.length > 200) score += 10;
    if (response.length > 400) score += 10;

    // Check for direct answer indicators
    if (/\b(yes|no|the answer is|specifically|in this case)\b/i.test(response)) {
      score += 10;
    }

    return Math.min(100, Math.round(score));
  }

  /**
   * Grade the fluency and naturalness of the response
   * @param {string} response - The response content
   * @returns {number} - Score 0-100
   */
  scoreFluency(response) {
    let score = 60; // Base score

    // Check for positive fluency indicators
    for (const pattern of FLUENCY_INDICATORS.positive) {
      const matches = response.match(pattern);
      if (matches) {
        score += Math.min(10, matches.length * 3);
      }
    }

    // Penalize negative indicators
    for (const pattern of FLUENCY_INDICATORS.negative) {
      if (pattern.test(response)) {
        score -= 15;
      }
    }

    // Penalize very short responses
    if (response.length < 50) {
      score -= 20;
    } else if (response.length < 100) {
      score -= 10;
    }

    // Check for good sentence structure (periods followed by spaces and capitals)
    const sentences = response.split(/[.!?]+/).filter(s => s.trim().length > 0);
    if (sentences.length >= 3) {
      score += 10;
    }

    // Check for paragraph structure
    if (response.includes('\n\n') || response.split(/[.!?]+/).length >= 4) {
      score += 5;
    }

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  /**
   * Grade the depth of framework/structured thinking
   * @param {string} response - The response content
   * @returns {number} - Score 0-100
   */
  scoreFrameworkDepth(response) {
    let score = 40; // Base score

    // Check for numbered/bulleted lists
    if (/\d+\.\s|•\s|-\s\w/g.test(response)) {
      score += 20;
    }

    // Check for multi-step reasoning
    const reasoningPatterns = [
      /first.*second|step 1.*step 2/i,
      /on one hand.*on the other/i,
      /pros.*cons|advantages.*disadvantages/i,
      /key factors|main considerations|primary drivers/i
    ];

    for (const pattern of reasoningPatterns) {
      if (pattern.test(response)) {
        score += 15;
      }
    }

    // Check for quantitative elements
    if (/\d+%|\$\d+|\d+x|\d+\.\d+/g.test(response)) {
      score += 10;
    }

    // Check for comparative analysis
    if (/compared to|relative to|versus|vs\.|higher than|lower than/i.test(response)) {
      score += 10;
    }

    return Math.min(100, Math.round(score));
  }

  /**
   * Calculate overall quality grade for a response
   * @param {string} analystId - The analyst ID
   * @param {string} question - The user's question
   * @param {string} response - The response content
   * @returns {Object} - Detailed grading result
   */
  gradeResponse(analystId, question, response) {
    const scores = {
      personaAdherence: this.scorePersonaAdherence(analystId, response),
      analystKnowledge: this.scoreAnalystKnowledge(analystId, response),
      specificity: this.scoreSpecificity(question, response),
      fluency: this.scoreFluency(response),
      frameworkDepth: this.scoreFrameworkDepth(analystId, response)
    };

    // Calculate weighted overall score
    const overallScore = Math.round(
      scores.personaAdherence * this.weights.personaAdherence +
      scores.analystKnowledge * this.weights.analystKnowledge +
      scores.specificity * this.weights.specificity +
      scores.fluency * this.weights.fluency +
      scores.frameworkDepth * this.weights.frameworkDepth
    );

    // Determine grade letter
    let grade;
    if (overallScore >= 90) grade = 'A';
    else if (overallScore >= 80) grade = 'B';
    else if (overallScore >= 70) grade = 'C';
    else if (overallScore >= 60) grade = 'D';
    else grade = 'F';

    // Generate feedback
    const feedback = this.generateFeedback(analystId, scores);

    return {
      overallScore,
      grade,
      scores,
      feedback,
      passed: overallScore >= 70
    };
  }

  /**
   * Generate human-readable feedback based on scores
   * @param {string} analystId - The analyst ID
   * @param {Object} scores - Individual dimension scores
   * @returns {string[]} - Array of feedback items
   */
  generateFeedback(analystId, scores) {
    const feedback = [];

    if (scores.personaAdherence < 50) {
      feedback.push(`Low persona adherence - response lacks ${analystId} analyst terminology`);
    }

    if (scores.analystKnowledge < 50) {
      const influences = ANALYST_KEYWORDS[analystId]?.influences || [];
      feedback.push(`Missing analyst knowledge - consider referencing ${influences.slice(0, 2).join(', ')}`);
    }

    if (scores.specificity < 50) {
      feedback.push('Response may not directly address the question');
    }

    if (scores.fluency < 50) {
      feedback.push('Response lacks natural conversational flow');
    }

    if (scores.frameworkDepth < 50) {
      feedback.push('Could use more structured analysis or framework');
    }

    if (feedback.length === 0) {
      feedback.push('Good overall quality');
    }

    return feedback;
  }

  /**
   * Get analyst display name
   */
  getAnalystName(analystId) {
    const names = {
      value: 'Benjamin (Value)',
      growth: 'Catherine (Growth)',
      contrarian: 'Diana (Contrarian)',
      quant: 'Marcus (Quant)',
      tailrisk: 'Nikolai (Tail Risk)',
      tech: 'Sophia (Tech)'
    };
    return names[analystId] || analystId;
  }
}

module.exports = { ConversationGrader, ANALYST_KEYWORDS };

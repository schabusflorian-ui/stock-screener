/**
 * Knowledge Base Loader & Retriever
 *
 * Loads quotes, frameworks, and case studies for AI analyst personas.
 * Provides topic-based retrieval to enrich analyst responses with
 * relevant citations and examples.
 */

const fs = require('fs');
const path = require('path');

// Knowledge base storage
let knowledgeBase = {
  quotes: {},
  frameworks: {},
  caseStudies: {},
  loaded: false
};

// Analyst to knowledge mapping
const ANALYST_MAPPING = {
  value: { quoteFiles: ['buffett'], frameworkFile: 'value_frameworks', caseFile: 'value_cases' },
  growth: { quoteFiles: ['lynch'], frameworkFile: 'growth_frameworks', caseFile: 'growth_cases' },
  contrarian: { quoteFiles: ['marks'], frameworkFile: 'contrarian_frameworks', caseFile: 'contrarian_cases' },
  quant: { quoteFiles: ['quant'], frameworkFile: 'quant_frameworks', caseFile: null },
  tailrisk: { quoteFiles: ['taleb'], frameworkFile: 'tailrisk_frameworks', caseFile: 'tailrisk_cases' },
  tech: { quoteFiles: ['tech'], frameworkFile: 'tech_frameworks', caseFile: null }
};

/**
 * Load all knowledge base files
 */
function loadKnowledgeBase() {
  if (knowledgeBase.loaded) return;

  const basePath = __dirname;

  // Load quotes
  const quotesPath = path.join(basePath, 'quotes');
  if (fs.existsSync(quotesPath)) {
    const quoteFiles = fs.readdirSync(quotesPath).filter(f => f.endsWith('.json'));
    for (const file of quoteFiles) {
      try {
        const content = JSON.parse(fs.readFileSync(path.join(quotesPath, file), 'utf-8'));
        const name = path.basename(file, '.json');
        knowledgeBase.quotes[name] = content;
      } catch (err) {
        console.warn(`Failed to load quote file ${file}:`, err.message);
      }
    }
  }

  // Load frameworks
  const frameworksPath = path.join(basePath, 'frameworks');
  if (fs.existsSync(frameworksPath)) {
    const frameworkFiles = fs.readdirSync(frameworksPath).filter(f => f.endsWith('.json'));
    for (const file of frameworkFiles) {
      try {
        const content = JSON.parse(fs.readFileSync(path.join(frameworksPath, file), 'utf-8'));
        const name = path.basename(file, '.json');
        knowledgeBase.frameworks[name] = content;
      } catch (err) {
        console.warn(`Failed to load framework file ${file}:`, err.message);
      }
    }
  }

  // Load case studies
  const casesPath = path.join(basePath, 'case_studies');
  if (fs.existsSync(casesPath)) {
    const caseFiles = fs.readdirSync(casesPath).filter(f => f.endsWith('.json'));
    for (const file of caseFiles) {
      try {
        const content = JSON.parse(fs.readFileSync(path.join(casesPath, file), 'utf-8'));
        const name = path.basename(file, '.json');
        knowledgeBase.caseStudies[name] = content;
      } catch (err) {
        console.warn(`Failed to load case study file ${file}:`, err.message);
      }
    }
  }

  knowledgeBase.loaded = true;
  console.log(`Knowledge base loaded: ${Object.keys(knowledgeBase.quotes).length} quote files, ${Object.keys(knowledgeBase.frameworks).length} framework files, ${Object.keys(knowledgeBase.caseStudies).length} case study files`);
}

/**
 * Get relevant quotes for a given analyst and topic
 * @param {string} analyst - Analyst type (value, growth, contrarian, quant, tailrisk, tech)
 * @param {string[]} topics - Array of topic keywords to match
 * @param {number} limit - Maximum number of quotes to return
 * @returns {Array} Matching quotes with author and source
 */
function getRelevantQuotes(analyst, topics = [], limit = 3) {
  loadKnowledgeBase();

  const mapping = ANALYST_MAPPING[analyst];
  if (!mapping) return [];

  const normalizedTopics = topics.map(t => t.toLowerCase());
  const results = [];

  for (const quoteFile of mapping.quoteFiles) {
    const quoteData = knowledgeBase.quotes[quoteFile];
    if (!quoteData) continue;

    // Search main author quotes
    if (quoteData.quotes) {
      for (const quote of quoteData.quotes) {
        const score = calculateTopicScore(quote.topics || [], normalizedTopics);
        if (score > 0 || topics.length === 0) {
          results.push({
            text: quote.text,
            author: quoteData.author,
            source: quote.source,
            score,
            topics: quote.topics
          });
        }
      }
    }

    // Search co-author quotes
    if (quoteData.coAuthors) {
      for (const coAuthor of quoteData.coAuthors) {
        for (const quote of coAuthor.quotes || []) {
          const score = calculateTopicScore(quote.topics || [], normalizedTopics);
          if (score > 0 || topics.length === 0) {
            results.push({
              text: quote.text,
              author: coAuthor.name,
              source: quote.source,
              score,
              topics: quote.topics
            });
          }
        }
      }
    }
  }

  // Sort by score (descending) and return top results
  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * Get relevant frameworks for a given analyst and topic
 * @param {string} analyst - Analyst type
 * @param {string[]} topics - Array of topic keywords to match
 * @param {number} limit - Maximum number of frameworks to return
 * @returns {Array} Matching frameworks with steps and keywords
 */
function getRelevantFrameworks(analyst, topics = [], limit = 2) {
  loadKnowledgeBase();

  const mapping = ANALYST_MAPPING[analyst];
  if (!mapping || !mapping.frameworkFile) return [];

  const frameworkData = knowledgeBase.frameworks[mapping.frameworkFile];
  if (!frameworkData || !frameworkData.frameworks) return [];

  const normalizedTopics = topics.map(t => t.toLowerCase());
  const results = [];

  for (const framework of frameworkData.frameworks) {
    const score = calculateTopicScore(framework.keywords || [], normalizedTopics);
    if (score > 0 || topics.length === 0) {
      results.push({
        id: framework.id,
        name: framework.name,
        description: framework.description,
        steps: framework.steps,
        keywords: framework.keywords,
        sources: framework.sources,
        score
      });
    }
  }

  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * Get relevant case studies for a given analyst and topic
 * @param {string} analyst - Analyst type
 * @param {string[]} topics - Array of topic keywords to match
 * @param {number} limit - Maximum number of case studies to return
 * @returns {Array} Matching case studies with thesis and lessons
 */
function getRelevantCaseStudies(analyst, topics = [], limit = 1) {
  loadKnowledgeBase();

  const mapping = ANALYST_MAPPING[analyst];
  if (!mapping || !mapping.caseFile) return [];

  const caseData = knowledgeBase.caseStudies[mapping.caseFile];
  if (!caseData || !caseData.case_studies) return [];

  const normalizedTopics = topics.map(t => t.toLowerCase());
  const results = [];

  for (const caseStudy of caseData.case_studies) {
    const score = calculateTopicScore(caseStudy.keywords || [], normalizedTopics);
    if (score > 0 || topics.length === 0) {
      results.push({
        id: caseStudy.id,
        title: caseStudy.title,
        company: caseStudy.company,
        investor: caseStudy.investor,
        thesis: caseStudy.thesis,
        lessons: caseStudy.lessons,
        keywords: caseStudy.keywords,
        sources: caseStudy.sources,
        score
      });
    }
  }

  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * Get all relevant knowledge for a query
 * @param {string} analyst - Analyst type
 * @param {string} query - User query text
 * @param {Object} options - Options for retrieval
 * @returns {Object} Object containing quotes, frameworks, and case studies
 */
function getKnowledgeForQuery(analyst, query, options = {}) {
  const {
    maxQuotes = 3,
    maxFrameworks = 2,
    maxCaseStudies = 1
  } = options;

  // Extract topics from query
  const topics = extractTopicsFromQuery(query, analyst);

  return {
    quotes: getRelevantQuotes(analyst, topics, maxQuotes),
    frameworks: getRelevantFrameworks(analyst, topics, maxFrameworks),
    caseStudies: getRelevantCaseStudies(analyst, topics, maxCaseStudies),
    extractedTopics: topics
  };
}

/**
 * Format knowledge for injection into analyst prompt
 * @param {Object} knowledge - Knowledge object from getKnowledgeForQuery
 * @returns {string} Formatted string for prompt injection
 */
function formatKnowledgeForPrompt(knowledge) {
  const sections = [];

  // Format quotes
  if (knowledge.quotes && knowledge.quotes.length > 0) {
    const quoteLines = knowledge.quotes.map(q =>
      `- "${q.text}" — ${q.author}${q.source ? ` (${q.source})` : ''}`
    );
    sections.push(`**Relevant Quotes You May Cite:**\n${quoteLines.join('\n')}`);
  }

  // Format frameworks
  if (knowledge.frameworks && knowledge.frameworks.length > 0) {
    const frameworkLines = knowledge.frameworks.map(f => {
      const steps = f.steps ? f.steps.slice(0, 3).join('\n  ') : '';
      return `- **${f.name}**: ${f.description}\n  ${steps}${f.steps && f.steps.length > 3 ? '\n  ...' : ''}`;
    });
    sections.push(`**Relevant Frameworks:**\n${frameworkLines.join('\n')}`);
  }

  // Format case studies
  if (knowledge.caseStudies && knowledge.caseStudies.length > 0) {
    const caseLines = knowledge.caseStudies.map(c => {
      const thesis = typeof c.thesis === 'object'
        ? Object.entries(c.thesis).slice(0, 2).map(([k, v]) => `${k}: ${v}`).join('; ')
        : c.thesis;
      return `- **${c.title}** (${c.investor || c.company}): ${thesis}`;
    });
    sections.push(`**Relevant Case Studies:**\n${caseLines.join('\n')}`);
  }

  return sections.length > 0
    ? `\n---\n**KNOWLEDGE BASE CONTEXT**\n${sections.join('\n\n')}\n---\n`
    : '';
}

/**
 * Extract topics from a query based on analyst-specific keywords
 */
function extractTopicsFromQuery(query, analyst) {
  const queryLower = query.toLowerCase();

  // Common topic keywords by analyst
  const topicKeywords = {
    value: ['moat', 'intrinsic value', 'margin of safety', 'capital allocation', 'pricing power',
            'owner earnings', 'competitive advantage', 'durable', 'wonderful company', 'fair price',
            'buffett', 'munger', 'circle of competence', 'float', 'roe', 'roic'],
    growth: ['tam', 'market opportunity', 'revenue growth', 'ten-bagger', 'peg', 'scalable',
             'network effects', 'disruptive', 'expansion', 'addressable market', 'lynch', 'fisher',
             'flywheel', 'growth rate', 'sustainable'],
    contrarian: ['sentiment', 'beaten-down', 'pessimism', 'catalyst', 'contrarian', 'second-level',
                 'cycle', 'mean reversion', 'hated', 'value trap', 'marks', 'burry', 'templeton',
                 'asymmetric', 'consensus'],
    quant: ['factor', 'sharpe', 'alpha', 'correlation', 'systematic', 'momentum', 'position sizing',
            'volatility', 'quantitative', 'statistical', 'backtest', 'risk-adjusted', 'sortino'],
    tailrisk: ['antifragile', 'convexity', 'black swan', 'tail risk', 'barbell', 'fragile',
               'optionality', 'fat tails', 'leverage', 'taleb', 'spitznagel', 'hedge', 'ruin'],
    tech: ['disruption', 'platform', 'network effects', 'winner-take-all', 'saas', 'ltv', 'cac',
           'flywheel', 's-curve', 'adoption', 'unit economics', 'pmf', 'a16z', 'andreessen']
  };

  const relevantKeywords = topicKeywords[analyst] || [];
  const foundTopics = [];

  for (const keyword of relevantKeywords) {
    if (queryLower.includes(keyword.toLowerCase())) {
      foundTopics.push(keyword);
    }
  }

  // Map certain keywords to topics that exist in the knowledge base
  const topicMappings = {
    'buffett': 'moat',  // Buffett questions should trigger moat content
    'munger': 'moat',
    'ruin': 'survival',  // "Path to ruin" should trigger survival content
    'survive': 'survival',
    'recession': 'survival',
    'crash': 'tail risk',
    'downturn': 'tail risk',
    'bubble': 'fragile',
    'overvalued': 'intrinsic value',
    'undervalued': 'margin of safety',
    'insider': 'skin in the game',
    'management': 'capital allocation',
    'ceo': 'capital allocation',
    'profit': 'owner earnings',
    'profitability': 'growth rate',
    'compare': 'factor',
    'vs': 'factor',
    'stop loss': 'position sizing',
    'position': 'position sizing',
    'technical': 'momentum',
    'chart': 'momentum',
  };

  // Add mapped topics
  for (const [keyword, mappedTopic] of Object.entries(topicMappings)) {
    if (queryLower.includes(keyword) && !foundTopics.includes(mappedTopic)) {
      foundTopics.push(mappedTopic);
    }
  }

  // If still no specific topics found, return defaults based on common patterns
  if (foundTopics.length === 0) {
    // Check for common patterns
    if (queryLower.includes('buy') || queryLower.includes('invest')) {
      foundTopics.push(analyst === 'value' ? 'margin of safety' : 'opportunity');
    }
    if (queryLower.includes('risk')) {
      foundTopics.push(analyst === 'tailrisk' ? 'tail risk' : 'risk');
    }
    if (queryLower.includes('company') || queryLower.includes('stock')) {
      foundTopics.push(analyst === 'value' ? 'moat' : 'analysis');
    }
  }

  return foundTopics;
}

/**
 * Calculate topic match score
 */
function calculateTopicScore(itemTopics, queryTopics) {
  if (!itemTopics || itemTopics.length === 0 || !queryTopics || queryTopics.length === 0) {
    return 0;
  }

  let score = 0;
  const normalizedItemTopics = itemTopics.map(t => t.toLowerCase());

  for (const queryTopic of queryTopics) {
    for (const itemTopic of normalizedItemTopics) {
      // Exact match
      if (itemTopic === queryTopic) {
        score += 2;
      }
      // Partial match (one contains the other)
      else if (itemTopic.includes(queryTopic) || queryTopic.includes(itemTopic)) {
        score += 1;
      }
    }
  }

  return score;
}

/**
 * Get statistics about the knowledge base
 */
function getKnowledgeBaseStats() {
  loadKnowledgeBase();

  const stats = {
    quotes: {},
    frameworks: {},
    caseStudies: {},
    totals: { quotes: 0, frameworks: 0, caseStudies: 0 }
  };

  // Count quotes
  for (const [name, data] of Object.entries(knowledgeBase.quotes)) {
    const mainQuotes = data.quotes?.length || 0;
    const coAuthorQuotes = data.coAuthors?.reduce((sum, ca) => sum + (ca.quotes?.length || 0), 0) || 0;
    stats.quotes[name] = mainQuotes + coAuthorQuotes;
    stats.totals.quotes += mainQuotes + coAuthorQuotes;
  }

  // Count frameworks
  for (const [name, data] of Object.entries(knowledgeBase.frameworks)) {
    stats.frameworks[name] = data.frameworks?.length || 0;
    stats.totals.frameworks += data.frameworks?.length || 0;
  }

  // Count case studies
  for (const [name, data] of Object.entries(knowledgeBase.caseStudies)) {
    stats.caseStudies[name] = data.case_studies?.length || 0;
    stats.totals.caseStudies += data.case_studies?.length || 0;
  }

  return stats;
}

/**
 * Test function to verify knowledge base loading
 */
function test() {
  console.log('\n=== Knowledge Base Test ===\n');

  // Load and show stats
  const stats = getKnowledgeBaseStats();
  console.log('Knowledge Base Statistics:');
  console.log(JSON.stringify(stats, null, 2));

  // Test retrieval for each analyst
  const testQueries = {
    value: 'Does this company have a durable moat?',
    growth: 'What is the TAM for this market?',
    contrarian: 'Is the pessimism overdone?',
    quant: 'What are the factor scores?',
    tailrisk: 'Is this company antifragile?',
    tech: 'Is this a winner-take-all market?'
  };

  console.log('\n--- Testing Knowledge Retrieval ---\n');

  for (const [analyst, query] of Object.entries(testQueries)) {
    console.log(`\nAnalyst: ${analyst}`);
    console.log(`Query: "${query}"`);

    const knowledge = getKnowledgeForQuery(analyst, query);
    console.log(`Extracted topics: ${knowledge.extractedTopics.join(', ') || 'none'}`);
    console.log(`Found: ${knowledge.quotes.length} quotes, ${knowledge.frameworks.length} frameworks, ${knowledge.caseStudies.length} case studies`);

    if (knowledge.quotes.length > 0) {
      console.log(`Top quote: "${knowledge.quotes[0].text.substring(0, 60)}..." — ${knowledge.quotes[0].author}`);
    }
    if (knowledge.frameworks.length > 0) {
      console.log(`Top framework: ${knowledge.frameworks[0].name}`);
    }
  }

  console.log('\n=== Test Complete ===\n');
}

module.exports = {
  loadKnowledgeBase,
  getRelevantQuotes,
  getRelevantFrameworks,
  getRelevantCaseStudies,
  getKnowledgeForQuery,
  formatKnowledgeForPrompt,
  getKnowledgeBaseStats,
  test
};

// src/services/newsService.js
// News service using Google News RSS and SEC EDGAR (both free, no API keys)

const axios = require('axios');
const xml2js = require('xml2js');

/**
 * Fetch company news from Google News RSS
 * Free, no rate limits, no API key needed
 */
async function fetchGoogleNews(symbol, companyName) {
  try {
    // Search for stock symbol + "stock" for more relevant results
    const query = encodeURIComponent(`${symbol} stock`);
    const rssUrl = `https://news.google.com/rss/search?q=${query}&hl=en-US&gl=US&ceid=US:en`;

    const response = await axios.get(rssUrl, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; InvestmentResearch/1.0)'
      }
    });

    const parser = new xml2js.Parser({ explicitArray: false });
    const result = await parser.parseStringPromise(response.data);

    if (!result.rss?.channel?.item) {
      return { source: 'google-news', data: [] };
    }

    const items = Array.isArray(result.rss.channel.item)
      ? result.rss.channel.item
      : [result.rss.channel.item];

    const news = items.slice(0, 15).map((item, index) => ({
      id: `gn-${symbol}-${index}`,
      headline: item.title || '',
      summary: item.description ? stripHtml(item.description) : '',
      source: extractSource(item.source?._) || extractSource(item.title) || 'Google News',
      url: item.link || '#',
      datetime: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
      category: 'news'
    }));

    return { source: 'google-news', data: news };
  } catch (error) {
    console.error('Google News RSS error:', error.message);
    return { source: 'google-news', data: [], error: error.message };
  }
}

/**
 * Fetch SEC filings from EDGAR
 * Free and unlimited - official SEC source
 */
async function fetchSECFilings(symbol, cik) {
  try {
    // If no CIK, try to look it up from symbol
    let actualCik = cik;

    if (!actualCik) {
      // Try SEC company search
      const searchUrl = `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&company=${symbol}&type=&dateb=&owner=include&count=1&output=atom`;
      const searchResponse = await axios.get(searchUrl, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Investment Research Tool (contact@example.com)',
          'Accept': 'application/atom+xml'
        }
      });

      // Try to extract CIK from response
      const cikMatch = searchResponse.data.match(/CIK=(\d+)/i);
      if (cikMatch) {
        actualCik = cikMatch[1];
      }
    }

    if (!actualCik) {
      return { source: 'sec-edgar', data: [], error: 'CIK not found' };
    }

    // Pad CIK to 10 digits
    const paddedCik = actualCik.toString().padStart(10, '0');

    // Fetch recent filings
    const filingsUrl = `https://data.sec.gov/submissions/CIK${paddedCik}.json`;

    const response = await axios.get(filingsUrl, {
      timeout: 15000,
      headers: {
        'User-Agent': 'Investment Research Tool (contact@example.com)',
        'Accept': 'application/json'
      }
    });

    const data = response.data;
    const recentFilings = data.filings?.recent;

    if (!recentFilings) {
      return { source: 'sec-edgar', data: [] };
    }

    // Get relevant filing types
    const relevantForms = ['8-K', '10-K', '10-Q', '4', 'S-1', 'DEF 14A', '13F-HR'];
    const filings = [];

    for (let i = 0; i < Math.min(recentFilings.form?.length || 0, 100); i++) {
      const formType = recentFilings.form[i];

      if (relevantForms.includes(formType)) {
        const accessionNumber = recentFilings.accessionNumber[i].replace(/-/g, '');
        const filingDate = recentFilings.filingDate[i];
        const primaryDocument = recentFilings.primaryDocument[i];

        filings.push({
          id: `sec-${accessionNumber}`,
          formType,
          title: getFormDescription(formType),
          filedDate: filingDate,
          url: `https://www.sec.gov/Archives/edgar/data/${actualCik}/${accessionNumber}/${primaryDocument}`,
          accessionNumber: recentFilings.accessionNumber[i],
          reportDate: recentFilings.reportDate?.[i] || filingDate
        });

        if (filings.length >= 20) break;
      }
    }

    return {
      source: 'sec-edgar',
      data: filings,
      companyInfo: {
        name: data.name,
        cik: actualCik,
        sic: data.sic,
        sicDescription: data.sicDescription
      }
    };
  } catch (error) {
    console.error('SEC EDGAR error:', error.message);
    return { source: 'sec-edgar', data: [], error: error.message };
  }
}

/**
 * Get insider transactions (Form 4 filings)
 */
async function fetchInsiderTransactions(symbol, cik) {
  try {
    let actualCik = cik;

    if (!actualCik) {
      // Try to get from SEC
      const searchUrl = `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&company=${symbol}&type=4&dateb=&owner=only&count=1&output=atom`;
      const searchResponse = await axios.get(searchUrl, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Investment Research Tool (contact@example.com)'
        }
      });

      const cikMatch = searchResponse.data.match(/CIK=(\d+)/i);
      if (cikMatch) {
        actualCik = cikMatch[1];
      }
    }

    if (!actualCik) {
      return { source: 'sec-edgar', data: [] };
    }

    const paddedCik = actualCik.toString().padStart(10, '0');
    const filingsUrl = `https://data.sec.gov/submissions/CIK${paddedCik}.json`;

    const response = await axios.get(filingsUrl, {
      timeout: 15000,
      headers: {
        'User-Agent': 'Investment Research Tool (contact@example.com)'
      }
    });

    const recentFilings = response.data.filings?.recent;
    if (!recentFilings) return { source: 'sec-edgar', data: [] };

    const insiderFilings = [];

    for (let i = 0; i < Math.min(recentFilings.form?.length || 0, 50); i++) {
      if (recentFilings.form[i] === '4') {
        insiderFilings.push({
          id: `insider-${recentFilings.accessionNumber[i]}`,
          filedDate: recentFilings.filingDate[i],
          reportDate: recentFilings.reportDate?.[i],
          accessionNumber: recentFilings.accessionNumber[i],
          formType: '4'
        });

        if (insiderFilings.length >= 10) break;
      }
    }

    return { source: 'sec-edgar', data: insiderFilings };
  } catch (error) {
    console.error('Insider transactions error:', error.message);
    return { source: 'sec-edgar', data: [], error: error.message };
  }
}

// ============ HELPER FUNCTIONS ============

function stripHtml(html) {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim();
}

function extractSource(text) {
  if (!text) return null;
  // Google News format: "Title - Source"
  const match = text.match(/ - ([^-]+)$/);
  return match ? match[1].trim() : null;
}

function getFormDescription(formType) {
  const descriptions = {
    '8-K': 'Current Report - Material Event',
    '10-K': 'Annual Report',
    '10-Q': 'Quarterly Report',
    '4': 'Insider Transaction',
    'S-1': 'IPO Registration',
    'DEF 14A': 'Proxy Statement',
    '13F-HR': 'Institutional Holdings',
    '13D': 'Beneficial Ownership (>5%)',
    '13G': 'Beneficial Ownership (Passive)',
    'SC 13G': 'Schedule 13G Amendment'
  };
  return descriptions[formType] || formType;
}

// ============ COMBINED DATA FETCHER ============

async function getCompanyNewsAndEvents(symbol, cik = null, companyName = null) {
  const [newsResult, filingsResult] = await Promise.all([
    fetchGoogleNews(symbol, companyName),
    fetchSECFilings(symbol, cik)
  ]);

  return {
    symbol,
    news: newsResult,
    secFilings: filingsResult,
    lastUpdated: new Date().toISOString()
  };
}

module.exports = {
  fetchGoogleNews,
  fetchSECFilings,
  fetchInsiderTransactions,
  getCompanyNewsAndEvents
};

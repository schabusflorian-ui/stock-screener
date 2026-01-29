/**
 * EU/UK Earnings Calendar Service
 *
 * Derives earnings dates from XBRL filing data for European companies.
 * EU companies file annual reports within 4 months of fiscal year end,
 * so we can estimate next earnings based on historical filing patterns.
 */

class EUEarningsCalendarService {
  constructor(db) {
    this.db = db;
    this._prepareStatements();
  }

  _prepareStatements() {
    this.stmtGetFilingHistory = this.db.prepare(`
      SELECT f.id, f.period_start, f.period_end, f.filing_date, f.document_type,
             i.legal_name, i.lei, i.country, i.ticker, i.yahoo_symbol
      FROM xbrl_filings f
      JOIN company_identifiers i ON f.identifier_id = i.id
      WHERE f.identifier_id = ?
      ORDER BY f.period_end DESC
    `);

    this.stmtGetIdentifierByLEI = this.db.prepare(`
      SELECT * FROM company_identifiers WHERE lei = ?
    `);

    this.stmtGetUpcomingFilings = this.db.prepare(`
      SELECT i.id as identifier_id, i.legal_name, i.lei, i.country, i.ticker, i.yahoo_symbol,
             MAX(f.period_end) as latest_period_end, MAX(f.filing_date) as latest_filing_date,
             AVG(julianday(f.filing_date) - julianday(f.period_end)) as avg_days_to_file
      FROM company_identifiers i
      JOIN xbrl_filings f ON f.identifier_id = i.id
      WHERE f.filing_date IS NOT NULL AND f.period_end IS NOT NULL
      GROUP BY i.id HAVING COUNT(*) >= 2
    `);
  }

  getEarningsDataByIdentifierId(identifierId) {
    const filings = this.stmtGetFilingHistory.all(identifierId);
    if (filings.length === 0) return null;

    const company = filings[0];
    const history = filings.map(f => ({
      periodEnd: f.period_end,
      announcementDate: f.filing_date,
      daysAfterPeriodEnd: f.filing_date && f.period_end
        ? Math.round((new Date(f.filing_date) - new Date(f.period_end)) / (1000 * 60 * 60 * 24))
        : null
    }));

    const daysToFile = history.filter(h => h.daysAfterPeriodEnd > 0 && h.daysAfterPeriodEnd < 200).map(h => h.daysAfterPeriodEnd);
    const avgDaysToFile = daysToFile.length > 0 ? Math.round(daysToFile.reduce((a, b) => a + b, 0) / daysToFile.length) : 90;

    const latestPeriodEnd = new Date(company.period_end);
    const nextPeriodEnd = new Date(latestPeriodEnd);
    nextPeriodEnd.setFullYear(nextPeriodEnd.getFullYear() + 1);
    const estimatedNext = new Date(nextPeriodEnd);
    estimatedNext.setDate(estimatedNext.getDate() + avgDaysToFile);

    return {
      company: { name: company.legal_name, lei: company.lei, country: company.country, ticker: company.ticker },
      nextEarnings: { date: estimatedNext.toISOString().split('T')[0], isEstimate: true, periodEnd: nextPeriodEnd.toISOString().split('T')[0], avgDaysToFile },
      history,
      stats: { filingCount: history.length, avgDaysToFile }
    };
  }

  getUpcomingEarnings(daysAhead = 30, country = null) {
    const companies = this.stmtGetUpcomingFilings.all();
    const now = new Date();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + daysAhead);

    const upcoming = [];
    for (const company of companies) {
      if (country && company.country !== country) continue;

      const latestPeriodEnd = new Date(company.latest_period_end);
      const nextPeriodEnd = new Date(latestPeriodEnd);
      nextPeriodEnd.setFullYear(nextPeriodEnd.getFullYear() + 1);

      const avgDaysToFile = Math.round(company.avg_days_to_file) || 90;
      const estimatedDate = new Date(nextPeriodEnd);
      estimatedDate.setDate(estimatedDate.getDate() + avgDaysToFile);

      if (estimatedDate >= now && estimatedDate <= cutoff) {
        upcoming.push({
          identifierId: company.identifier_id,
          name: company.legal_name,
          lei: company.lei,
          country: company.country,
          ticker: company.ticker,
          estimatedDate: estimatedDate.toISOString().split('T')[0],
          periodEnd: nextPeriodEnd.toISOString().split('T')[0],
          isEstimate: true
        });
      }
    }
    return upcoming.sort((a, b) => new Date(a.estimatedDate) - new Date(b.estimatedDate));
  }

  getRecentEarnings(daysBack = 30, country = null) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysBack);

    let query = `
      SELECT i.id as identifier_id, i.legal_name, i.lei, i.country, i.ticker,
             f.period_end, f.filing_date, f.document_type
      FROM xbrl_filings f
      JOIN company_identifiers i ON f.identifier_id = i.id
      WHERE f.filing_date >= ?
    `;
    const params = [cutoff.toISOString()];
    if (country) { query += ' AND i.country = ?'; params.push(country); }
    query += ' ORDER BY f.filing_date DESC';

    return this.db.prepare(query).all(...params).map(r => ({
      identifierId: r.identifier_id,
      name: r.legal_name,
      country: r.country,
      announcementDate: r.filing_date,
      periodEnd: r.period_end
    }));
  }
}

module.exports = { EUEarningsCalendarService };

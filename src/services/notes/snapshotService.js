// src/services/notes/snapshotService.js
// Service for capturing and managing data snapshots tied to notes

class SnapshotService {
  constructor(db) {
    this.db = db;
    this._prepareStatements();
  }

  _prepareStatements() {
    this.stmts = {
      // Snapshot CRUD
      getSnapshotsByNote: this.db.prepare(`
        SELECT * FROM note_data_snapshots
        WHERE note_id = ?
        ORDER BY snapshot_date DESC
      `),

      getSnapshot: this.db.prepare(`
        SELECT * FROM note_data_snapshots WHERE id = ?
      `),

      getSnapshotsBySymbol: this.db.prepare(`
        SELECT s.*, n.title as note_title
        FROM note_data_snapshots s
        JOIN notes n ON s.note_id = n.id
        WHERE s.symbol = ? AND n.deleted_at IS NULL
        ORDER BY s.snapshot_date DESC
      `),

      createSnapshot: this.db.prepare(`
        INSERT INTO note_data_snapshots (
          note_id, symbol, snapshot_date,
          price, market_cap, pe_ratio, pb_ratio, ps_ratio, ev_ebitda,
          revenue, net_income, gross_margin, operating_margin, net_margin,
          roic, roe, revenue_growth_yoy, earnings_growth_yoy,
          debt_to_equity, current_ratio, fcf_yield, metrics_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `),

      deleteSnapshot: this.db.prepare(`
        DELETE FROM note_data_snapshots WHERE id = ?
      `),

      deleteSnapshotsByNote: this.db.prepare(`
        DELETE FROM note_data_snapshots WHERE note_id = ?
      `),

      // Data gathering queries
      getCompanyBySymbol: this.db.prepare(`
        SELECT * FROM companies WHERE symbol = ? COLLATE NOCASE
      `),

      getLatestPrice: this.db.prepare(`
        SELECT * FROM daily_prices
        WHERE company_id = ?
        ORDER BY date DESC
        LIMIT 1
      `),

      getLatestMetrics: this.db.prepare(`
        SELECT * FROM calculated_metrics
        WHERE company_id = ?
        ORDER BY fiscal_period DESC
        LIMIT 1
      `),

      getLatestFinancials: this.db.prepare(`
        SELECT * FROM financial_data
        WHERE company_id = ? AND statement_type = 'income_statement'
        ORDER BY fiscal_date_ending DESC
        LIMIT 1
      `)
    };
  }

  // ============================================
  // Snapshot Operations
  // ============================================

  /**
   * Capture a snapshot of current metrics for a symbol
   */
  captureSnapshot(noteId, symbol) {
    const company = this.stmts.getCompanyBySymbol.get(symbol);
    if (!company) {
      return { success: false, error: `Company not found: ${symbol}` };
    }

    const price = this.stmts.getLatestPrice.get(company.id);
    const metrics = this.stmts.getLatestMetrics.get(company.id);
    const financials = this.stmts.getLatestFinancials.get(company.id);

    const snapshotDate = new Date().toISOString().split('T')[0];

    // Build full metrics JSON for flexibility
    const metricsJson = JSON.stringify({
      company: {
        id: company.id,
        symbol: company.symbol,
        name: company.name,
        sector: company.sector,
        industry: company.industry
      },
      price: price ? {
        close: price.close,
        date: price.date,
        volume: price.volume
      } : null,
      metrics: metrics || null,
      financials: financials ? {
        fiscal_date_ending: financials.fiscal_date_ending,
        period_type: financials.period_type,
        revenue: financials.total_revenue,
        net_income: financials.net_income,
        operating_income: financials.operating_income
      } : null,
      captured_at: new Date().toISOString()
    });

    const result = this.stmts.createSnapshot.run(
      noteId,
      symbol.toUpperCase(),
      snapshotDate,
      price?.close || null,
      company.market_cap,
      metrics?.pe_ratio || null,
      metrics?.pb_ratio || null,
      metrics?.ps_ratio || null,
      metrics?.ev_ebitda || null,
      financials?.total_revenue || null,
      financials?.net_income || null,
      metrics?.gross_margin || null,
      metrics?.operating_margin || null,
      metrics?.net_margin || null,
      metrics?.roic || null,
      metrics?.roe || null,
      metrics?.revenue_growth_yoy || null,
      metrics?.earnings_growth_yoy || null,
      metrics?.debt_to_equity || null,
      metrics?.current_ratio || null,
      metrics?.fcf_yield || null,
      metricsJson
    );

    return {
      success: true,
      snapshotId: result.lastInsertRowid,
      snapshotDate,
      symbol: symbol.toUpperCase()
    };
  }

  /**
   * Capture snapshots for multiple symbols
   */
  captureMultipleSnapshots(noteId, symbols) {
    const results = [];
    for (const symbol of symbols) {
      const result = this.captureSnapshot(noteId, symbol);
      results.push({ symbol, ...result });
    }
    return results;
  }

  /**
   * Get all snapshots for a note
   */
  getSnapshotsByNote(noteId) {
    return this.stmts.getSnapshotsByNote.all(noteId).map(this._formatSnapshot);
  }

  /**
   * Get snapshot by ID
   */
  getSnapshot(snapshotId) {
    const snapshot = this.stmts.getSnapshot.get(snapshotId);
    return snapshot ? this._formatSnapshot(snapshot) : null;
  }

  /**
   * Get all snapshots for a symbol across all notes
   */
  getSnapshotsBySymbol(symbol) {
    return this.stmts.getSnapshotsBySymbol.all(symbol.toUpperCase()).map(this._formatSnapshot);
  }

  /**
   * Delete a specific snapshot
   */
  deleteSnapshot(snapshotId) {
    this.stmts.deleteSnapshot.run(snapshotId);
    return { success: true, snapshotId };
  }

  /**
   * Delete all snapshots for a note
   */
  deleteSnapshotsByNote(noteId) {
    this.stmts.deleteSnapshotsByNote.run(noteId);
    return { success: true, noteId };
  }

  // ============================================
  // Comparison Operations
  // ============================================

  /**
   * Compare a snapshot to current values
   */
  compareSnapshotToCurrent(snapshotId) {
    const snapshot = this.stmts.getSnapshot.get(snapshotId);
    if (!snapshot) {
      return { success: false, error: 'Snapshot not found' };
    }

    const company = this.stmts.getCompanyBySymbol.get(snapshot.symbol);
    if (!company) {
      return { success: false, error: 'Company not found' };
    }

    const currentPrice = this.stmts.getLatestPrice.get(company.id);
    const currentMetrics = this.stmts.getLatestMetrics.get(company.id);

    const comparison = {
      symbol: snapshot.symbol,
      snapshotDate: snapshot.snapshot_date,
      currentDate: new Date().toISOString().split('T')[0],
      metrics: {}
    };

    // Compare key metrics
    const metricsToCompare = [
      { key: 'price', snapshotValue: snapshot.price, currentValue: currentPrice?.close },
      { key: 'market_cap', snapshotValue: snapshot.market_cap, currentValue: company.market_cap },
      { key: 'pe_ratio', snapshotValue: snapshot.pe_ratio, currentValue: currentMetrics?.pe_ratio },
      { key: 'pb_ratio', snapshotValue: snapshot.pb_ratio, currentValue: currentMetrics?.pb_ratio },
      { key: 'ps_ratio', snapshotValue: snapshot.ps_ratio, currentValue: currentMetrics?.ps_ratio },
      { key: 'ev_ebitda', snapshotValue: snapshot.ev_ebitda, currentValue: currentMetrics?.ev_ebitda },
      { key: 'roic', snapshotValue: snapshot.roic, currentValue: currentMetrics?.roic },
      { key: 'roe', snapshotValue: snapshot.roe, currentValue: currentMetrics?.roe },
      { key: 'gross_margin', snapshotValue: snapshot.gross_margin, currentValue: currentMetrics?.gross_margin },
      { key: 'operating_margin', snapshotValue: snapshot.operating_margin, currentValue: currentMetrics?.operating_margin },
      { key: 'net_margin', snapshotValue: snapshot.net_margin, currentValue: currentMetrics?.net_margin },
      { key: 'debt_to_equity', snapshotValue: snapshot.debt_to_equity, currentValue: currentMetrics?.debt_to_equity },
      { key: 'fcf_yield', snapshotValue: snapshot.fcf_yield, currentValue: currentMetrics?.fcf_yield }
    ];

    for (const { key, snapshotValue, currentValue } of metricsToCompare) {
      if (snapshotValue !== null || currentValue !== null) {
        const change = snapshotValue && currentValue
          ? ((currentValue - snapshotValue) / Math.abs(snapshotValue) * 100)
          : null;

        comparison.metrics[key] = {
          snapshot: snapshotValue,
          current: currentValue,
          change: change ? parseFloat(change.toFixed(2)) : null,
          improved: this._isImproved(key, snapshotValue, currentValue)
        };
      }
    }

    // Calculate overall price return
    if (snapshot.price && currentPrice?.close) {
      comparison.priceReturn = parseFloat(
        ((currentPrice.close - snapshot.price) / snapshot.price * 100).toFixed(2)
      );
    }

    return { success: true, comparison };
  }

  /**
   * Compare two snapshots
   */
  compareSnapshots(snapshotId1, snapshotId2) {
    const snapshot1 = this.stmts.getSnapshot.get(snapshotId1);
    const snapshot2 = this.stmts.getSnapshot.get(snapshotId2);

    if (!snapshot1 || !snapshot2) {
      return { success: false, error: 'One or both snapshots not found' };
    }

    if (snapshot1.symbol !== snapshot2.symbol) {
      return { success: false, error: 'Snapshots are for different symbols' };
    }

    const comparison = {
      symbol: snapshot1.symbol,
      date1: snapshot1.snapshot_date,
      date2: snapshot2.snapshot_date,
      metrics: {}
    };

    const metricsToCompare = [
      'price', 'market_cap', 'pe_ratio', 'pb_ratio', 'ps_ratio', 'ev_ebitda',
      'revenue', 'net_income', 'gross_margin', 'operating_margin', 'net_margin',
      'roic', 'roe', 'debt_to_equity', 'current_ratio', 'fcf_yield'
    ];

    for (const key of metricsToCompare) {
      const val1 = snapshot1[key];
      const val2 = snapshot2[key];

      if (val1 !== null || val2 !== null) {
        const change = val1 && val2
          ? ((val2 - val1) / Math.abs(val1) * 100)
          : null;

        comparison.metrics[key] = {
          value1: val1,
          value2: val2,
          change: change ? parseFloat(change.toFixed(2)) : null
        };
      }
    }

    return { success: true, comparison };
  }

  // ============================================
  // Private Helpers
  // ============================================

  _formatSnapshot(snapshot) {
    return {
      ...snapshot,
      metrics_json: snapshot.metrics_json ? JSON.parse(snapshot.metrics_json) : null
    };
  }

  /**
   * Determine if a metric change is an improvement
   */
  _isImproved(metric, oldValue, newValue) {
    if (oldValue === null || newValue === null) return null;

    // Metrics where higher is better
    const higherIsBetter = [
      'price', 'market_cap', 'roic', 'roe', 'gross_margin', 'operating_margin',
      'net_margin', 'revenue', 'net_income', 'current_ratio', 'fcf_yield'
    ];

    // Metrics where lower is better
    const lowerIsBetter = ['pe_ratio', 'pb_ratio', 'ps_ratio', 'ev_ebitda', 'debt_to_equity'];

    if (higherIsBetter.includes(metric)) {
      return newValue > oldValue;
    }
    if (lowerIsBetter.includes(metric)) {
      return newValue < oldValue;
    }
    return null;
  }
}

function getSnapshotService(db) {
  return new SnapshotService(db);
}

module.exports = { SnapshotService, getSnapshotService };

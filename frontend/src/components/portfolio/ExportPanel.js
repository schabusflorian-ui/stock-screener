// frontend/src/components/portfolio/ExportPanel.js
// Export panel for downloading portfolio reports

import React, { useState } from 'react';
import { portfoliosAPI } from '../../services/api';
import './ExportPanel.css';

const ExportPanel = ({ portfolioId, portfolioName }) => {
  const [loading, setLoading] = useState({});
  const [transactionFilters, setTransactionFilters] = useState({
    startDate: '',
    endDate: '',
    type: ''
  });
  const [taxYear, setTaxYear] = useState(new Date().getFullYear());
  const [dividendYear, setDividendYear] = useState(new Date().getFullYear());
  const [showAdvanced, setShowAdvanced] = useState(false);

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 10 }, (_, i) => currentYear - i);

  const handleExport = async (type) => {
    setLoading(prev => ({ ...prev, [type]: true }));

    try {
      switch (type) {
        case 'holdings':
          portfoliosAPI.exportHoldings(portfolioId);
          break;
        case 'transactions':
          portfoliosAPI.exportTransactions(portfolioId, transactionFilters);
          break;
        case 'tax':
          portfoliosAPI.exportTaxReport(portfolioId, taxYear);
          break;
        case 'dividends':
          portfoliosAPI.exportDividendReport(portfolioId, dividendYear);
          break;
        default:
          break;
      }
    } catch (error) {
      console.error(`Export ${type} failed:`, error);
    } finally {
      setTimeout(() => {
        setLoading(prev => ({ ...prev, [type]: false }));
      }, 1000);
    }
  };

  return (
    <div className="export-panel">
      <div className="export-panel-header">
        <h3>Export Reports</h3>
        <p className="export-subtitle">Download portfolio data in CSV format</p>
      </div>

      <div className="export-options">
        {/* Holdings Export */}
        <div className="export-card">
          <div className="export-card-icon">📊</div>
          <div className="export-card-content">
            <h4>Holdings Report</h4>
            <p>Current positions with cost basis, market value, and performance metrics</p>
          </div>
          <button
            className="export-btn"
            onClick={() => handleExport('holdings')}
            disabled={loading.holdings}
          >
            {loading.holdings ? 'Exporting...' : 'Download CSV'}
          </button>
        </div>

        {/* Transactions Export */}
        <div className="export-card">
          <div className="export-card-icon">📋</div>
          <div className="export-card-content">
            <h4>Transaction History</h4>
            <p>All buys, sells, deposits, withdrawals, and dividends</p>

            {showAdvanced && (
              <div className="export-filters">
                <div className="filter-row">
                  <label>
                    From:
                    <input
                      type="date"
                      value={transactionFilters.startDate}
                      onChange={(e) => setTransactionFilters(prev => ({ ...prev, startDate: e.target.value }))}
                    />
                  </label>
                  <label>
                    To:
                    <input
                      type="date"
                      value={transactionFilters.endDate}
                      onChange={(e) => setTransactionFilters(prev => ({ ...prev, endDate: e.target.value }))}
                    />
                  </label>
                </div>
                <div className="filter-row">
                  <label>
                    Type:
                    <select
                      value={transactionFilters.type}
                      onChange={(e) => setTransactionFilters(prev => ({ ...prev, type: e.target.value }))}
                    >
                      <option value="">All Types</option>
                      <option value="buy">Buys</option>
                      <option value="sell">Sells</option>
                      <option value="deposit">Deposits</option>
                      <option value="withdraw">Withdrawals</option>
                      <option value="dividend">Dividends</option>
                    </select>
                  </label>
                </div>
              </div>
            )}

            <button
              className="filter-toggle"
              onClick={() => setShowAdvanced(!showAdvanced)}
            >
              {showAdvanced ? 'Hide Filters' : 'Show Filters'}
            </button>
          </div>
          <button
            className="export-btn"
            onClick={() => handleExport('transactions')}
            disabled={loading.transactions}
          >
            {loading.transactions ? 'Exporting...' : 'Download CSV'}
          </button>
        </div>

        {/* Tax Report */}
        <div className="export-card">
          <div className="export-card-icon">📑</div>
          <div className="export-card-content">
            <h4>Tax Report</h4>
            <p>Realized gains/losses with short-term vs long-term classification</p>
            <div className="year-selector">
              <label>
                Tax Year:
                <select
                  value={taxYear}
                  onChange={(e) => setTaxYear(parseInt(e.target.value))}
                >
                  {years.map(year => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>
          <button
            className="export-btn"
            onClick={() => handleExport('tax')}
            disabled={loading.tax}
          >
            {loading.tax ? 'Exporting...' : 'Download CSV'}
          </button>
        </div>

        {/* Dividend Report */}
        <div className="export-card">
          <div className="export-card-icon">💰</div>
          <div className="export-card-content">
            <h4>Dividend Report</h4>
            <p>Dividend income by stock for tax purposes</p>
            <div className="year-selector">
              <label>
                Year:
                <select
                  value={dividendYear}
                  onChange={(e) => setDividendYear(parseInt(e.target.value))}
                >
                  {years.map(year => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>
          <button
            className="export-btn"
            onClick={() => handleExport('dividends')}
            disabled={loading.dividends}
          >
            {loading.dividends ? 'Exporting...' : 'Download CSV'}
          </button>
        </div>
      </div>

      <div className="export-footer">
        <p className="export-note">
          All exports are generated from your current portfolio data.
          For tax purposes, please consult a tax professional.
        </p>
      </div>
    </div>
  );
};

export default ExportPanel;

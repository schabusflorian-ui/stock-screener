// frontend/src/components/portfolio/ExportModal.js
// Modal popup for portfolio export options

import React, { useState, useEffect } from 'react';
import { X, Download, FileText, Receipt, DollarSign, FileSpreadsheet, Loader } from 'lucide-react';
import { portfoliosAPI } from '../../services/api';
import './ExportModal.css';

const ExportModal = ({ isOpen, onClose, portfolioId, portfolioName }) => {
  const [loading, setLoading] = useState({});
  const [transactionFilters, setTransactionFilters] = useState({
    startDate: '',
    endDate: '',
    type: ''
  });
  const [taxYear, setTaxYear] = useState(new Date().getFullYear());
  const [dividendYear, setDividendYear] = useState(new Date().getFullYear());
  const [expandedCard, setExpandedCard] = useState(null);

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 10 }, (_, i) => currentYear - i);

  // Close on escape key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

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
        case 'summary':
          // Summary is JSON - fetch and download
          const response = await portfoliosAPI.exportSummaryJson(portfolioId);
          const blob = new Blob([JSON.stringify(response.data, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${portfolioName?.replace(/\s+/g, '_') || 'portfolio'}_summary_${new Date().toISOString().split('T')[0]}.json`;
          a.click();
          URL.revokeObjectURL(url);
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

  const toggleExpanded = (cardId) => {
    setExpandedCard(expandedCard === cardId ? null : cardId);
  };

  const exportOptions = [
    {
      id: 'holdings',
      icon: FileSpreadsheet,
      iconColor: '#10b981',
      title: 'Holdings Report',
      description: 'Current positions with cost basis, market value, and performance metrics',
      format: 'CSV',
      hasOptions: false
    },
    {
      id: 'transactions',
      icon: Receipt,
      iconColor: '#6366f1',
      title: 'Transaction History',
      description: 'All buys, sells, deposits, withdrawals, and dividends',
      format: 'CSV',
      hasOptions: true,
      renderOptions: () => (
        <div className="export-options-form">
          <div className="filter-group">
            <label>Date Range</label>
            <div className="date-inputs">
              <input
                type="date"
                placeholder="From"
                value={transactionFilters.startDate}
                onChange={(e) => setTransactionFilters(prev => ({ ...prev, startDate: e.target.value }))}
              />
              <span className="date-separator">to</span>
              <input
                type="date"
                placeholder="To"
                value={transactionFilters.endDate}
                onChange={(e) => setTransactionFilters(prev => ({ ...prev, endDate: e.target.value }))}
              />
            </div>
          </div>
          <div className="filter-group">
            <label>Transaction Type</label>
            <select
              value={transactionFilters.type}
              onChange={(e) => setTransactionFilters(prev => ({ ...prev, type: e.target.value }))}
            >
              <option value="">All Types</option>
              <option value="buy">Buys Only</option>
              <option value="sell">Sells Only</option>
              <option value="deposit">Deposits Only</option>
              <option value="withdraw">Withdrawals Only</option>
              <option value="dividend">Dividends Only</option>
            </select>
          </div>
        </div>
      )
    },
    {
      id: 'summary',
      icon: FileText,
      iconColor: '#f59e0b',
      title: 'Portfolio Summary',
      description: 'Complete portfolio snapshot including metrics, allocations, and trading stats',
      format: 'JSON',
      hasOptions: false
    },
    {
      id: 'tax',
      icon: FileText,
      iconColor: '#ef4444',
      title: 'Tax Report',
      description: 'Realized gains/losses with short-term vs long-term classification',
      format: 'CSV',
      hasOptions: true,
      renderOptions: () => (
        <div className="export-options-form">
          <div className="filter-group">
            <label>Tax Year</label>
            <select
              value={taxYear}
              onChange={(e) => setTaxYear(parseInt(e.target.value))}
            >
              {years.map(year => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </div>
        </div>
      )
    },
    {
      id: 'dividends',
      icon: DollarSign,
      iconColor: '#22c55e',
      title: 'Dividend Report',
      description: 'Dividend income by stock for tax purposes',
      format: 'CSV',
      hasOptions: true,
      renderOptions: () => (
        <div className="export-options-form">
          <div className="filter-group">
            <label>Year</label>
            <select
              value={dividendYear}
              onChange={(e) => setDividendYear(parseInt(e.target.value))}
            >
              {years.map(year => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </div>
        </div>
      )
    }
  ];

  return (
    <div className="export-modal-overlay" onClick={onClose}>
      <div className="export-modal" onClick={e => e.stopPropagation()}>
        <div className="export-modal-header">
          <div className="export-modal-title">
            <Download size={20} />
            <h3>Export Portfolio Data</h3>
          </div>
          <button className="export-modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="export-modal-subtitle">
          Choose an export format for <strong>{portfolioName || 'your portfolio'}</strong>
        </div>

        <div className="export-modal-body">
          {exportOptions.map((option) => {
            const Icon = option.icon;
            const isExpanded = expandedCard === option.id;
            const isLoading = loading[option.id];

            return (
              <div
                key={option.id}
                className={`export-option-card ${isExpanded ? 'expanded' : ''}`}
              >
                <div className="export-option-main">
                  <div
                    className="export-option-icon"
                    style={{ backgroundColor: `${option.iconColor}15`, color: option.iconColor }}
                  >
                    <Icon size={20} />
                  </div>
                  <div className="export-option-content">
                    <div className="export-option-header">
                      <h4>{option.title}</h4>
                      <span className="export-format-badge">{option.format}</span>
                    </div>
                    <p>{option.description}</p>
                    {option.hasOptions && (
                      <button
                        className="options-toggle"
                        onClick={() => toggleExpanded(option.id)}
                      >
                        {isExpanded ? 'Hide options' : 'Show options'}
                      </button>
                    )}
                  </div>
                  <button
                    className="export-download-btn"
                    onClick={() => handleExport(option.id)}
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <>
                        <Loader size={16} className="spin" />
                        <span>Exporting...</span>
                      </>
                    ) : (
                      <>
                        <Download size={16} />
                        <span>Download</span>
                      </>
                    )}
                  </button>
                </div>
                {option.hasOptions && isExpanded && (
                  <div className="export-option-expanded">
                    {option.renderOptions()}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="export-modal-footer">
          <p>All exports are generated from your current portfolio data. For tax purposes, please consult a tax professional.</p>
        </div>
      </div>
    </div>
  );
};

export default ExportModal;
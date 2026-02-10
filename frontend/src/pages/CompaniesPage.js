// frontend/src/pages/CompaniesPage.js
// Browse all companies page
import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { companyAPI } from '../services/api';
import { useWatchlist } from '../context/WatchlistContext';
import { SelectionActionBar, WatchlistButton } from '../components';
import { PageHeader, EmptyState } from '../components/ui';
import { Search, ChevronUp, ChevronDown, Building2 } from '../components/icons';
import { useAskAI } from '../hooks/useAskAI';
import './CompaniesPage.css';

function CompaniesPage() {
  const { addToWatchlist } = useWatchlist();

  // Ask AI context menu
  const askAIProps = useAskAI(() => ({
    type: 'metric',
    metric: 'companies',
    label: 'All Companies'
  }));

  // Data state
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Selection state
  const [selectedSymbols, setSelectedSymbols] = useState([]);

  // Sorting state
  const [sortBy, setSortBy] = useState('symbol');
  const [sortOrder, setSortOrder] = useState('asc');

  // Filtering state
  const [searchQuery, setSearchQuery] = useState('');
  const [sectorFilter, setSectorFilter] = useState('');

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const ROWS_PER_PAGE = 50;

  // Load all companies on mount
  useEffect(() => {
    const loadCompanies = async () => {
      try {
        setLoading(true);
        const response = await companyAPI.getAll();
        setCompanies(response.data.companies || []);
        setError(null);
      } catch (err) {
        console.error('Error loading companies:', err);
        setError('Failed to load companies');
      } finally {
        setLoading(false);
      }
    };
    loadCompanies();
  }, []);

  // Get unique sectors for filter dropdown
  const sectors = useMemo(() => {
    return [...new Set(companies.map(c => c.sector).filter(Boolean))].sort();
  }, [companies]);

  // Filter and sort companies
  const filteredCompanies = useMemo(() => {
    return companies
      .filter(c => {
        const matchesSearch = !searchQuery ||
          c.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
          c.name?.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesSector = !sectorFilter || c.sector === sectorFilter;
        return matchesSearch && matchesSector;
      })
      .sort((a, b) => {
        const aVal = a[sortBy] || '';
        const bVal = b[sortBy] || '';
        const comparison = typeof aVal === 'string'
          ? aVal.localeCompare(bVal)
          : aVal - bVal;
        return sortOrder === 'asc' ? comparison : -comparison;
      });
  }, [companies, searchQuery, sectorFilter, sortBy, sortOrder]);

  // Paginate
  const paginatedCompanies = useMemo(() => {
    const start = (currentPage - 1) * ROWS_PER_PAGE;
    return filteredCompanies.slice(start, start + ROWS_PER_PAGE);
  }, [filteredCompanies, currentPage]);

  const totalPages = Math.ceil(filteredCompanies.length / ROWS_PER_PAGE);

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, sectorFilter]);

  // Handle column header click for sorting
  const handleSort = useCallback((column) => {
    if (sortBy === column) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder(column === 'symbol' || column === 'name' ? 'asc' : 'desc');
    }
  }, [sortBy]);

  // Selection handlers
  const handleToggleSelect = useCallback((symbol) => {
    setSelectedSymbols(prev =>
      prev.includes(symbol) ? prev.filter(s => s !== symbol) : [...prev, symbol]
    );
  }, []);

  const handleToggleSelectAll = useCallback(() => {
    const pageSymbols = paginatedCompanies.map(c => c.symbol);
    const allSelected = pageSymbols.every(s => selectedSymbols.includes(s));
    if (allSelected) {
      setSelectedSymbols(prev => prev.filter(s => !pageSymbols.includes(s)));
    } else {
      setSelectedSymbols(prev => [...new Set([...prev, ...pageSymbols])]);
    }
  }, [paginatedCompanies, selectedSymbols]);

  const handleClearSelection = useCallback(() => {
    setSelectedSymbols([]);
  }, []);

  const handleBulkAddToWatchlist = useCallback(() => {
    selectedSymbols.forEach(symbol => {
      const company = companies.find(c => c.symbol === symbol);
      if (company) {
        addToWatchlist(company.symbol, company.name, company.sector, company.company_id);
      }
    });
    setSelectedSymbols([]);
  }, [selectedSymbols, companies, addToWatchlist]);

  // Export selected to CSV
  const handleExportSelected = useCallback(() => {
    if (selectedSymbols.length === 0) return;

    const selected = companies.filter(c => selectedSymbols.includes(c.symbol));
    const headers = ['Symbol', 'Name', 'Sector', 'Industry', 'Country'];
    const rows = selected.map(c => [
      c.symbol || '',
      `"${(c.name || '').replace(/"/g, '""')}"`,
      c.sector || '',
      `"${(c.industry || '').replace(/"/g, '""')}"`,
      c.country || ''
    ]);

    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `companies_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setSelectedSymbols([]);
  }, [selectedSymbols, companies]);

  if (loading) {
    return (
      <div className="companies-page" {...askAIProps}>
        <PageHeader
          title="All Companies"
          subtitle="Loading..."
        />
        <div className="companies-loading">
          <div className="loading-spinner"></div>
          <p>Loading companies...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="companies-page" {...askAIProps}>
        <PageHeader title="All Companies" />
        <EmptyState
          icon={Building2}
          title="Error Loading Companies"
          description={error}
        />
      </div>
    );
  }

  return (
    <div className="companies-page" {...askAIProps}>
      <PageHeader
        title="All Companies"
        subtitle={`${filteredCompanies.length.toLocaleString()} companies`}
      />

      {/* Filters */}
      <div className="companies-filters">
        <div className="search-wrapper">
          <Search size={16} className="search-icon" />
          <input
            type="text"
            placeholder="Search by symbol or name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
          />
        </div>
        <select
          value={sectorFilter}
          onChange={(e) => setSectorFilter(e.target.value)}
          className="sector-filter"
        >
          <option value="">All Sectors</option>
          {sectors.map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        {(searchQuery || sectorFilter) && (
          <button
            className="clear-filters-btn"
            onClick={() => {
              setSearchQuery('');
              setSectorFilter('');
            }}
          >
            Clear Filters
          </button>
        )}
      </div>

      {/* Selection Action Bar */}
      <SelectionActionBar
        selectedItems={selectedSymbols}
        onClear={handleClearSelection}
        showWatchlist={true}
        onAddToWatchlist={handleBulkAddToWatchlist}
        showExport={true}
        onExport={handleExportSelected}
      />

      {/* Results Table */}
      {filteredCompanies.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No Companies Found"
          description="Try adjusting your search or filters"
        />
      ) : (
        <>
          <div className="companies-table-wrapper">
            <table className="companies-table">
              <thead>
                <tr>
                  <th className="select-col">
                    <input
                      type="checkbox"
                      checked={paginatedCompanies.length > 0 && paginatedCompanies.every(c => selectedSymbols.includes(c.symbol))}
                      ref={el => {
                        if (el) {
                          const pageSymbols = paginatedCompanies.map(c => c.symbol);
                          const selectedOnPage = pageSymbols.filter(s => selectedSymbols.includes(s)).length;
                          el.indeterminate = selectedOnPage > 0 && selectedOnPage < pageSymbols.length;
                        }
                      }}
                      onChange={handleToggleSelectAll}
                      title="Select all on this page"
                    />
                  </th>
                  <th className="sortable" onClick={() => handleSort('symbol')}>
                    Symbol
                    {sortBy === 'symbol' && (
                      sortOrder === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                    )}
                  </th>
                  <th className="sortable" onClick={() => handleSort('name')}>
                    Company Name
                    {sortBy === 'name' && (
                      sortOrder === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                    )}
                  </th>
                  <th className="sortable" onClick={() => handleSort('sector')}>
                    Sector
                    {sortBy === 'sector' && (
                      sortOrder === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                    )}
                  </th>
                  <th className="sortable" onClick={() => handleSort('industry')}>
                    Industry
                    {sortBy === 'industry' && (
                      sortOrder === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                    )}
                  </th>
                  <th className="sortable" onClick={() => handleSort('country')}>
                    Country
                    {sortBy === 'country' && (
                      sortOrder === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                    )}
                  </th>
                  <th className="actions-col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedCompanies.map(company => {
                  const isSelected = selectedSymbols.includes(company.symbol);
                  return (
                    <tr key={company.symbol} className={isSelected ? 'selected-row' : ''}>
                      <td className="select-col">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelect(company.symbol)}
                        />
                      </td>
                      <td>
                        <Link to={`/company/${company.symbol}`} className="symbol-link">
                          {company.symbol}
                        </Link>
                      </td>
                      <td className="company-name">{company.name}</td>
                      <td>{company.sector || '-'}</td>
                      <td className="industry-cell">{company.industry || '-'}</td>
                      <td>{company.country || '-'}</td>
                      <td className="actions-col">
                        <WatchlistButton
                          symbol={company.symbol}
                          name={company.name}
                          sector={company.sector}
                          size="small"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="pagination-controls">
              <button
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                className="pagination-btn"
              >
                First
              </button>
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="pagination-btn"
              >
                Previous
              </button>
              <span className="pagination-info">
                Page {currentPage} of {totalPages} ({filteredCompanies.length.toLocaleString()} companies)
              </span>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="pagination-btn"
              >
                Next
              </button>
              <button
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
                className="pagination-btn"
              >
                Last
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default CompaniesPage;

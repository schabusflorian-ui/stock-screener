// frontend/src/components/SortableTable.js
import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useContextMenu } from '../context/ContextMenuContext';
import './SortableTable.css';

/**
 * Reusable sortable table component with filtering
 *
 * Props:
 * - data: array of objects
 * - columns: array of { key, label, format?, sortable?, linkTo?, className?, filterable? }
 * - defaultSort: { key, direction: 'asc' | 'desc' }
 * - onRowClick: (row) => void
 * - rowClassName: (row) => string
 * - emptyMessage: string
 * - searchable: boolean - show search input
 * - searchKeys: array of keys to search in (defaults to all string/symbol columns)
 * - searchPlaceholder: string
 */
function SortableTable({
  data = [],
  columns = [],
  defaultSort = null,
  onRowClick,
  rowClassName,
  emptyMessage = 'No data available',
  searchable = false,
  searchKeys = null,
  searchPlaceholder = 'Search...',
  enableAskAI = true // Enable right-click "Ask AI" by default
}) {
  const [sortConfig, setSortConfig] = useState(
    defaultSort || { key: null, direction: 'asc' }
  );
  const [searchTerm, setSearchTerm] = useState('');
  const { showMenu } = useContextMenu();

  // Handle row right-click for Ask AI
  const handleRowContextMenu = (e, row) => {
    if (!enableAskAI) return;
    e.preventDefault();
    showMenu(e.clientX, e.clientY, {
      type: 'table_row',
      symbol: row.symbol || row.ticker,
      companyName: row.name || row.companyName || row.company,
      ...row
    });
  };

  // Handle sort
  const handleSort = (key) => {
    const column = columns.find(c => c.key === key);
    if (column?.sortable === false) return;

    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  // Filter data
  const filteredData = useMemo(() => {
    if (!searchTerm.trim()) return data;

    const term = searchTerm.toLowerCase();
    const keysToSearch = searchKeys || columns
      .filter(c => c.filterable !== false && ['symbol', 'name', 'company', 'sector', 'industry'].includes(c.key))
      .map(c => c.key);

    // If no searchable keys defined, search symbol and name by default
    const defaultKeys = keysToSearch.length > 0 ? keysToSearch : ['symbol', 'name'];

    return data.filter(row =>
      defaultKeys.some(key => {
        const val = row[key];
        return val && String(val).toLowerCase().includes(term);
      })
    );
  }, [data, searchTerm, searchKeys, columns]);

  // Sort data
  const sortedData = useMemo(() => {
    if (!sortConfig.key) return filteredData;

    return [...filteredData].sort((a, b) => {
      const aVal = a[sortConfig.key];
      const bVal = b[sortConfig.key];

      // Handle null/undefined
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;

      // Compare
      let comparison = 0;
      if (typeof aVal === 'string') {
        comparison = aVal.localeCompare(bVal);
      } else {
        comparison = aVal - bVal;
      }

      return sortConfig.direction === 'desc' ? -comparison : comparison;
    });
  }, [filteredData, sortConfig]);

  // Format value based on column config
  const formatValue = (value, format) => {
    if (value === null || value === undefined) return '-';

    switch (format) {
      case 'percent':
        return `${Number(value).toFixed(1)}%`;
      case 'ratio':
        return Number(value).toFixed(2);
      case 'currency':
        if (Math.abs(value) >= 1e3) return `$${Number(value).toFixed(0)}B`;
        return `$${Number(value).toFixed(1)}B`;
      case 'number':
        return Number(value).toLocaleString();
      case 'integer':
        return Math.round(value).toLocaleString();
      default:
        return value;
    }
  };

  // Get value class for coloring
  const getValueClass = (value, thresholds) => {
    if (value == null || !thresholds) return '';
    const { good, bad } = thresholds;
    if (good !== undefined && value >= good) return 'positive';
    if (bad !== undefined && value <= bad) return 'negative';
    return '';
  };

  // Get sort indicator
  const getSortIndicator = (key) => {
    if (sortConfig.key !== key) return '↕';
    return sortConfig.direction === 'asc' ? '↑' : '↓';
  };

  if (!data.length) {
    return <div className="sortable-table-empty">{emptyMessage}</div>;
  }

  return (
    <div className="sortable-table-container">
      {searchable && (
        <div className="sortable-table-search">
          <input
            type="text"
            placeholder={searchPlaceholder}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
          {searchTerm && (
            <span className="search-results-count">
              {sortedData.length} of {data.length}
            </span>
          )}
        </div>
      )}
      <div className="sortable-table-wrapper">
        <table className="sortable-table">
        <thead>
          <tr>
            {columns.map(col => (
              <th
                key={col.key}
                className={`${col.className || ''} ${col.sortable !== false ? 'sortable' : ''}`}
                onClick={() => col.sortable !== false && handleSort(col.key)}
              >
                <span className="th-content">
                  {col.label}
                  {col.sortable !== false && (
                    <span className={`sort-indicator ${sortConfig.key === col.key ? 'active' : ''}`}>
                      {getSortIndicator(col.key)}
                    </span>
                  )}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedData.map((row, idx) => (
            <tr
              key={row.id || row.symbol || idx}
              className={`${rowClassName ? rowClassName(row) : ''} ${onRowClick ? 'clickable' : ''}`}
              onClick={() => onRowClick && onRowClick(row)}
              onContextMenu={(e) => handleRowContextMenu(e, row)}
              data-ask-ai={enableAskAI ? 'true' : undefined}
            >
              {columns.map(col => {
                const value = row[col.key];
                const formatted = formatValue(value, col.format);
                const valueClass = getValueClass(value, col.thresholds);

                // Handle link columns
                if (col.linkTo) {
                  const linkPath = typeof col.linkTo === 'function' ? col.linkTo(row) : col.linkTo;
                  return (
                    <td key={col.key} className={`${col.className || ''} ${valueClass}`}>
                      <Link to={linkPath} className="table-link" onClick={e => e.stopPropagation()}>
                        {formatted}
                      </Link>
                    </td>
                  );
                }

                // Handle render function
                if (col.render) {
                  return (
                    <td key={col.key} className={col.className || ''}>
                      {col.render(row, value)}
                    </td>
                  );
                }

                return (
                  <td key={col.key} className={`${col.className || ''} ${valueClass}`}>
                    {formatted}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
        </table>
      </div>
    </div>
  );
}

export default SortableTable;

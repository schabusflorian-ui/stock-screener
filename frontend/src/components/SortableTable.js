// frontend/src/components/SortableTable.js
import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import './SortableTable.css';

/**
 * Reusable sortable table component with filtering
 *
 * Props:
 * - data: array of objects
 * - columns: array of { key, label, format?, sortable?, linkTo?, className? }
 * - defaultSort: { key, direction: 'asc' | 'desc' }
 * - onRowClick: (row) => void
 * - rowClassName: (row) => string
 * - emptyMessage: string
 */
function SortableTable({
  data = [],
  columns = [],
  defaultSort = null,
  onRowClick,
  rowClassName,
  emptyMessage = 'No data available'
}) {
  const [sortConfig, setSortConfig] = useState(
    defaultSort || { key: null, direction: 'asc' }
  );

  // Handle sort
  const handleSort = (key) => {
    const column = columns.find(c => c.key === key);
    if (column?.sortable === false) return;

    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  // Sort data
  const sortedData = useMemo(() => {
    if (!sortConfig.key) return data;

    return [...data].sort((a, b) => {
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
  }, [data, sortConfig]);

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
  );
}

export default SortableTable;

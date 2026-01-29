// frontend/src/components/ui/VirtualizedTable.js
// Virtualized table component using react-window for efficient rendering of large datasets
// Renders only visible rows, dramatically improving performance for 100+ row tables

import React, { useRef, useCallback } from 'react';
import { List } from 'react-window';
import './VirtualizedTable.css';

/**
 * VirtualizedTable - Efficiently renders large tables using windowing
 *
 * @param {Object} props
 * @param {Array} props.data - Array of data items to render
 * @param {Array} props.columns - Column definitions [{key, header, width, align, render}]
 * @param {number} props.rowHeight - Height of each row in pixels (default: 48)
 * @param {number} props.maxHeight - Maximum table height before scrolling (default: 600)
 * @param {Function} props.onRowClick - Optional click handler for rows
 * @param {Function} props.onRowContextMenu - Optional right-click handler for rows
 * @param {Function} props.getRowClassName - Optional function to add class to rows
 * @param {string} props.className - Additional CSS class for the table
 * @param {React.ReactNode} props.emptyState - Content to show when data is empty
 */
function VirtualizedTable({
  data = [],
  columns = [],
  rowHeight = 48,
  maxHeight = 600,
  onRowClick,
  onRowContextMenu,
  getRowClassName,
  className = '',
  emptyState = null,
  headerClassName = '',
}) {
  const listRef = useRef(null);

  // Calculate total width and individual column widths
  const totalWidth = columns.reduce((sum, col) => sum + (col.width || 100), 0);

  // Row renderer for react-window
  const Row = useCallback(({ index, style }) => {
    const item = data[index];
    const rowClass = getRowClassName ? getRowClassName(item, index) : '';

    return (
      <div
        className={`vt-row ${index % 2 === 0 ? 'even' : 'odd'} ${rowClass}`}
        style={style}
        onClick={onRowClick ? (e) => onRowClick(item, index, e) : undefined}
        onContextMenu={onRowContextMenu ? (e) => onRowContextMenu(item, index, e) : undefined}
        data-ask-ai="true"
      >
        {columns.map((col, colIndex) => (
          <div
            key={col.key || colIndex}
            className={`vt-cell ${col.align || 'left'}`}
            style={{ width: col.width || 100, minWidth: col.minWidth }}
          >
            {col.render ? col.render(item, index) : item[col.key]}
          </div>
        ))}
      </div>
    );
  }, [data, columns, onRowClick, onRowContextMenu, getRowClassName]);

  // Calculate list height
  const listHeight = Math.min(data.length * rowHeight, maxHeight);

  // If data is small enough, render without virtualization
  const VIRTUALIZATION_THRESHOLD = 50;
  const shouldVirtualize = data.length > VIRTUALIZATION_THRESHOLD;

  if (data.length === 0) {
    return (
      <div className={`virtualized-table ${className}`}>
        <div className="vt-header-row">
          {columns.map((col, index) => (
            <div
              key={col.key || index}
              className={`vt-header-cell ${col.align || 'left'} ${col.sortable ? 'sortable' : ''}`}
              style={{ width: col.width || 100, minWidth: col.minWidth }}
              onClick={col.onHeaderClick}
            >
              {col.header}
              {col.sortIcon}
            </div>
          ))}
        </div>
        <div className="vt-empty">
          {emptyState || <p>No data available</p>}
        </div>
      </div>
    );
  }

  return (
    <div className={`virtualized-table ${className}`}>
      {/* Fixed header */}
      <div className={`vt-header-row ${headerClassName}`}>
        {columns.map((col, index) => (
          <div
            key={col.key || index}
            className={`vt-header-cell ${col.align || 'left'} ${col.sortable ? 'sortable' : ''}`}
            style={{ width: col.width || 100, minWidth: col.minWidth }}
            onClick={col.onHeaderClick}
          >
            {col.header}
            {col.sortIcon}
          </div>
        ))}
      </div>

      {/* Virtualized body */}
      <div className="vt-body">
        {shouldVirtualize ? (
          <List
            ref={listRef}
            height={listHeight}
            itemCount={data.length}
            itemSize={rowHeight}
            width="100%"
            overscanCount={5}
          >
            {Row}
          </List>
        ) : (
          // For small datasets, render without virtualization for simpler DOM
          <div className="vt-simple-body" style={{ maxHeight }}>
            {data.map((item, index) => (
              <div
                key={index}
                className={`vt-row ${index % 2 === 0 ? 'even' : 'odd'} ${getRowClassName ? getRowClassName(item, index) : ''}`}
                style={{ height: rowHeight }}
                onClick={onRowClick ? (e) => onRowClick(item, index, e) : undefined}
                onContextMenu={onRowContextMenu ? (e) => onRowContextMenu(item, index, e) : undefined}
                data-ask-ai="true"
              >
                {columns.map((col, colIndex) => (
                  <div
                    key={col.key || colIndex}
                    className={`vt-cell ${col.align || 'left'}`}
                    style={{ width: col.width || 100, minWidth: col.minWidth }}
                  >
                    {col.render ? col.render(item, index) : item[col.key]}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Row count indicator for large tables */}
      {shouldVirtualize && (
        <div className="vt-footer">
          <span className="vt-row-count">
            Showing {Math.min(Math.ceil(listHeight / rowHeight), data.length)} of {data.length} rows
          </span>
        </div>
      )}
    </div>
  );
}

export default VirtualizedTable;

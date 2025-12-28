// frontend/src/components/ui/Table.js
import React from 'react';
import PropTypes from 'prop-types';
import './Table.css';

/**
 * Table Component
 *
 * Consistent table styling with header, body, rows, and cells.
 * Supports hover states and clickable rows.
 */
function Table({ className = '', children, ...props }) {
  return (
    <div className={`ui-table-container ${className}`}>
      <table className="ui-table" {...props}>
        {children}
      </table>
    </div>
  );
}

Table.propTypes = {
  className: PropTypes.string,
  children: PropTypes.node.isRequired
};

// Table Header
function TableHeader({ className = '', children, ...props }) {
  return (
    <thead className={`ui-table__header ${className}`} {...props}>
      {children}
    </thead>
  );
}

TableHeader.propTypes = {
  className: PropTypes.string,
  children: PropTypes.node.isRequired
};

// Table Body
function TableBody({ className = '', children, ...props }) {
  return (
    <tbody className={`ui-table__body ${className}`} {...props}>
      {children}
    </tbody>
  );
}

TableBody.propTypes = {
  className: PropTypes.string,
  children: PropTypes.node.isRequired
};

// Table Row
function TableRow({ className = '', onClick, children, ...props }) {
  const classes = [
    'ui-table__row',
    onClick && 'ui-table__row--clickable',
    className
  ].filter(Boolean).join(' ');

  return (
    <tr className={classes} onClick={onClick} {...props}>
      {children}
    </tr>
  );
}

TableRow.propTypes = {
  className: PropTypes.string,
  onClick: PropTypes.func,
  children: PropTypes.node.isRequired
};

// Table Head Cell
function TableHead({ align = 'left', className = '', children, ...props }) {
  return (
    <th className={`ui-table__th ui-table__th--${align} ${className}`} {...props}>
      {children}
    </th>
  );
}

TableHead.propTypes = {
  align: PropTypes.oneOf(['left', 'center', 'right']),
  className: PropTypes.string,
  children: PropTypes.node
};

// Table Data Cell
function TableCell({ align = 'left', className = '', children, ...props }) {
  return (
    <td className={`ui-table__td ui-table__td--${align} ${className}`} {...props}>
      {children}
    </td>
  );
}

TableCell.propTypes = {
  align: PropTypes.oneOf(['left', 'center', 'right']),
  className: PropTypes.string,
  children: PropTypes.node
};

// Attach subcomponents
Table.Header = TableHeader;
Table.Body = TableBody;
Table.Row = TableRow;
Table.Head = TableHead;
Table.Cell = TableCell;

export default Table;

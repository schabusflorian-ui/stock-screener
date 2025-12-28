import React, { memo, useMemo } from 'react';
import PropTypes from 'prop-types';
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, ReferenceLine
} from 'recharts';

/**
 * ScatterPlotChart - Scatter plot with regression line
 */
function ScatterPlotChart({ data, xLabel, yLabel, companies, colors }) {
  // Calculate regression line
  const regressionLine = useMemo(() => {
    if (!data || data.length < 2) return null;

    const xValues = data.map(d => d.x);
    const yValues = data.map(d => d.y);
    const n = data.length;
    const xMean = xValues.reduce((s, v) => s + v, 0) / n;
    const yMean = yValues.reduce((s, v) => s + v, 0) / n;

    let numerator = 0, denominator = 0;
    for (let i = 0; i < n; i++) {
      numerator += (xValues[i] - xMean) * (yValues[i] - yMean);
      denominator += Math.pow(xValues[i] - xMean, 2);
    }
    const slope = denominator !== 0 ? numerator / denominator : 0;
    const intercept = yMean - slope * xMean;

    const xMin = Math.min(...xValues);
    const xMax = Math.max(...xValues);

    return [
      { x: xMin, y: intercept + slope * xMin },
      { x: xMax, y: intercept + slope * xMax }
    ];
  }, [data]);

  if (!data || data.length === 0) {
    return <div className="empty-scatter">No data available for scatter plot</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={350}>
      <ScatterChart margin={{ top: 20, right: 30, bottom: 20, left: 20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(0, 0, 0, 0.08)" />
        <XAxis
          dataKey="x"
          type="number"
          name={xLabel}
          stroke="rgba(0, 0, 0, 0.2)"
          tick={{ fill: '#6b7280', fontSize: 11 }}
          label={{ value: xLabel, position: 'bottom', fill: '#6b7280', fontSize: 12 }}
        />
        <YAxis
          dataKey="y"
          type="number"
          name={yLabel}
          stroke="rgba(0, 0, 0, 0.2)"
          tick={{ fill: '#6b7280', fontSize: 11 }}
          label={{ value: yLabel, angle: -90, position: 'left', fill: '#6b7280', fontSize: 12 }}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            border: '1px solid rgba(0, 0, 0, 0.1)',
            borderRadius: '0.5rem',
            backdropFilter: 'blur(8px)'
          }}
          formatter={(value, name) => [value?.toFixed(2), name]}
          labelFormatter={(_, payload) => payload[0]?.payload?.label || ''}
        />
        {regressionLine && (
          <ReferenceLine
            segment={regressionLine}
            stroke="#8b5cf6"
            strokeWidth={2}
            strokeDasharray="5 5"
          />
        )}
        <Scatter data={data} fill="#8b5cf6">
          {data.map((entry, index) => {
            const companyIdx = companies.indexOf(entry.symbol);
            return (
              <Cell
                key={index}
                fill={colors[companyIdx % colors.length] || '#8b5cf6'}
              />
            );
          })}
        </Scatter>
      </ScatterChart>
    </ResponsiveContainer>
  );
}

ScatterPlotChart.propTypes = {
  data: PropTypes.arrayOf(PropTypes.shape({
    x: PropTypes.number,
    y: PropTypes.number,
    symbol: PropTypes.string,
    label: PropTypes.string
  })),
  xLabel: PropTypes.string,
  yLabel: PropTypes.string,
  companies: PropTypes.arrayOf(PropTypes.string),
  colors: PropTypes.arrayOf(PropTypes.string)
};

ScatterPlotChart.defaultProps = {
  data: [],
  xLabel: 'X',
  yLabel: 'Y',
  companies: [],
  colors: ['#8b5cf6', '#3b82f6', '#22c55e', '#f59e0b', '#ef4444']
};

export default memo(ScatterPlotChart);

import { useState, useEffect, useMemo, useCallback, memo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Star, Download, Trash2, Eye, X, TrendingUp, TrendingDown, Lock } from '../components/icons';
import { companyAPI, pricesAPI, indicesAPI, prismAPI } from '../services/api';
import { useWatchlist } from '../context/WatchlistContext';
import { useSubscription } from '../context/SubscriptionContext';
import { AlphaCompareChart, SelectionActionBar } from '../components';
import { AddToPortfolioButton } from '../components/portfolio';
import PriceAlertButton from '../components/PriceAlertButton';
import WatchlistAlertNotifications from '../components/WatchlistAlertNotifications';
import { NLQueryBar } from '../components/nl';
import { SkeletonWatchlist } from '../components/Skeleton';
import { useFormatters } from '../hooks/useFormatters';
import { useAskAI, AskAIProvider } from '../hooks';
import { LockedIndicator } from '../components/subscription';
import {
  PageHeader,
  Section,
  Card,
  Grid,
  DataCard,
  Table,
  Button,
  EmptyState
} from '../components/ui';
import './WatchlistPage.css';

// Watchlist row with Ask AI support
const WatchlistRow = ({
  item, metrics, prices, alpha, prismScore, isSelected, handleToggleSelect, formatValue, fmt, navigate, removeFromWatchlist
}) => {
  const { hasFeature, isGrandfatheredActive } = useSubscription();
  const canSeePrism = hasFeature('prism_reports') || isGrandfatheredActive;

  const askAIProps = useAskAI(() => ({
    type: 'table_row',
    symbol: item.symbol,
    label: `${item.symbol} - ${item.name}`,
    data: { roic: metrics.roic, roe: metrics.roe, fcfYield: metrics.fcf_yield }
  }));

  return (
    <Table.Row
      className={isSelected ? 'selected' : ''}
      onClick={(e) => {
        if (e.target.closest('a, button, input')) return;
        handleToggleSelect(item.symbol);
      }}
      style={{ cursor: 'pointer' }}
      {...askAIProps}
    >
      <Table.Cell className="checkbox-col" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => handleToggleSelect(item.symbol)}
        />
      </Table.Cell>
      <Table.Cell>
        <Link to={`/company/${item.symbol}`} className="symbol-link">
          {item.symbol}
        </Link>
      </Table.Cell>
      <Table.Cell className="name-cell">{item.name}</Table.Cell>
      <Table.Cell align="right" className="price-cell">
        {prices.last_price ? `$${prices.last_price.toFixed(2)}` : '-'}
      </Table.Cell>
      <Table.Cell align="right" className={`change-cell ${prices.change_1d > 0 ? 'positive' : prices.change_1d < 0 ? 'negative' : ''}`}>
        {prices.change_1d != null ? `${prices.change_1d > 0 ? '+' : ''}${prices.change_1d.toFixed(1)}%` : '-'}
      </Table.Cell>
      <Table.Cell align="right" className={`change-cell ${prices.change_1w > 0 ? 'positive' : prices.change_1w < 0 ? 'negative' : ''}`}>
        {prices.change_1w != null ? `${prices.change_1w > 0 ? '+' : ''}${prices.change_1w.toFixed(1)}%` : '-'}
      </Table.Cell>
      <Table.Cell align="right" className={`change-cell ${prices.change_1m > 0 ? 'positive' : prices.change_1m < 0 ? 'negative' : ''}`}>
        {prices.change_1m != null ? `${prices.change_1m > 0 ? '+' : ''}${prices.change_1m.toFixed(1)}%` : '-'}
      </Table.Cell>
      <Table.Cell align="right" className={`numeric-cell ${metrics.roic > 15 ? 'positive' : ''}`}>
        {formatValue(metrics.roic, 'percent')}
      </Table.Cell>
      <Table.Cell align="right" className={`numeric-cell ${metrics.roe > 15 ? 'positive' : ''}`}>
        {formatValue(metrics.roe, 'percent')}
      </Table.Cell>
      <Table.Cell align="right" className={`numeric-cell ${metrics.net_margin > 10 ? 'positive' : ''}`}>
        {formatValue(metrics.net_margin, 'percent')}
      </Table.Cell>
      <Table.Cell align="right" className={`numeric-cell ${metrics.fcf_yield > 5 ? 'positive' : ''}`}>
        {formatValue(metrics.fcf_yield, 'percent')}
      </Table.Cell>
      <Table.Cell align="center" className="prism-cell">
        {canSeePrism ? (
          prismScore ? (
            <span className={`prism-badge ${
              prismScore >= 4 ? 'excellent' :
              prismScore >= 3 ? 'good' :
              prismScore >= 2 ? 'fair' : 'poor'
            }`}>
              {prismScore.toFixed(1)}
            </span>
          ) : (
            <span className="prism-badge none">-</span>
          )
        ) : (
          <LockedIndicator feature="prism_reports" variant="badge" size="small" />
        )}
      </Table.Cell>
      <Table.Cell className="date-cell">
        {fmt.date(item.addedAt)}
      </Table.Cell>
      <Table.Cell>
        <div className="action-buttons">
          <PriceAlertButton
            symbol={item.symbol}
            currentPrice={prices.last_price}
          />
          <AddToPortfolioButton
            symbol={item.symbol}
            companyId={item.companyId}
            companyName={item.name}
            currentPrice={prices.last_price}
          />
          <Button
            variant="ghost"
            size="sm"
            icon={Eye}
            onClick={() => navigate(`/company/${item.symbol}`)}
          />
          <Button
            variant="ghost"
            size="sm"
            icon={X}
            onClick={() => removeFromWatchlist(item.symbol)}
          />
        </div>
      </Table.Cell>
    </Table.Row>
  );
};

function WatchlistPage() {
  const fmt = useFormatters();

  // Ask AI context menu for watchlist
  const askAIProps = useAskAI(() => ({
    type: 'metric',
    metric: 'watchlist',
    label: 'Watchlist'
  }));

  // Format value using preferences
  const formatValue = (value, format) => {
    if (value === null || value === undefined) return '-';
    switch (format) {
      case 'percent': return fmt.percent(value, { decimals: 1 });
      case 'ratio': return fmt.ratio(value, { decimals: 2, suffix: '' });
      case 'currency': return fmt.currency(value, { compact: true });
      default: return fmt.number(value, { decimals: 2 });
    }
  };
  const navigate = useNavigate();
  const { watchlist, removeFromWatchlist, clearWatchlist, checkAlerts, priceAlerts } = useWatchlist();
  const [metricsData, setMetricsData] = useState({});
  const [priceData, setPriceData] = useState({});
  const [alphaData, setAlphaData] = useState({});
  const [prismData, setPrismData] = useState({});
  const [loading, setLoading] = useState(false);
  const [sortBy, setSortBy] = useState('addedAt');
  const [sortOrder, setSortOrder] = useState('desc');
  const [showAlphaChart, setShowAlphaChart] = useState(true);
  const [selectedSymbols, setSelectedSymbols] = useState([]);

  // Load metrics, prices, alpha, and PRISM data for all watchlist items
  useEffect(() => {
    const loadData = async () => {
      if (watchlist.length === 0) return;

      setLoading(true);
      const newMetrics = {};
      const newPrices = {};
      const newAlpha = {};
      const newPrism = {};

      // Load all data in parallel
      await Promise.all(watchlist.map(async (item) => {
        try {
          const [metricsRes, priceRes, alphaRes, prismRes] = await Promise.all([
            companyAPI.getOne(item.symbol),
            pricesAPI.getMetrics(item.symbol).catch(() => null),
            indicesAPI.getAlpha(item.symbol).catch(() => null),
            prismAPI.getReport(item.symbol).catch(() => null)
          ]);
          newMetrics[item.symbol] = metricsRes.data.latest_metrics;
          if (priceRes?.data?.data) {
            newPrices[item.symbol] = priceRes.data.data;
          }
          if (alphaRes?.data?.data) {
            newAlpha[item.symbol] = alphaRes.data.data;
          }
          if (prismRes?.success && prismRes?.report?.scorecard?.overallScore) {
            newPrism[item.symbol] = prismRes.report.scorecard.overallScore;
          }
        } catch (error) {
          console.error(`Error loading data for ${item.symbol}:`, error);
        }
      }));

      setMetricsData(newMetrics);
      setPriceData(newPrices);
      setAlphaData(newAlpha);
      setPrismData(newPrism);
      setLoading(false);
    };

    loadData();
  }, [watchlist]);

  // Check price alerts when price data changes
  useEffect(() => {
    if (Object.keys(priceData).length > 0 && priceAlerts.length > 0) {
      // Build price map: { symbol: lastPrice }
      const prices = {};
      Object.entries(priceData).forEach(([symbol, data]) => {
        if (data.last_price) {
          prices[symbol] = data.last_price;
        }
      });
      checkAlerts(prices);
    }
  }, [priceData, priceAlerts.length, checkAlerts]);

  const handleSort = useCallback((column) => {
    if (sortBy === column) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('desc');
    }
  }, [sortBy]);

  // Memoize sorted watchlist to avoid recalculating on every render
  const sortedWatchlist = useMemo(() => {
    return [...watchlist].sort((a, b) => {
      let aVal, bVal;

      if (sortBy === 'addedAt') {
        aVal = new Date(a.addedAt).getTime();
        bVal = new Date(b.addedAt).getTime();
      } else if (sortBy === 'symbol') {
        aVal = a.symbol;
        bVal = b.symbol;
      } else if (['last_price', 'change_1d', 'change_1w', 'change_1m'].includes(sortBy)) {
        aVal = priceData[a.symbol]?.[sortBy] ?? -Infinity;
        bVal = priceData[b.symbol]?.[sortBy] ?? -Infinity;
      } else if (['alpha_1m', 'alpha_3m', 'alpha_ytd', 'alpha_1y'].includes(sortBy)) {
        aVal = alphaData[a.symbol]?.[sortBy] ?? -Infinity;
        bVal = alphaData[b.symbol]?.[sortBy] ?? -Infinity;
      } else if (sortBy === 'prism_score') {
        aVal = prismData[a.symbol] ?? -Infinity;
        bVal = prismData[b.symbol] ?? -Infinity;
      } else {
        aVal = metricsData[a.symbol]?.[sortBy] ?? -Infinity;
        bVal = metricsData[b.symbol]?.[sortBy] ?? -Infinity;
      }

      if (typeof aVal === 'string') {
        return sortOrder === 'asc'
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }

      return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
    });
  }, [watchlist, sortBy, sortOrder, priceData, alphaData, metricsData, prismData]);

  const exportToCSV = useCallback(() => {
    if (watchlist.length === 0) return;

    const headers = ['Symbol', 'Name', 'Sector', 'Price', '1D %', '1W %', '1M %', 'Alpha 1M', 'Alpha YTD', 'ROIC', 'ROE', 'Net Margin', 'FCF Yield', 'Debt/Equity', 'Added'];
    const rows = watchlist.map(item => {
      const metrics = metricsData[item.symbol] || {};
      const prices = priceData[item.symbol] || {};
      const alpha = alphaData[item.symbol] || {};
      return [
        item.symbol,
        `"${item.name || ''}"`,
        item.sector || '',
        prices.last_price?.toFixed(2) || '',
        prices.change_1d?.toFixed(2) || '',
        prices.change_1w?.toFixed(2) || '',
        prices.change_1m?.toFixed(2) || '',
        alpha.alpha_1m?.toFixed(2) || '',
        alpha.alpha_ytd?.toFixed(2) || '',
        // Backend stores percentages as whole numbers (26 = 26%)
        metrics.roic?.toFixed(1) || '',
        metrics.roe?.toFixed(1) || '',
        metrics.net_margin?.toFixed(1) || '',
        metrics.fcf_yield?.toFixed(1) || '',
        metrics.debt_to_equity?.toFixed(2) || '',
        fmt.date(item.addedAt)
      ];
    });

    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `watchlist_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  }, [watchlist, metricsData, priceData, alphaData, fmt]);

  const SortIcon = ({ column }) => {
    if (sortBy !== column) return <span className="sort-icon">↕</span>;
    return <span className="sort-icon active">{sortOrder === 'asc' ? '↑' : '↓'}</span>;
  };

  // Selection handlers for bulk actions
  const handleToggleSelect = useCallback((symbol) => {
    setSelectedSymbols(prev =>
      prev.includes(symbol)
        ? prev.filter(s => s !== symbol)
        : [...prev, symbol]
    );
  }, []);

  const handleToggleSelectAll = useCallback(() => {
    setSelectedSymbols(prev => {
      const allSymbols = sortedWatchlist.map(item => item.symbol);
      const allSelected = allSymbols.every(s => prev.includes(s));
      return allSelected ? [] : allSymbols;
    });
  }, [sortedWatchlist]);

  const handleClearSelection = useCallback(() => {
    setSelectedSymbols([]);
  }, []);

  const handleBulkRemove = useCallback(() => {
    if (window.confirm(`Remove ${selectedSymbols.length} items from watchlist?`)) {
      selectedSymbols.forEach(symbol => removeFromWatchlist(symbol));
      setSelectedSymbols([]);
    }
  }, [selectedSymbols, removeFromWatchlist]);

  // Memoize averages calculation for summary
  const averages = useMemo(() => {
    const values = Object.values(metricsData);
    const count = values.length || 1;
    return {
      roic: values.reduce((sum, m) => sum + (m?.roic || 0), 0) / count,
      netMargin: values.reduce((sum, m) => sum + (m?.net_margin || 0), 0) / count,
      fcfYield: values.reduce((sum, m) => sum + (m?.fcf_yield || 0), 0) / count,
      debtToEquity: values.reduce((sum, m) => sum + (m?.debt_to_equity || 0), 0) / count,
    };
  }, [metricsData]);

  return (
    <div className="watchlist-page" {...askAIProps}>
      <PageHeader
        title="Watchlist"
        subtitle={`${watchlist.length} ${watchlist.length === 1 ? 'company' : 'companies'} tracked`}
        actions={
          watchlist.length > 0 && (
            <div className="watchlist-actions">
              <Button variant="secondary" icon={Download} onClick={exportToCSV}>
                Export CSV
              </Button>
              <Button
                variant="ghost"
                icon={Trash2}
                onClick={() => {
                  if (window.confirm('Clear entire watchlist?')) clearWatchlist();
                }}
              >
                Clear All
              </Button>
            </div>
          )
        }
      />

      {/* Natural Language Query Bar */}
      <Section>
        <NLQueryBar
          placeholder="Find stocks similar to your watchlist, compare companies, or ask questions..."
          context={{ page: 'watchlist', symbols: watchlist.map(w => w.symbol) }}
          onResultSelect={(symbol) => navigate(`/company/${symbol}`)}
        />
      </Section>

      {loading && watchlist.length > 0 && Object.keys(metricsData).length === 0 && (
        <SkeletonWatchlist />
      )}

      {/* Watchlist Summary - Above Holdings */}
      {watchlist.length > 0 && Object.keys(metricsData).length > 0 && (
        <Section title="Watchlist Summary">
          <Grid cols={4} gap="md">
            <DataCard
              label="Companies"
              value={watchlist.length}
              format="number"
            />
            <DataCard
              label="Avg ROIC"
              value={averages.roic}
              format="percent"
            />
            <DataCard
              label="Avg Net Margin"
              value={averages.netMargin}
              format="percent"
            />
            <DataCard
              label="Avg FCF Yield"
              value={averages.fcfYield}
              format="percent"
            />
          </Grid>
        </Section>
      )}

      {watchlist.length === 0 ? (
        <Card variant="base" padding="none">
          <EmptyState
            icon={Star}
            colorScheme="watchlist"
            title="Your watchlist is empty"
            description="Add companies from the screening results or company pages"
            action={{
              label: 'Browse Stocks',
              onClick: () => navigate('/screening')
            }}
          />
        </Card>
      ) : (
        <Section title="Holdings">
          {/* Selection Action Bar */}
          <SelectionActionBar
            selectedItems={selectedSymbols}
            onClear={handleClearSelection}
            showRemove={true}
            onRemove={handleBulkRemove}
          />
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.Head className="checkbox-col">
                  <input
                    type="checkbox"
                    checked={sortedWatchlist.length > 0 && selectedSymbols.length === sortedWatchlist.length}
                    ref={el => {
                      if (el) el.indeterminate = selectedSymbols.length > 0 && selectedSymbols.length < sortedWatchlist.length;
                    }}
                    onChange={handleToggleSelectAll}
                    title="Select all"
                  />
                </Table.Head>
                <Table.Head onClick={() => handleSort('symbol')} className="sortable-header">
                  Symbol <SortIcon column="symbol" />
                </Table.Head>
                <Table.Head>Name</Table.Head>
                <Table.Head align="right" onClick={() => handleSort('last_price')} className="sortable-header">
                  Price <SortIcon column="last_price" />
                </Table.Head>
                <Table.Head align="right" onClick={() => handleSort('change_1d')} className="sortable-header">
                  1D <SortIcon column="change_1d" />
                </Table.Head>
                <Table.Head align="right" onClick={() => handleSort('change_1w')} className="sortable-header">
                  1W <SortIcon column="change_1w" />
                </Table.Head>
                <Table.Head align="right" onClick={() => handleSort('change_1m')} className="sortable-header">
                  1M <SortIcon column="change_1m" />
                </Table.Head>
                <Table.Head align="right" onClick={() => handleSort('roic')} className="sortable-header">
                  ROIC <SortIcon column="roic" />
                </Table.Head>
                <Table.Head align="right" onClick={() => handleSort('roe')} className="sortable-header">
                  ROE <SortIcon column="roe" />
                </Table.Head>
                <Table.Head align="right" onClick={() => handleSort('net_margin')} className="sortable-header">
                  Margin <SortIcon column="net_margin" />
                </Table.Head>
                <Table.Head align="right" onClick={() => handleSort('fcf_yield')} className="sortable-header">
                  FCF Yld <SortIcon column="fcf_yield" />
                </Table.Head>
                <Table.Head align="center" onClick={() => handleSort('prism_score')} className="sortable-header">
                  PRISM <SortIcon column="prism_score" />
                </Table.Head>
                <Table.Head onClick={() => handleSort('addedAt')} className="sortable-header">
                  Added <SortIcon column="addedAt" />
                </Table.Head>
                <Table.Head>Actions</Table.Head>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {sortedWatchlist.map(item => (
                <WatchlistRow
                  key={item.symbol}
                  item={item}
                  metrics={metricsData[item.symbol] || {}}
                  prices={priceData[item.symbol] || {}}
                  alpha={alphaData[item.symbol] || {}}
                  prismScore={prismData[item.symbol]}
                  isSelected={selectedSymbols.includes(item.symbol)}
                  handleToggleSelect={handleToggleSelect}
                  formatValue={formatValue}
                  fmt={fmt}
                  navigate={navigate}
                  removeFromWatchlist={removeFromWatchlist}
                />
              ))}
            </Table.Body>
          </Table>
        </Section>
      )}


      {/* Alpha Comparison Chart */}
      {watchlist.length > 0 && showAlphaChart && (
        <Section
          title="Alpha vs S&P 500"
          actions={
            <Button variant="ghost" size="sm" onClick={() => setShowAlphaChart(false)}>
              Hide
            </Button>
          }
        >
          <Card>
            <AskAIProvider value={{ type: 'chart', label: 'Watchlist Alpha Comparison', metric: 'watchlist_alpha', symbols: watchlist.map(w => w.symbol) }}>
              <AlphaCompareChart
                symbols={watchlist.map(w => w.symbol)}
                height={350}
              />
            </AskAIProvider>
          </Card>
        </Section>
      )}

      {/* Price Alert Notifications */}
      <WatchlistAlertNotifications />
    </div>
  );
}

export default WatchlistPage;

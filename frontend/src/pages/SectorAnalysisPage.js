// frontend/src/pages/SectorAnalysisPage.js
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Columns, X } from 'lucide-react';
import { sectorsAPI, classificationsAPI, indicesAPI } from '../services/api';
import { PageHeader } from '../components/ui';
import {
  PeriodToggle,
  MultiMetricChart,
  WatchlistButton,
  SortableTable,
  MetricsBarChart,
  Sparkline
} from '../components';
import './SectorAnalysisPage.css';

// Format helpers
const formatValue = (value, format) => {
  if (value === null || value === undefined || isNaN(value)) return '-';
  switch (format) {
    case 'percent': return `${value.toFixed(1)}%`;
    case 'ratio': return value.toFixed(2);
    case 'currency':
      if (Math.abs(value) >= 1e3) return `$${(value).toFixed(0)}B`;
      return `$${value.toFixed(1)}B`;
    default: return value.toFixed(2);
  }
};

const getMomentumClass = (momentum) => {
  switch (momentum) {
    case 'IMPROVING': return 'momentum-up';
    case 'DECLINING': return 'momentum-down';
    default: return 'momentum-mixed';
  }
};

const getValueClass = (value, thresholds) => {
  if (value === null || value === undefined) return '';
  const { good, bad } = thresholds;
  if (good !== undefined && value >= good) return 'positive';
  if (bad !== undefined && value <= bad) return 'negative';
  return '';
};

// Tab definitions
const TABS = [
  { id: 'indices', label: 'Market Indices', icon: '📈' },
  { id: 'overview', label: 'Sector Overview', icon: '📊' },
  { id: 'industries', label: 'Industries', icon: '🏭' },
  { id: 'custom-sectors', label: 'Custom Sectors', icon: '🏷️' },
  { id: 'rotation', label: 'Sector Rotation', icon: '🔄' },
  { id: 'top-performers', label: 'Top Performers', icon: '🏆' },
  { id: 'margins', label: 'Margin Analysis', icon: '📈' }
];

// Metrics for top performers dropdown
const TOP_PERFORMER_METRICS = [
  { value: 'roic', label: 'ROIC' },
  { value: 'roe', label: 'ROE' },
  { value: 'roa', label: 'ROA' },
  { value: 'gross_margin', label: 'Gross Margin' },
  { value: 'operating_margin', label: 'Operating Margin' },
  { value: 'net_margin', label: 'Net Margin' },
  { value: 'fcf_margin', label: 'FCF Margin' },
  { value: 'fcf_yield', label: 'FCF Yield' },
  { value: 'earnings_yield', label: 'Earnings Yield' },
  { value: 'revenue_growth_yoy', label: 'Revenue Growth' },
  { value: 'earnings_growth_yoy', label: 'Earnings Growth' },
  { value: 'pe_ratio', label: 'P/E Ratio' },
  { value: 'pb_ratio', label: 'P/B Ratio' },
  { value: 'ps_ratio', label: 'P/S Ratio' },
  { value: 'debt_to_equity', label: 'D/E Ratio' },
  { value: 'current_ratio', label: 'Current Ratio' },
  { value: 'dividend_yield', label: 'Dividend Yield' }
];

// Available metrics for Sector Overview table
const SECTOR_OVERVIEW_METRICS = [
  { key: 'company_count', label: 'Companies', format: 'integer' },
  { key: 'avg_roic', label: 'Avg ROIC', format: 'percent', thresholds: { good: 15, bad: 5 } },
  { key: 'avg_roe', label: 'Avg ROE', format: 'percent', thresholds: { good: 15, bad: 5 } },
  { key: 'avg_gross_margin', label: 'Gross Margin', format: 'percent', thresholds: { good: 40, bad: 20 } },
  { key: 'avg_operating_margin', label: 'Op. Margin', format: 'percent', thresholds: { good: 20, bad: 5 } },
  { key: 'avg_net_margin', label: 'Net Margin', format: 'percent', thresholds: { good: 15, bad: 0 } },
  { key: 'avg_fcf_margin', label: 'FCF Margin', format: 'percent', thresholds: { good: 15, bad: 0 } },
  { key: 'avg_pe_ratio', label: 'P/E', format: 'ratio' },
  { key: 'avg_pb_ratio', label: 'P/B', format: 'ratio' },
  { key: 'avg_ps_ratio', label: 'P/S', format: 'ratio' },
  { key: 'avg_debt_to_equity', label: 'D/E', format: 'ratio', thresholds: { bad: 2 } },
  { key: 'avg_current_ratio', label: 'Current Ratio', format: 'ratio', thresholds: { good: 1.5, bad: 1 } },
  { key: 'avg_revenue_growth', label: 'Growth', format: 'percent', thresholds: { good: 10, bad: 0 } },
  { key: 'avg_dividend_yield', label: 'Div Yield', format: 'percent' },
  { key: 'total_market_cap_b', label: 'Mkt Cap', format: 'currency' }
];

// Available metrics for Industries table
const INDUSTRY_METRICS = [
  { key: 'avg_roic', label: 'ROIC', format: 'percent', thresholds: { good: 15, bad: 5 } },
  { key: 'avg_roe', label: 'ROE', format: 'percent', thresholds: { good: 15, bad: 5 } },
  { key: 'avg_gross_margin', label: 'Gross Margin', format: 'percent', thresholds: { good: 40, bad: 20 } },
  { key: 'avg_operating_margin', label: 'Operating Margin', format: 'percent', thresholds: { good: 20, bad: 5 } },
  { key: 'avg_net_margin', label: 'Net Margin', format: 'percent', thresholds: { good: 15, bad: 0 } },
  { key: 'avg_fcf_margin', label: 'FCF Margin', format: 'percent', thresholds: { good: 15, bad: 0 } },
  { key: 'avg_pe_ratio', label: 'P/E Ratio', format: 'ratio' },
  { key: 'avg_pb_ratio', label: 'P/B Ratio', format: 'ratio' },
  { key: 'avg_debt_to_equity', label: 'D/E Ratio', format: 'ratio', thresholds: { bad: 2 } },
  { key: 'avg_revenue_growth', label: 'Revenue Growth', format: 'percent', thresholds: { good: 10, bad: 0 } },
  { key: 'total_market_cap_b', label: 'Market Cap', format: 'currency' }
];

// Available metrics for Sector Rotation table
const ROTATION_METRICS = [
  { key: 'roic_change', label: 'ROIC Change', format: 'percent', thresholds: { good: 0 } },
  { key: 'roe_change', label: 'ROE Change', format: 'percent', thresholds: { good: 0 } },
  { key: 'margin_change', label: 'Margin Change', format: 'percent', thresholds: { good: 0 } },
  { key: 'avg_roic', label: 'Current ROIC', format: 'percent', thresholds: { good: 15, bad: 5 } },
  { key: 'avg_net_margin', label: 'Current Net Margin', format: 'percent', thresholds: { good: 15, bad: 0 } }
];

// Available metrics for Margin Comparison table
const MARGIN_METRICS = [
  { key: 'avg_gross_margin', label: 'Gross Margin', thresholds: { good: 40, bad: 20 }, hasRange: true },
  { key: 'avg_operating_margin', label: 'Operating Margin', thresholds: { good: 20, bad: 5 }, hasRange: true },
  { key: 'avg_net_margin', label: 'Net Margin', thresholds: { good: 15, bad: 0 }, hasRange: true },
  { key: 'avg_fcf_margin', label: 'FCF Margin', thresholds: { good: 15, bad: 0 }, hasRange: false },
  { key: 'avg_roic', label: 'ROIC', thresholds: { good: 15, bad: 5 }, hasRange: false },
  { key: 'avg_roe', label: 'ROE', thresholds: { good: 15, bad: 5 }, hasRange: false },
  { key: 'avg_asset_turnover', label: 'Asset Turnover', thresholds: { good: 1, bad: 0.5 }, hasRange: false }
];
const DEFAULT_MARGIN_METRICS = ['avg_gross_margin', 'avg_operating_margin', 'avg_net_margin', 'avg_fcf_margin'];

// View modes for sector overview
const VIEW_MODES = [
  { id: 'cards', label: 'Cards', icon: '⊞' },
  { id: 'chart', label: 'Charts', icon: '📊' },
  { id: 'table', label: 'Table', icon: '☰' }
];

function SectorAnalysisPage() {
  const [activeTab, setActiveTab] = useState('indices');
  const [periodType, setPeriodType] = useState('annual');
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('cards');

  // Data states
  const [sectorOverview, setSectorOverview] = useState([]);
  const [sectorRotation, setSectorRotation] = useState([]);
  const [topPerformers, setTopPerformers] = useState({});
  const [marginData, setMarginData] = useState([]);
  const [industries, setIndustries] = useState([]);
  const [customSectors, setCustomSectors] = useState([]);
  const [customTags, setCustomTags] = useState([]);
  const [marketIndices, setMarketIndices] = useState([]);
  const [indexPriceHistory, setIndexPriceHistory] = useState({});
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [indexConstituents, setIndexConstituents] = useState([]);
  const [loadingConstituents, setLoadingConstituents] = useState(false);
  const [indexChartPeriod, setIndexChartPeriod] = useState('1y');

  // Top performers controls
  const [topMetric, setTopMetric] = useState('roic');
  const [topLimit, setTopLimit] = useState(5);

  // Metric selection for tables
  const [selectedSectorMetrics, setSelectedSectorMetrics] = useState(['company_count', 'avg_roic', 'avg_net_margin', 'avg_pe_ratio', 'total_market_cap_b']);
  const [selectedIndustryMetrics, setSelectedIndustryMetrics] = useState(['avg_roic', 'avg_net_margin', 'avg_pe_ratio']);
  const [selectedRotationMetrics, setSelectedRotationMetrics] = useState(['roic_change', 'margin_change', 'avg_roic']);
  const [selectedMarginMetrics, setSelectedMarginMetrics] = useState(DEFAULT_MARGIN_METRICS);

  // Selected sector for drill-down
  const [selectedSector, setSelectedSector] = useState(null);
  const [sectorDetail, setSectorDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Selected industry for drill-down
  const [selectedIndustry, setSelectedIndustry] = useState(null);
  const [industryDetail, setIndustryDetail] = useState(null);
  const [loadingIndustryDetail, setLoadingIndustryDetail] = useState(false);

  // Industry filters
  const [industryFilter, setIndustryFilter] = useState('');
  const [industrySectorFilter, setIndustrySectorFilter] = useState('');
  const [showIndustryColumnSelector, setShowIndustryColumnSelector] = useState(false);
  const [showMarginColumnSelector, setShowMarginColumnSelector] = useState(false);

  // Sector overview filter
  const [sectorFilter, setSectorFilter] = useState('');
  const [sectorSortBy, setSectorSortBy] = useState('company_count');

  // Custom sectors controls
  const [selectedCustomSector, setSelectedCustomSector] = useState(null);
  const [customSectorCompanies, setCustomSectorCompanies] = useState([]);
  const [showNewSectorForm, setShowNewSectorForm] = useState(false);
  const [newSectorName, setNewSectorName] = useState('');
  const [showNewTagForm, setShowNewTagForm] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [selectedTagFilter, setSelectedTagFilter] = useState(null);
  const [taggedCompanies, setTaggedCompanies] = useState([]);

  // Load sector overview
  const loadOverview = useCallback(async () => {
    try {
      const res = await sectorsAPI.getAll(periodType);
      setSectorOverview(res.data.sectors);
    } catch (error) {
      console.error('Error loading sector overview:', error);
    }
  }, [periodType]);

  // Load sector rotation
  const loadRotation = useCallback(async () => {
    try {
      const res = await sectorsAPI.getRotation(5, periodType);
      setSectorRotation(res.data.rotation);
    } catch (error) {
      console.error('Error loading sector rotation:', error);
    }
  }, [periodType]);

  // Load top performers
  const loadTopPerformers = useCallback(async () => {
    try {
      const res = await sectorsAPI.getTopPerformers(topMetric, topLimit, periodType);
      setTopPerformers(res.data.topPerformers);
    } catch (error) {
      console.error('Error loading top performers:', error);
    }
  }, [topMetric, topLimit, periodType]);

  // Load margin data
  const loadMargins = useCallback(async () => {
    try {
      const res = await sectorsAPI.getMargins(periodType);
      setMarginData(res.data.margins);
    } catch (error) {
      console.error('Error loading margin data:', error);
    }
  }, [periodType]);

  // Load industries data
  const loadIndustries = useCallback(async () => {
    try {
      const res = await sectorsAPI.getMargins(periodType);
      setIndustries(res.data.margins);
    } catch (error) {
      console.error('Error loading industries:', error);
    }
  }, [periodType]);

  // Load custom classifications
  const loadCustomClassifications = useCallback(async () => {
    try {
      const [sectorsRes, tagsRes] = await Promise.all([
        classificationsAPI.getAll('sector'),
        classificationsAPI.getAll('tag')
      ]);
      setCustomSectors(sectorsRes.data.classifications || []);
      setCustomTags(tagsRes.data.classifications || []);
    } catch (error) {
      console.error('Error loading custom classifications:', error);
    }
  }, []);

  // Load market indices
  const loadMarketIndices = useCallback(async () => {
    try {
      const res = await indicesAPI.getAll();
      const indices = res.data?.data || [];
      setMarketIndices(indices);

      // Load price history for sparklines
      if (indices.length > 0) {
        const priceHistoryPromises = indices.slice(0, 4).map(async (idx) => {
          try {
            const priceRes = await indicesAPI.getPrices(idx.symbol, '1y');
            return { symbol: idx.symbol, data: priceRes.data?.data || [] };
          } catch (e) {
            return { symbol: idx.symbol, data: [] };
          }
        });
        const results = await Promise.all(priceHistoryPromises);
        const historyMap = {};
        results.forEach(({ symbol, data }) => {
          historyMap[symbol] = data.map(d => ({ time: d.date, value: d.close })).reverse();
        });
        setIndexPriceHistory(historyMap);

        // Auto-select first index (S&P 500)
        setSelectedIndex(prev => prev || indices[0]);
      }
    } catch (error) {
      console.error('Error loading market indices:', error);
    }
  }, []);

  // Load index constituents for major indices
  const loadIndexConstituents = useCallback(async (shortName) => {
    // Map short_name from market_indices to stock_indexes code
    // market_indices uses: SPX, DOW, NASDAQ, RUT
    // stock_indexes uses: SPX, DJI, NDX, RUT
    const codeMapping = {
      'SPX': 'SPX',
      'DOW': 'DJI',
      'NASDAQ': 'NDX', // NASDAQ Composite -> show NASDAQ-100 constituents
      'RUT': 'RUT'
    };

    const indexCode = codeMapping[shortName];
    if (!indexCode) {
      setIndexConstituents([]);
      return;
    }
    setLoadingConstituents(true);
    try {
      // Different limits based on index size
      const limits = { SPX: 505, DJI: 30, NDX: 100, RUT: 2000 };
      const limit = limits[indexCode] || 500;
      const res = await indicesAPI.getConstituents(indexCode, limit);
      setIndexConstituents(res.data?.data || []);
    } catch (error) {
      console.error('Error loading index constituents:', error);
      setIndexConstituents([]);
    }
    setLoadingConstituents(false);
  }, []);

  // Load chart data for selected index with specific period
  const loadIndexChartData = useCallback(async (symbol, period) => {
    if (!symbol) return;
    try {
      const priceRes = await indicesAPI.getPrices(symbol, period);
      const data = priceRes.data?.data || [];
      setIndexPriceHistory(prev => ({
        ...prev,
        [symbol]: data.map(d => ({ time: d.date, value: d.close })).reverse()
      }));
    } catch (error) {
      console.error('Error loading index chart data:', error);
    }
  }, []);

  // Load companies for a custom sector
  const loadCustomSectorCompanies = useCallback(async (sectorName) => {
    try {
      const res = await classificationsAPI.getCompanies({ user_sector: sectorName });
      setCustomSectorCompanies(res.data.companies || []);
    } catch (error) {
      console.error('Error loading custom sector companies:', error);
      setCustomSectorCompanies([]);
    }
  }, []);

  // Load companies with a specific tag
  const loadTaggedCompanies = useCallback(async (tag) => {
    try {
      const res = await classificationsAPI.getCompanies({ tag });
      setTaggedCompanies(res.data.companies || []);
    } catch (error) {
      console.error('Error loading tagged companies:', error);
      setTaggedCompanies([]);
    }
  }, []);

  // Load sector detail
  const loadSectorDetail = useCallback(async (sector) => {
    setLoadingDetail(true);
    try {
      const res = await sectorsAPI.getSector(sector, periodType);
      setSectorDetail(res.data);
    } catch (error) {
      console.error('Error loading sector detail:', error);
    }
    setLoadingDetail(false);
  }, [periodType]);

  // Load industry detail
  const loadIndustryDetail = useCallback(async (industry) => {
    setLoadingIndustryDetail(true);
    try {
      const res = await sectorsAPI.getIndustry(industry, periodType);
      setIndustryDetail(res.data);
    } catch (error) {
      console.error('Error loading industry detail:', error);
    }
    setLoadingIndustryDetail(false);
  }, [periodType]);

  // Initial data load
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([
        loadOverview(),
        loadRotation(),
        loadTopPerformers(),
        loadMargins(),
        loadIndustries(),
        loadCustomClassifications(),
        loadMarketIndices()
      ]);
      setLoading(false);
    };
    loadData();
  }, [loadOverview, loadRotation, loadTopPerformers, loadMargins, loadIndustries, loadCustomClassifications, loadMarketIndices]);

  // Load detail when sector selected
  useEffect(() => {
    if (selectedSector) {
      loadSectorDetail(selectedSector);
    } else {
      setSectorDetail(null);
    }
  }, [selectedSector, loadSectorDetail]);

  // Load detail when industry selected
  useEffect(() => {
    if (selectedIndustry) {
      loadIndustryDetail(selectedIndustry);
    } else {
      setIndustryDetail(null);
    }
  }, [selectedIndustry, loadIndustryDetail]);

  // Load companies when custom sector selected
  useEffect(() => {
    if (selectedCustomSector) {
      loadCustomSectorCompanies(selectedCustomSector);
    } else {
      setCustomSectorCompanies([]);
    }
  }, [selectedCustomSector, loadCustomSectorCompanies]);

  // Load companies when tag selected
  useEffect(() => {
    if (selectedTagFilter) {
      loadTaggedCompanies(selectedTagFilter);
    } else {
      setTaggedCompanies([]);
    }
  }, [selectedTagFilter, loadTaggedCompanies]);

  // Load constituents when index selected
  useEffect(() => {
    if (selectedIndex?.short_name) {
      loadIndexConstituents(selectedIndex.short_name);
    }
  }, [selectedIndex, loadIndexConstituents]);

  // Load chart data when period changes
  useEffect(() => {
    if (selectedIndex?.symbol && indexChartPeriod) {
      loadIndexChartData(selectedIndex.symbol, indexChartPeriod);
    }
  }, [selectedIndex?.symbol, indexChartPeriod, loadIndexChartData]);

  // Prepare chart data for sector rotation
  const getRotationChartData = () => {
    if (!sectorRotation.length) return [];

    const allPeriods = new Set();
    sectorRotation.forEach(s => {
      s.periods?.forEach(p => allPeriods.add(p.fiscal_period));
    });
    const sortedPeriods = Array.from(allPeriods).sort();

    return sortedPeriods.map(period => {
      const point = { date: period };
      sectorRotation.forEach(s => {
        const periodData = s.periods?.find(p => p.fiscal_period === period);
        point[s.sector] = periodData?.avg_roic ?? null;
      });
      return point;
    });
  };

  // Get unique sectors for filter dropdown
  const uniqueSectors = useMemo(() =>
    [...new Set(industries.map(i => i.sector).filter(Boolean))].sort(),
    [industries]
  );

  // Filter and sort sectors
  const filteredSectors = useMemo(() => {
    let filtered = sectorOverview.filter(s =>
      !sectorFilter || s.sector?.toLowerCase().includes(sectorFilter.toLowerCase())
    );

    // Sort
    return [...filtered].sort((a, b) => {
      const aVal = a[sectorSortBy] ?? 0;
      const bVal = b[sectorSortBy] ?? 0;
      return bVal - aVal;
    });
  }, [sectorOverview, sectorFilter, sectorSortBy]);

  // Filter industries
  const filteredIndustries = useMemo(() => {
    return industries.filter(ind => {
      const matchesSearch = !industryFilter ||
        ind.industry?.toLowerCase().includes(industryFilter.toLowerCase()) ||
        ind.sector?.toLowerCase().includes(industryFilter.toLowerCase());
      const matchesSector = !industrySectorFilter || ind.sector === industrySectorFilter;
      return matchesSearch && matchesSector;
    });
  }, [industries, industryFilter, industrySectorFilter]);

  // Prepare bar chart data for sectors
  const getSectorBarChartData = (metric) => {
    return filteredSectors
      .filter(s => s[metric] != null)
      .slice(0, 12)
      .map(s => ({
        name: s.sector,
        value: s[metric]
      }));
  };

  // Handle creating new custom sector
  const handleCreateSector = async () => {
    if (!newSectorName.trim()) return;
    try {
      await classificationsAPI.create({
        name: newSectorName.trim(),
        type: 'sector',
        description: `Custom sector: ${newSectorName.trim()}`
      });
      setNewSectorName('');
      setShowNewSectorForm(false);
      loadCustomClassifications();
    } catch (error) {
      console.error('Error creating sector:', error);
    }
  };

  // Handle creating new tag
  const handleCreateTag = async () => {
    if (!newTagName.trim()) return;
    try {
      await classificationsAPI.create({
        name: newTagName.trim(),
        type: 'tag',
        description: `Custom tag: ${newTagName.trim()}`
      });
      setNewTagName('');
      setShowNewTagForm(false);
      loadCustomClassifications();
    } catch (error) {
      console.error('Error creating tag:', error);
    }
  };

  // Handle deleting a custom sector
  const handleDeleteSector = async (id) => {
    if (!window.confirm('Are you sure you want to delete this custom sector?')) return;
    try {
      await classificationsAPI.delete(id);
      loadCustomClassifications();
      if (selectedCustomSector) setSelectedCustomSector(null);
    } catch (error) {
      console.error('Error deleting sector:', error);
    }
  };

  // Handle deleting a tag
  const handleDeleteTag = async (id) => {
    if (!window.confirm('Are you sure you want to delete this tag?')) return;
    try {
      await classificationsAPI.delete(id);
      loadCustomClassifications();
      if (selectedTagFilter) setSelectedTagFilter(null);
    } catch (error) {
      console.error('Error deleting tag:', error);
    }
  };

  // Sector table columns - dynamic based on selected metrics
  const sectorTableColumns = useMemo(() => {
    const baseColumns = [{ key: 'sector', label: 'Sector', className: 'sector-name' }];
    const metricColumns = selectedSectorMetrics.map(metricKey => {
      const metric = SECTOR_OVERVIEW_METRICS.find(m => m.key === metricKey);
      return metric ? { ...metric } : null;
    }).filter(Boolean);
    return [...baseColumns, ...metricColumns];
  }, [selectedSectorMetrics]);

  // Industry table columns - dynamic based on selected metrics
  const industryTableColumns = useMemo(() => {
    const baseColumns = [
      {
        key: 'industry',
        label: 'Industry',
        className: 'industry-name clickable-cell',
        render: (row) => (
          <span
            className="clickable-text"
            onClick={(e) => {
              e.stopPropagation();
              setSelectedIndustry(row.industry);
            }}
          >
            {row.industry || '-'}
          </span>
        )
      },
      { key: 'sector', label: 'Sector', className: 'sector-name' },
      { key: 'company_count', label: 'Companies', format: 'integer' }
    ];

    const metricColumns = selectedIndustryMetrics.map(metricKey => {
      const metric = INDUSTRY_METRICS.find(m => m.key === metricKey);
      return metric || { key: metricKey, label: metricKey, format: 'number' };
    });

    return [...baseColumns, ...metricColumns];
  }, [selectedIndustryMetrics]);

  if (loading) {
    return <div className="loading">Loading sector analysis...</div>;
  }

  return (
    <div className="sector-analysis-page">
      <PageHeader
        title="Sector Analysis"
        subtitle="Industry-level aggregations and performance insights"
        actions={
          <PeriodToggle
            value={periodType}
            onChange={setPeriodType}
            availablePeriods={[
              { period_type: 'annual', count: 1 },
              { period_type: 'quarterly', count: 1 }
            ]}
          />
        }
      />

      {/* Tab Navigation */}
      <div className="tab-navigation">
        {TABS.map(tab => (
          <button
            key={tab.id}
            className={activeTab === tab.id ? 'active' : ''}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="tab-icon">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Market Indices Tab */}
      {activeTab === 'indices' && (
        <div className="tab-content indices-tab">
          {/* Index Selector Cards */}
          <div className="index-selector-grid">
            {marketIndices.map(index => (
              <div
                key={index.symbol}
                className={`index-selector-card ${selectedIndex?.symbol === index.symbol ? 'selected' : ''}`}
                onClick={() => setSelectedIndex(index)}
              >
                <div className="selector-header">
                  <span className="selector-name">{index.short_name || index.name}</span>
                  <span className={`selector-change ${index.change_1d_pct >= 0 ? 'positive' : 'negative'}`}>
                    {index.change_1d_pct >= 0 ? '+' : ''}{index.change_1d_pct?.toFixed(2)}%
                  </span>
                </div>
                <div className="selector-price">
                  {index.last_price?.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                </div>
                <div className="selector-sparkline">
                  {indexPriceHistory[index.symbol]?.length > 0 && (
                    <Sparkline
                      data={indexPriceHistory[index.symbol]}
                      width={120}
                      height={40}
                      showChange={false}
                      color={index.change_ytd >= 0 ? '#10b981' : '#ef4444'}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Selected Index Details */}
          {selectedIndex && (
            <div className="index-detail-section">
              <div className="index-detail-header">
                <div className="index-title">
                  <h2>{selectedIndex.name}</h2>
                  <span className="index-subtitle">
                    {selectedIndex.short_name} • Updated {selectedIndex.last_price_date && new Date(selectedIndex.last_price_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                </div>
                <div className="index-price-display">
                  <span className="index-current-price">
                    {selectedIndex.last_price?.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                  </span>
                  <span className={`index-day-change ${selectedIndex.change_1d_pct >= 0 ? 'positive' : 'negative'}`}>
                    {selectedIndex.change_1d_pct >= 0 ? '+' : ''}{selectedIndex.change_1d_pct?.toFixed(2)}%
                  </span>
                </div>
              </div>

              {/* Price Chart with Period Selector - ABOVE METRICS */}
              <div className="index-chart-section">
                <div className="chart-header">
                  <h3>Price History</h3>
                  <div className="period-selector">
                    {[
                      { value: '1m', label: '1M' },
                      { value: '3m', label: '3M' },
                      { value: '6m', label: '6M' },
                      { value: '1y', label: '1Y' },
                      { value: '3y', label: '3Y' },
                      { value: '5y', label: '5Y' },
                      { value: '10y', label: '10Y' },
                      { value: 'all', label: 'All' }
                    ].map(period => (
                      <button
                        key={period.value}
                        className={`period-btn ${indexChartPeriod === period.value ? 'active' : ''}`}
                        onClick={() => setIndexChartPeriod(period.value)}
                      >
                        {period.label}
                      </button>
                    ))}
                  </div>
                </div>
                {indexPriceHistory[selectedIndex.symbol]?.length > 0 ? (
                  <div className="index-chart-container">
                    <MultiMetricChart
                      data={indexPriceHistory[selectedIndex.symbol]}
                      metrics={[{ key: 'value', label: selectedIndex.short_name, format: 'number' }]}
                      height={350}
                      periodType="daily"
                      hideTimeRange={true}
                    />
                  </div>
                ) : (
                  <div className="chart-loading">Loading chart data...</div>
                )}
              </div>

              {/* Key Metrics Grid - BELOW CHART */}
              <div className="index-metrics-grid">
                <div className="index-metric-card">
                  <span className="metric-label">1 Week</span>
                  <span className={`metric-value ${selectedIndex.change_1w >= 0 ? 'positive' : 'negative'}`}>
                    {selectedIndex.change_1w >= 0 ? '+' : ''}{selectedIndex.change_1w?.toFixed(2)}%
                  </span>
                </div>
                <div className="index-metric-card">
                  <span className="metric-label">1 Month</span>
                  <span className={`metric-value ${selectedIndex.change_1m >= 0 ? 'positive' : 'negative'}`}>
                    {selectedIndex.change_1m >= 0 ? '+' : ''}{selectedIndex.change_1m?.toFixed(2)}%
                  </span>
                </div>
                <div className="index-metric-card">
                  <span className="metric-label">3 Months</span>
                  <span className={`metric-value ${selectedIndex.change_3m >= 0 ? 'positive' : 'negative'}`}>
                    {selectedIndex.change_3m >= 0 ? '+' : ''}{selectedIndex.change_3m?.toFixed(2)}%
                  </span>
                </div>
                <div className="index-metric-card">
                  <span className="metric-label">YTD</span>
                  <span className={`metric-value ${selectedIndex.change_ytd >= 0 ? 'positive' : 'negative'}`}>
                    {selectedIndex.change_ytd >= 0 ? '+' : ''}{selectedIndex.change_ytd?.toFixed(2)}%
                  </span>
                </div>
                <div className="index-metric-card">
                  <span className="metric-label">1 Year</span>
                  <span className={`metric-value ${selectedIndex.change_1y >= 0 ? 'positive' : 'negative'}`}>
                    {selectedIndex.change_1y >= 0 ? '+' : ''}{selectedIndex.change_1y?.toFixed(2)}%
                  </span>
                </div>
                <div className="index-metric-card">
                  <span className="metric-label">52W High</span>
                  <span className="metric-value">
                    {selectedIndex.high_52w?.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                    <span className={`metric-sub ${selectedIndex.pct_from_52w_high <= -5 ? 'negative' : ''}`}>
                      ({selectedIndex.pct_from_52w_high?.toFixed(1)}%)
                    </span>
                  </span>
                </div>
                <div className="index-metric-card">
                  <span className="metric-label">52W Low</span>
                  <span className="metric-value">
                    {selectedIndex.low_52w?.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                    <span className="metric-sub positive">
                      (+{selectedIndex.pct_from_52w_low?.toFixed(1)}%)
                    </span>
                  </span>
                </div>
                <div className="index-metric-card">
                  <span className="metric-label">vs 50 SMA</span>
                  <span className={`metric-value ${selectedIndex.price_vs_sma_50 >= 0 ? 'positive' : 'negative'}`}>
                    {selectedIndex.price_vs_sma_50 >= 0 ? '+' : ''}{selectedIndex.price_vs_sma_50?.toFixed(1)}%
                  </span>
                </div>
                <div className="index-metric-card">
                  <span className="metric-label">vs 200 SMA</span>
                  <span className={`metric-value ${selectedIndex.price_vs_sma_200 >= 0 ? 'positive' : 'negative'}`}>
                    {selectedIndex.price_vs_sma_200 >= 0 ? '+' : ''}{selectedIndex.price_vs_sma_200?.toFixed(1)}%
                  </span>
                </div>
              </div>

              {/* Constituents Table - For major indices */}
              {['SPX', 'DOW', 'NASDAQ', 'RUT'].includes(selectedIndex.short_name) && (
                <div className="index-constituents-section">
                  <div className="constituents-header">
                    <h3>
                      {selectedIndex.short_name === 'SPX' && 'S&P 500 Constituents'}
                      {selectedIndex.short_name === 'NASDAQ' && 'NASDAQ-100 Constituents'}
                      {selectedIndex.short_name === 'DOW' && 'Dow Jones Industrial Average Constituents'}
                      {selectedIndex.short_name === 'RUT' && 'Russell 2000 Constituents'}
                    </h3>
                    <span className="constituents-count">
                      {loadingConstituents ? 'Loading...' : `${indexConstituents.length} companies`}
                    </span>
                  </div>
                  {loadingConstituents ? (
                    <div className="loading">Loading constituents...</div>
                  ) : indexConstituents.length > 0 ? (
                    <div className="constituents-table-wrapper">
                      <table className="constituents-table">
                        <thead>
                          <tr>
                            <th>Symbol</th>
                            <th>Company</th>
                            <th>Sector</th>
                            <th>Industry</th>
                            <th>Market Cap</th>
                          </tr>
                        </thead>
                        <tbody>
                          {indexConstituents.map(company => (
                            <tr key={company.symbol}>
                              <td>
                                <Link to={`/company/${company.symbol}`} className="symbol-link">
                                  {company.symbol}
                                </Link>
                              </td>
                              <td className="company-name">{company.name}</td>
                              <td>{company.sector || '-'}</td>
                              <td className="industry-cell">{company.industry || '-'}</td>
                              <td className="market-cap">
                                {company.market_cap
                                  ? company.market_cap >= 1e12
                                    ? `$${(company.market_cap / 1e12).toFixed(2)}T`
                                    : `$${(company.market_cap / 1e9).toFixed(1)}B`
                                  : '-'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="no-constituents">
                      No constituent data available for this index.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Sector Overview Tab */}
      {activeTab === 'overview' && (
        <div className="tab-content">
          {selectedSector ? (
            <SectorDetailView
              sector={selectedSector}
              detail={sectorDetail}
              loading={loadingDetail}
              onBack={() => setSelectedSector(null)}
              periodType={periodType}
            />
          ) : (
            <>
              <div className="section-header">
                <h2>All Sectors</h2>
                <div className="header-controls">
                  <input
                    type="text"
                    placeholder="Search sectors..."
                    value={sectorFilter}
                    onChange={(e) => setSectorFilter(e.target.value)}
                    className="search-input"
                  />
                  <select value={sectorSortBy} onChange={(e) => setSectorSortBy(e.target.value)}>
                    <option value="company_count">Sort by Companies</option>
                    <option value="avg_roic">Sort by ROIC</option>
                    <option value="avg_net_margin">Sort by Margin</option>
                    <option value="avg_revenue_growth">Sort by Growth</option>
                    <option value="total_market_cap_b">Sort by Market Cap</option>
                  </select>
                  <div className="view-toggle">
                    {VIEW_MODES.map(mode => (
                      <button
                        key={mode.id}
                        className={viewMode === mode.id ? 'active' : ''}
                        onClick={() => setViewMode(mode.id)}
                        title={mode.label}
                      >
                        {mode.icon}
                      </button>
                    ))}
                  </div>
                  <span className="count">{filteredSectors.length} sectors</span>
                </div>
              </div>

              {/* Cards View */}
              {viewMode === 'cards' && (
                <div className="sector-cards">
                  {filteredSectors.map(sector => (
                    <div
                      key={sector.sector}
                      className="sector-card"
                      onClick={() => setSelectedSector(sector.sector)}
                    >
                      <div className="card-header">
                        <h3>{sector.sector}</h3>
                        <span className="company-count">{sector.company_count} companies</span>
                      </div>
                      <div className="card-metrics">
                        <div className="metric">
                          <span className="label">Avg ROIC</span>
                          <span className={`value ${getValueClass(sector.avg_roic, { good: 15, bad: 5 })}`}>
                            {formatValue(sector.avg_roic, 'percent')}
                          </span>
                        </div>
                        <div className="metric">
                          <span className="label">Avg Net Margin</span>
                          <span className={`value ${getValueClass(sector.avg_net_margin, { good: 15, bad: 0 })}`}>
                            {formatValue(sector.avg_net_margin, 'percent')}
                          </span>
                        </div>
                        <div className="metric">
                          <span className="label">Avg P/E</span>
                          <span className="value">{formatValue(sector.avg_pe_ratio, 'ratio')}</span>
                        </div>
                        <div className="metric">
                          <span className="label">Avg D/E</span>
                          <span className={`value ${getValueClass(sector.avg_debt_to_equity, { bad: 2 })}`}>
                            {formatValue(sector.avg_debt_to_equity, 'ratio')}
                          </span>
                        </div>
                        <div className="metric">
                          <span className="label">Revenue Growth</span>
                          <span className={`value ${getValueClass(sector.avg_revenue_growth, { good: 10, bad: 0 })}`}>
                            {formatValue(sector.avg_revenue_growth, 'percent')}
                          </span>
                        </div>
                        <div className="metric">
                          <span className="label">Market Cap</span>
                          <span className="value">{formatValue(sector.total_market_cap_b, 'currency')}</span>
                        </div>
                      </div>
                      <div className="card-footer">
                        <span className="view-details">View Details &rarr;</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Charts View */}
              {viewMode === 'chart' && (
                <div className="sector-charts">
                  <div className="charts-grid">
                    <MetricsBarChart
                      data={getSectorBarChartData('avg_roic')}
                      metric="Average ROIC by Sector"
                      format="percent"
                      colorScale="threshold"
                      thresholds={{ good: 15, bad: 5 }}
                      onClick={(item) => setSelectedSector(item.name)}
                    />
                    <MetricsBarChart
                      data={getSectorBarChartData('avg_net_margin')}
                      metric="Average Net Margin by Sector"
                      format="percent"
                      colorScale="threshold"
                      thresholds={{ good: 15, bad: 0 }}
                      onClick={(item) => setSelectedSector(item.name)}
                    />
                    <MetricsBarChart
                      data={getSectorBarChartData('avg_revenue_growth')}
                      metric="Average Revenue Growth by Sector"
                      format="percent"
                      colorScale="threshold"
                      thresholds={{ good: 10, bad: 0 }}
                      onClick={(item) => setSelectedSector(item.name)}
                    />
                    <MetricsBarChart
                      data={getSectorBarChartData('total_market_cap_b')}
                      metric="Total Market Cap by Sector"
                      format="currency"
                      colorScale="gradient"
                      onClick={(item) => setSelectedSector(item.name)}
                    />
                  </div>
                </div>
              )}

              {/* Table View */}
              {viewMode === 'table' && (
                <>
                  {/* Metric Selector */}
                  <div className="metric-selector-section">
                    <span className="selector-label">Show Metrics:</span>
                    <div className="metric-checkboxes">
                      {SECTOR_OVERVIEW_METRICS.map(metric => (
                        <label key={metric.key} className="metric-checkbox">
                          <input
                            type="checkbox"
                            checked={selectedSectorMetrics.includes(metric.key)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedSectorMetrics(prev => [...prev, metric.key]);
                              } else {
                                setSelectedSectorMetrics(prev => prev.filter(k => k !== metric.key));
                              }
                            }}
                          />
                          <span>{metric.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <SortableTable
                    data={filteredSectors}
                    columns={sectorTableColumns}
                    defaultSort={{ key: 'company_count', direction: 'desc' }}
                    onRowClick={(row) => setSelectedSector(row.sector)}
                    emptyMessage="No sectors found"
                    searchable
                    searchKeys={['sector']}
                    searchPlaceholder="Search sectors..."
                  />
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* Industries Tab */}
      {activeTab === 'industries' && (
        <div className="tab-content">
          {selectedIndustry ? (
            <IndustryDetailView
              industry={selectedIndustry}
              detail={industryDetail}
              loading={loadingIndustryDetail}
              onBack={() => setSelectedIndustry(null)}
              periodType={periodType}
            />
          ) : (
            <>
              <div className="section-header">
                <h2>Industries</h2>
                <div className="header-controls">
                  <input
                    type="text"
                    placeholder="Search industries..."
                    value={industryFilter}
                    onChange={(e) => setIndustryFilter(e.target.value)}
                    className="search-input"
                  />
                  <select
                    value={industrySectorFilter}
                    onChange={(e) => setIndustrySectorFilter(e.target.value)}
                  >
                    <option value="">All Sectors</option>
                    {uniqueSectors.map(sector => (
                      <option key={sector} value={sector}>{sector}</option>
                    ))}
                  </select>
                  <span className="count">{filteredIndustries.length} of {industries.length} industries</span>
                </div>
              </div>

              {/* Table Controls with Column Selector */}
              <div className="table-controls">
                <div className="table-controls-left">
                  <span className="results-count">{filteredIndustries.length} industries</span>
                </div>
                <div className="table-controls-right">
                  <div className="column-selector-wrapper">
                    <button
                      className={`table-control-btn ${showIndustryColumnSelector ? 'active' : ''}`}
                      onClick={() => setShowIndustryColumnSelector(!showIndustryColumnSelector)}
                      title="Select columns"
                    >
                      <Columns size={16} />
                      <span>Columns</span>
                    </button>
                    {showIndustryColumnSelector && (
                      <div className="column-selector-dropdown">
                        <div className="column-selector-header">
                          <span>Show/Hide Columns</span>
                          <button onClick={() => setShowIndustryColumnSelector(false)}><X size={14} /></button>
                        </div>
                        <div className="column-selector-list">
                          {INDUSTRY_METRICS.map(metric => (
                            <label key={metric.key} className="column-option">
                              <input
                                type="checkbox"
                                checked={selectedIndustryMetrics.includes(metric.key)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedIndustryMetrics(prev => [...prev, metric.key]);
                                  } else {
                                    setSelectedIndustryMetrics(prev => prev.filter(k => k !== metric.key));
                                  }
                                }}
                              />
                              <span>{metric.label}</span>
                            </label>
                          ))}
                        </div>
                        <div className="column-selector-footer">
                          <button onClick={() => setSelectedIndustryMetrics(['avg_roic', 'avg_net_margin', 'avg_pe_ratio'])}>
                            Reset to Default
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <SortableTable
                data={filteredIndustries}
                columns={industryTableColumns}
                defaultSort={{ key: 'company_count', direction: 'desc' }}
                emptyMessage="No industries found"
                searchable
                searchKeys={['industry', 'sector']}
                searchPlaceholder="Search industries..."
              />
            </>
          )}
        </div>
      )}

      {/* Custom Sectors Tab */}
      {activeTab === 'custom-sectors' && (
        <div className="tab-content">
          <div className="custom-sectors-layout">
            {/* Left sidebar - Custom Sectors and Tags */}
            <div className="custom-sidebar">
              {/* Custom Sectors Section */}
              <div className="sidebar-section">
                <div className="sidebar-header">
                  <h3>Custom Sectors</h3>
                  <button
                    className="add-btn"
                    onClick={() => setShowNewSectorForm(!showNewSectorForm)}
                    title="Add new sector"
                  >
                    +
                  </button>
                </div>

                {showNewSectorForm && (
                  <div className="new-item-form">
                    <input
                      type="text"
                      placeholder="New sector name..."
                      value={newSectorName}
                      onChange={(e) => setNewSectorName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleCreateSector()}
                    />
                    <button onClick={handleCreateSector}>Add</button>
                  </div>
                )}

                <div className="sidebar-list">
                  {customSectors.map(sector => (
                    <div
                      key={sector.id}
                      className={`sidebar-item ${selectedCustomSector === sector.name ? 'active' : ''}`}
                      onClick={() => {
                        setSelectedCustomSector(selectedCustomSector === sector.name ? null : sector.name);
                        setSelectedTagFilter(null);
                      }}
                    >
                      <span className="item-name">{sector.name}</span>
                      <button
                        className="delete-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteSector(sector.id);
                        }}
                        title="Delete sector"
                      >
                        x
                      </button>
                    </div>
                  ))}
                  {customSectors.length === 0 && (
                    <div className="empty-message">No custom sectors defined</div>
                  )}
                </div>
              </div>

              {/* Tags Section */}
              <div className="sidebar-section">
                <div className="sidebar-header">
                  <h3>Tags</h3>
                  <button
                    className="add-btn"
                    onClick={() => setShowNewTagForm(!showNewTagForm)}
                    title="Add new tag"
                  >
                    +
                  </button>
                </div>

                {showNewTagForm && (
                  <div className="new-item-form">
                    <input
                      type="text"
                      placeholder="New tag name..."
                      value={newTagName}
                      onChange={(e) => setNewTagName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleCreateTag()}
                    />
                    <button onClick={handleCreateTag}>Add</button>
                  </div>
                )}

                <div className="sidebar-list tags-list">
                  {customTags.map(tag => (
                    <div
                      key={tag.id}
                      className={`tag-item ${selectedTagFilter === tag.name ? 'active' : ''}`}
                      onClick={() => {
                        setSelectedTagFilter(selectedTagFilter === tag.name ? null : tag.name);
                        setSelectedCustomSector(null);
                      }}
                    >
                      <span className="tag-name">{tag.name}</span>
                      <button
                        className="delete-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteTag(tag.id);
                        }}
                        title="Delete tag"
                      >
                        x
                      </button>
                    </div>
                  ))}
                  {customTags.length === 0 && (
                    <div className="empty-message">No tags defined</div>
                  )}
                </div>
              </div>
            </div>

            {/* Right side - Companies list */}
            <div className="custom-companies">
              {selectedCustomSector && (
                <>
                  <div className="companies-header">
                    <h3>Companies in "{selectedCustomSector}"</h3>
                    <span className="count">{customSectorCompanies.length} companies</span>
                  </div>
                  {customSectorCompanies.length > 0 ? (
                    <div className="companies-grid">
                      {customSectorCompanies.map(company => (
                        <Link
                          key={company.symbol}
                          to={`/company/${company.symbol}`}
                          className="company-card"
                        >
                          <div className="card-symbol">{company.symbol}</div>
                          <div className="card-name">{company.name}</div>
                          <div className="card-sector">{company.sector}</div>
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <div className="no-companies">
                      No companies assigned to this custom sector yet.
                      <br />
                      <span className="hint">Assign companies from their detail pages.</span>
                    </div>
                  )}
                </>
              )}

              {selectedTagFilter && (
                <>
                  <div className="companies-header">
                    <h3>Companies tagged "{selectedTagFilter}"</h3>
                    <span className="count">{taggedCompanies.length} companies</span>
                  </div>
                  {taggedCompanies.length > 0 ? (
                    <div className="companies-grid">
                      {taggedCompanies.map(company => (
                        <Link
                          key={company.symbol}
                          to={`/company/${company.symbol}`}
                          className="company-card"
                        >
                          <div className="card-symbol">{company.symbol}</div>
                          <div className="card-name">{company.name}</div>
                          <div className="card-sector">{company.sector}</div>
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <div className="no-companies">
                      No companies have this tag yet.
                      <br />
                      <span className="hint">Add tags to companies from their detail pages.</span>
                    </div>
                  )}
                </>
              )}

              {!selectedCustomSector && !selectedTagFilter && (
                <div className="select-prompt">
                  <div className="prompt-icon">🏷️</div>
                  <h3>Custom Classifications</h3>
                  <p>Select a custom sector or tag from the sidebar to view companies.</p>
                  <p className="hint">
                    Create your own sectors like "Big Tech", "AI Companies", or "Dividend Kings",
                    and tag companies for quick access.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Sector Rotation Tab */}
      {activeTab === 'rotation' && (
        <div className="tab-content">
          <div className="section-header">
            <h2>Sector Rotation</h2>
            <span className="subtitle">Historical performance trends by sector</span>
          </div>

          {/* Rotation Chart */}
          <div className="rotation-chart-container">
            <MultiMetricChart
              data={getRotationChartData()}
              metrics={sectorRotation.slice(0, 6).map((s) => ({
                key: s.sector,
                label: s.sector,
                format: 'percent'
              }))}
              height={400}
              title="Sector ROIC Over Time"
              periodType={periodType}
            />
          </div>

          {/* Metric Selector */}
          <div className="metric-selector-section">
            <span className="selector-label">Show Metrics:</span>
            <div className="metric-checkboxes">
              {ROTATION_METRICS.map(metric => (
                <label key={metric.key} className="metric-checkbox">
                  <input
                    type="checkbox"
                    checked={selectedRotationMetrics.includes(metric.key)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedRotationMetrics(prev => [...prev, metric.key]);
                      } else {
                        setSelectedRotationMetrics(prev => prev.filter(k => k !== metric.key));
                      }
                    }}
                  />
                  <span>{metric.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Rotation Table */}
          <div className="rotation-table">
            <table>
              <thead>
                <tr>
                  <th>Sector</th>
                  <th>Momentum</th>
                  {selectedRotationMetrics.map(metricKey => {
                    const metric = ROTATION_METRICS.find(m => m.key === metricKey);
                    return <th key={metricKey}>{metric?.label || metricKey}</th>;
                  })}
                </tr>
              </thead>
              <tbody>
                {sectorRotation.map(sector => {
                  const latest = sector.periods?.[0];
                  return (
                    <tr key={sector.sector}>
                      <td className="sector-name">{sector.sector}</td>
                      <td>
                        <span className={`momentum-badge ${getMomentumClass(sector.momentum)}`}>
                          {sector.momentum || 'N/A'}
                        </span>
                      </td>
                      {selectedRotationMetrics.map(metricKey => {
                        const metric = ROTATION_METRICS.find(m => m.key === metricKey);
                        let value = null;

                        // Get value from appropriate location
                        if (metricKey.includes('_change')) {
                          value = sector.trends?.[metricKey];
                        } else {
                          value = latest?.[metricKey];
                        }

                        // Format and display
                        const displayValue = value != null
                          ? (metricKey.includes('_change') && value > 0 ? '+' : '') + formatValue(value, metric?.format || 'number')
                          : '-';

                        return (
                          <td key={metricKey} className={getValueClass(value, metric?.thresholds || {})}>
                            {displayValue}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Top Performers Tab */}
      {activeTab === 'top-performers' && (
        <div className="tab-content">
          <div className="section-header">
            <h2>Top Performers by Sector</h2>
            <div className="controls">
              <select value={topMetric} onChange={(e) => setTopMetric(e.target.value)}>
                {TOP_PERFORMER_METRICS.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
              <select value={topLimit} onChange={(e) => setTopLimit(parseInt(e.target.value))}>
                <option value={3}>Top 3</option>
                <option value={5}>Top 5</option>
                <option value={10}>Top 10</option>
              </select>
            </div>
          </div>

          <div className="top-performers-grid">
            {Object.entries(topPerformers).map(([sector, companies]) => (
              <div key={sector} className="sector-performers">
                <h3>{sector}</h3>
                <div className="performers-list">
                  {companies.map((company, idx) => (
                    <div key={company.symbol} className="performer-row">
                      <span className="rank">#{idx + 1}</span>
                      <Link to={`/company/${company.symbol}`} className="company-info">
                        <span className="symbol">{company.symbol}</span>
                        <span className="name">{company.name}</span>
                      </Link>
                      <div className="performer-metrics">
                        <span className={`metric-value ${getValueClass(company[topMetric.replace(/_yoy$/, '_growth')], { good: 15 })}`}>
                          {formatValue(company[topMetric.replace(/_yoy$/, '_growth')] ?? company[topMetric], 'percent')}
                        </span>
                      </div>
                      <WatchlistButton
                        symbol={company.symbol}
                        name={company.name}
                        sector={sector}
                        size="small"
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Margin Analysis Tab */}
      {activeTab === 'margins' && (
        <div className="tab-content">
          <div className="section-header">
            <h2>Industry Margin Comparison</h2>
            <span className="count">{marginData.length} industries</span>
          </div>

          {/* Table Controls with Column Selector */}
          <div className="table-controls">
            <div className="table-controls-left">
              <span className="results-count">{marginData.length} industries</span>
            </div>
            <div className="table-controls-right">
              <div className="column-selector-wrapper">
                <button
                  className={`table-control-btn ${showMarginColumnSelector ? 'active' : ''}`}
                  onClick={() => setShowMarginColumnSelector(!showMarginColumnSelector)}
                  title="Select columns"
                >
                  <Columns size={16} />
                  <span>Columns</span>
                </button>
                {showMarginColumnSelector && (
                  <div className="column-selector-dropdown">
                    <div className="column-selector-header">
                      <span>Show/Hide Columns</span>
                      <button onClick={() => setShowMarginColumnSelector(false)}><X size={14} /></button>
                    </div>
                    <div className="column-selector-list">
                      {MARGIN_METRICS.map(metric => (
                        <label key={metric.key} className="column-option">
                          <input
                            type="checkbox"
                            checked={selectedMarginMetrics.includes(metric.key)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedMarginMetrics(prev => [...prev, metric.key]);
                              } else {
                                setSelectedMarginMetrics(prev => prev.filter(k => k !== metric.key));
                              }
                            }}
                          />
                          <span>{metric.label}</span>
                        </label>
                      ))}
                    </div>
                    <div className="column-selector-footer">
                      <button onClick={() => setSelectedMarginMetrics(DEFAULT_MARGIN_METRICS)}>
                        Reset to Default
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="margin-table">
            <table>
              <thead>
                <tr>
                  <th>Industry</th>
                  <th>Sector</th>
                  <th>Companies</th>
                  {selectedMarginMetrics.map(metricKey => {
                    const metric = MARGIN_METRICS.find(m => m.key === metricKey);
                    return <th key={metricKey}>{metric?.label || metricKey}</th>;
                  })}
                </tr>
              </thead>
              <tbody>
                {marginData.map((row, idx) => (
                  <tr key={`${row.sector}-${row.industry}-${idx}`}>
                    <td className="industry-name">{row.industry}</td>
                    <td className="sector-name">{row.sector}</td>
                    <td className="company-count">{row.company_count}</td>
                    {selectedMarginMetrics.map(metricKey => {
                      const metric = MARGIN_METRICS.find(m => m.key === metricKey);
                      const minKey = metricKey.replace('avg_', 'min_');
                      const maxKey = metricKey.replace('avg_', 'max_');
                      return (
                        <td key={metricKey}>
                          {metric?.hasRange ? (
                            <div className="margin-cell">
                              <span className={getValueClass(row[metricKey], metric?.thresholds)}>
                                {formatValue(row[metricKey], 'percent')}
                              </span>
                              <span className="range">
                                ({formatValue(row[minKey], 'percent')} - {formatValue(row[maxKey], 'percent')})
                              </span>
                            </div>
                          ) : (
                            <span className={getValueClass(row[metricKey], metric?.thresholds)}>
                              {formatValue(row[metricKey], 'percent')}
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// Sector Detail Sub-component
function SectorDetailView({ sector, detail, loading, onBack }) {
  const [sortConfig, setSortConfig] = useState({ key: 'market_cap_b', direction: 'desc' });
  const [filterText, setFilterText] = useState('');

  // Sort and filter companies
  const sortedCompanies = useMemo(() => {
    if (!detail?.companies) return [];

    let filtered = detail.companies.filter(c =>
      !filterText ||
      c.symbol?.toLowerCase().includes(filterText.toLowerCase()) ||
      c.name?.toLowerCase().includes(filterText.toLowerCase()) ||
      c.industry?.toLowerCase().includes(filterText.toLowerCase())
    );

    return [...filtered].sort((a, b) => {
      const aVal = a[sortConfig.key] ?? 0;
      const bVal = b[sortConfig.key] ?? 0;
      return sortConfig.direction === 'desc' ? bVal - aVal : aVal - bVal;
    });
  }, [detail?.companies, filterText, sortConfig]);

  if (loading) {
    return <div className="loading">Loading sector details...</div>;
  }

  if (!detail) {
    return <div className="error">Failed to load sector details</div>;
  }

  const { aggregate } = detail;

  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc'
    }));
  };

  const getSortIndicator = (key) => {
    if (sortConfig.key !== key) return '↕';
    return sortConfig.direction === 'desc' ? '↓' : '↑';
  };

  return (
    <div className="sector-detail">
      <button className="back-button" onClick={onBack}>
        &larr; Back to All Sectors
      </button>

      <div className="detail-header">
        <h2>{sector}</h2>
        <span className="company-count">{aggregate.company_count} companies</span>
      </div>

      {/* Aggregate Metrics */}
      <div className="aggregate-metrics">
        <div className="metric-card">
          <span className="label">Avg ROIC</span>
          <span className={`value ${getValueClass(aggregate.avg_roic, { good: 15, bad: 5 })}`}>
            {formatValue(aggregate.avg_roic, 'percent')}
          </span>
        </div>
        <div className="metric-card">
          <span className="label">Avg ROE</span>
          <span className={`value ${getValueClass(aggregate.avg_roe, { good: 15, bad: 5 })}`}>
            {formatValue(aggregate.avg_roe, 'percent')}
          </span>
        </div>
        <div className="metric-card">
          <span className="label">Avg Net Margin</span>
          <span className={`value ${getValueClass(aggregate.avg_net_margin, { good: 15, bad: 0 })}`}>
            {formatValue(aggregate.avg_net_margin, 'percent')}
          </span>
        </div>
        <div className="metric-card">
          <span className="label">Avg P/E</span>
          <span className="value">{formatValue(aggregate.avg_pe_ratio, 'ratio')}</span>
        </div>
        <div className="metric-card">
          <span className="label">Avg D/E</span>
          <span className={`value ${getValueClass(aggregate.avg_debt_to_equity, { bad: 2 })}`}>
            {formatValue(aggregate.avg_debt_to_equity, 'ratio')}
          </span>
        </div>
        <div className="metric-card">
          <span className="label">Avg Growth</span>
          <span className={`value ${getValueClass(aggregate.avg_revenue_growth, { good: 10, bad: 0 })}`}>
            {formatValue(aggregate.avg_revenue_growth, 'percent')}
          </span>
        </div>
        <div className="metric-card">
          <span className="label">Avg FCF Yield</span>
          <span className={`value ${getValueClass(aggregate.avg_fcf_yield, { good: 5, bad: 0 })}`}>
            {formatValue(aggregate.avg_fcf_yield, 'percent')}
          </span>
        </div>
        <div className="metric-card">
          <span className="label">Total Market Cap</span>
          <span className="value">{formatValue(aggregate.total_market_cap_b, 'currency')}</span>
        </div>
      </div>

      {/* Companies Table */}
      <div className="companies-table">
        <div className="table-header">
          <h3>Companies in {sector}</h3>
          <input
            type="text"
            placeholder="Filter companies..."
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            className="filter-input"
          />
        </div>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Company</th>
                <th className="sortable" onClick={() => handleSort('current_price')}>
                  Price {getSortIndicator('current_price')}
                </th>
                <th className="sortable" onClick={() => handleSort('change_ytd')}>
                  YTD {getSortIndicator('change_ytd')}
                </th>
                <th className="sortable" onClick={() => handleSort('change_1y')}>
                  1Y {getSortIndicator('change_1y')}
                </th>
                <th className="sortable" onClick={() => handleSort('market_cap_b')}>
                  Mkt Cap {getSortIndicator('market_cap_b')}
                </th>
                <th className="sortable" onClick={() => handleSort('roic')}>
                  ROIC {getSortIndicator('roic')}
                </th>
                <th className="sortable" onClick={() => handleSort('net_margin')}>
                  Margin {getSortIndicator('net_margin')}
                </th>
                <th className="sortable" onClick={() => handleSort('pe_ratio')}>
                  P/E {getSortIndicator('pe_ratio')}
                </th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sortedCompanies.map(company => (
                <tr key={company.symbol}>
                  <td>
                    <Link to={`/company/${company.symbol}`} className="symbol-link">
                      {company.symbol}
                    </Link>
                  </td>
                  <td className="company-name">{company.name}</td>
                  <td>{company.current_price ? `$${company.current_price.toFixed(2)}` : '-'}</td>
                  <td className={getValueClass(company.change_ytd, { good: 0, bad: -20 })}>
                    {company.change_ytd != null ? `${company.change_ytd > 0 ? '+' : ''}${company.change_ytd.toFixed(1)}%` : '-'}
                  </td>
                  <td className={getValueClass(company.change_1y, { good: 0, bad: -20 })}>
                    {company.change_1y != null ? `${company.change_1y > 0 ? '+' : ''}${company.change_1y.toFixed(1)}%` : '-'}
                  </td>
                  <td>{formatValue(company.market_cap_b, 'currency')}</td>
                  <td className={getValueClass(company.roic, { good: 15, bad: 5 })}>
                    {formatValue(company.roic, 'percent')}
                  </td>
                  <td className={getValueClass(company.net_margin, { good: 15, bad: 0 })}>
                    {formatValue(company.net_margin, 'percent')}
                  </td>
                  <td>{formatValue(company.pe_ratio, 'ratio')}</td>
                  <td>
                    <WatchlistButton
                      symbol={company.symbol}
                      name={company.name}
                      sector={sector}
                      size="small"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// Industry Detail Sub-component
function IndustryDetailView({ industry, detail, loading, onBack }) {
  const [sortConfig, setSortConfig] = useState({ key: 'market_cap_b', direction: 'desc' });
  const [filterText, setFilterText] = useState('');

  // Sort and filter companies
  const sortedCompanies = useMemo(() => {
    if (!detail?.companies) return [];

    let filtered = detail.companies.filter(c =>
      !filterText ||
      c.symbol?.toLowerCase().includes(filterText.toLowerCase()) ||
      c.name?.toLowerCase().includes(filterText.toLowerCase())
    );

    return [...filtered].sort((a, b) => {
      const aVal = a[sortConfig.key] ?? 0;
      const bVal = b[sortConfig.key] ?? 0;
      return sortConfig.direction === 'desc' ? bVal - aVal : aVal - bVal;
    });
  }, [detail?.companies, filterText, sortConfig]);

  if (loading) {
    return <div className="loading">Loading industry details...</div>;
  }

  if (!detail) {
    return <div className="error">Failed to load industry details</div>;
  }

  const { aggregate, companies } = detail;

  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc'
    }));
  };

  const getSortIndicator = (key) => {
    if (sortConfig.key !== key) return '↕';
    return sortConfig.direction === 'desc' ? '↓' : '↑';
  };

  return (
    <div className="industry-detail">
      <button className="back-button" onClick={onBack}>
        &larr; Back to All Industries
      </button>

      <div className="detail-header">
        <div>
          <h2>{industry}</h2>
          {aggregate.sector && <span className="sector-badge">{aggregate.sector}</span>}
        </div>
        <span className="company-count">{aggregate.company_count} companies</span>
      </div>

      {/* Aggregate Metrics */}
      <div className="aggregate-metrics">
        <div className="metric-card">
          <span className="label">Avg ROIC</span>
          <span className={`value ${getValueClass(aggregate.avg_roic, { good: 15, bad: 5 })}`}>
            {formatValue(aggregate.avg_roic, 'percent')}
          </span>
        </div>
        <div className="metric-card">
          <span className="label">Avg ROE</span>
          <span className={`value ${getValueClass(aggregate.avg_roe, { good: 15, bad: 5 })}`}>
            {formatValue(aggregate.avg_roe, 'percent')}
          </span>
        </div>
        <div className="metric-card">
          <span className="label">Avg Net Margin</span>
          <span className={`value ${getValueClass(aggregate.avg_net_margin, { good: 15, bad: 0 })}`}>
            {formatValue(aggregate.avg_net_margin, 'percent')}
          </span>
        </div>
        <div className="metric-card">
          <span className="label">Avg Op. Margin</span>
          <span className={`value ${getValueClass(aggregate.avg_operating_margin, { good: 20, bad: 5 })}`}>
            {formatValue(aggregate.avg_operating_margin, 'percent')}
          </span>
        </div>
        <div className="metric-card">
          <span className="label">Avg P/E</span>
          <span className="value">{formatValue(aggregate.avg_pe_ratio, 'ratio')}</span>
        </div>
        <div className="metric-card">
          <span className="label">Avg D/E</span>
          <span className={`value ${getValueClass(aggregate.avg_debt_to_equity, { bad: 2 })}`}>
            {formatValue(aggregate.avg_debt_to_equity, 'ratio')}
          </span>
        </div>
        <div className="metric-card">
          <span className="label">Avg Growth</span>
          <span className={`value ${getValueClass(aggregate.avg_revenue_growth, { good: 10, bad: 0 })}`}>
            {formatValue(aggregate.avg_revenue_growth, 'percent')}
          </span>
        </div>
        <div className="metric-card">
          <span className="label">Total Market Cap</span>
          <span className="value">{formatValue(aggregate.total_market_cap_b, 'currency')}</span>
        </div>
      </div>

      {/* Company Distribution Chart */}
      {companies.length > 0 && (
        <div className="industry-charts">
          <MetricsBarChart
            data={companies
              .filter(c => c.roic != null)
              .sort((a, b) => (b.roic || 0) - (a.roic || 0))
              .slice(0, 10)
              .map(c => ({ name: c.symbol, value: c.roic }))}
            metric={`Top Companies by ROIC in ${industry}`}
            format="percent"
            colorScale="threshold"
            thresholds={{ good: 15, bad: 5 }}
          />
        </div>
      )}

      {/* Companies Table */}
      <div className="companies-table">
        <div className="table-header">
          <h3>Companies in {industry}</h3>
          <input
            type="text"
            placeholder="Filter companies..."
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            className="filter-input"
          />
        </div>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Company</th>
                <th className="sortable" onClick={() => handleSort('current_price')}>
                  Price {getSortIndicator('current_price')}
                </th>
                <th className="sortable" onClick={() => handleSort('change_ytd')}>
                  YTD {getSortIndicator('change_ytd')}
                </th>
                <th className="sortable" onClick={() => handleSort('change_1y')}>
                  1Y {getSortIndicator('change_1y')}
                </th>
                <th className="sortable" onClick={() => handleSort('market_cap_b')}>
                  Mkt Cap {getSortIndicator('market_cap_b')}
                </th>
                <th className="sortable" onClick={() => handleSort('roic')}>
                  ROIC {getSortIndicator('roic')}
                </th>
                <th className="sortable" onClick={() => handleSort('roe')}>
                  ROE {getSortIndicator('roe')}
                </th>
                <th className="sortable" onClick={() => handleSort('gross_margin')}>
                  Gross {getSortIndicator('gross_margin')}
                </th>
                <th className="sortable" onClick={() => handleSort('operating_margin')}>
                  Op. {getSortIndicator('operating_margin')}
                </th>
                <th className="sortable" onClick={() => handleSort('net_margin')}>
                  Net {getSortIndicator('net_margin')}
                </th>
                <th className="sortable" onClick={() => handleSort('pe_ratio')}>
                  P/E {getSortIndicator('pe_ratio')}
                </th>
                <th className="sortable" onClick={() => handleSort('revenue_growth')}>
                  Growth {getSortIndicator('revenue_growth')}
                </th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sortedCompanies.map(company => (
                <tr key={company.symbol}>
                  <td>
                    <Link to={`/company/${company.symbol}`} className="symbol-link">
                      {company.symbol}
                    </Link>
                  </td>
                  <td className="company-name">{company.name}</td>
                  <td>{company.current_price ? `$${company.current_price.toFixed(2)}` : '-'}</td>
                  <td className={getValueClass(company.change_ytd, { good: 0, bad: -20 })}>
                    {company.change_ytd != null ? `${company.change_ytd > 0 ? '+' : ''}${company.change_ytd.toFixed(1)}%` : '-'}
                  </td>
                  <td className={getValueClass(company.change_1y, { good: 0, bad: -20 })}>
                    {company.change_1y != null ? `${company.change_1y > 0 ? '+' : ''}${company.change_1y.toFixed(1)}%` : '-'}
                  </td>
                  <td>{formatValue(company.market_cap_b, 'currency')}</td>
                  <td className={getValueClass(company.roic, { good: 15, bad: 5 })}>
                    {formatValue(company.roic, 'percent')}
                  </td>
                  <td className={getValueClass(company.roe, { good: 15, bad: 5 })}>
                    {formatValue(company.roe, 'percent')}
                  </td>
                  <td className={getValueClass(company.gross_margin, { good: 40, bad: 20 })}>
                    {formatValue(company.gross_margin, 'percent')}
                  </td>
                  <td className={getValueClass(company.operating_margin, { good: 20, bad: 5 })}>
                    {formatValue(company.operating_margin, 'percent')}
                  </td>
                  <td className={getValueClass(company.net_margin, { good: 15, bad: 0 })}>
                    {formatValue(company.net_margin, 'percent')}
                  </td>
                  <td>{formatValue(company.pe_ratio, 'ratio')}</td>
                  <td className={getValueClass(company.revenue_growth, { good: 10, bad: 0 })}>
                    {formatValue(company.revenue_growth, 'percent')}
                  </td>
                  <td>
                    <WatchlistButton
                      symbol={company.symbol}
                      name={company.name}
                      sector={aggregate.sector}
                      size="small"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default SectorAnalysisPage;

// frontend/src/pages/SectorAnalysisPage.js
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { sectorsAPI, classificationsAPI } from '../services/api';
import {
  PeriodToggle,
  MultiMetricChart,
  WatchlistButton,
  SortableTable,
  MetricsBarChart
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
  { value: 'net_margin', label: 'Net Margin' },
  { value: 'operating_margin', label: 'Operating Margin' },
  { value: 'fcf_yield', label: 'FCF Yield' },
  { value: 'revenue_growth_yoy', label: 'Revenue Growth' }
];

// View modes for sector overview
const VIEW_MODES = [
  { id: 'cards', label: 'Cards', icon: '⊞' },
  { id: 'chart', label: 'Charts', icon: '📊' },
  { id: 'table', label: 'Table', icon: '☰' }
];

function SectorAnalysisPage() {
  const [activeTab, setActiveTab] = useState('overview');
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

  // Top performers controls
  const [topMetric, setTopMetric] = useState('roic');
  const [topLimit, setTopLimit] = useState(5);

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
        loadCustomClassifications()
      ]);
      setLoading(false);
    };
    loadData();
  }, [loadOverview, loadRotation, loadTopPerformers, loadMargins, loadIndustries, loadCustomClassifications]);

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

  // Sector table columns
  const sectorTableColumns = [
    { key: 'sector', label: 'Sector', className: 'sector-name' },
    { key: 'company_count', label: 'Companies', format: 'integer' },
    { key: 'avg_roic', label: 'Avg ROIC', format: 'percent', thresholds: { good: 15, bad: 5 } },
    { key: 'avg_net_margin', label: 'Net Margin', format: 'percent', thresholds: { good: 15, bad: 0 } },
    { key: 'avg_pe_ratio', label: 'P/E', format: 'ratio' },
    { key: 'avg_debt_to_equity', label: 'D/E', format: 'ratio', thresholds: { bad: 2 } },
    { key: 'avg_revenue_growth', label: 'Growth', format: 'percent', thresholds: { good: 10, bad: 0 } },
    { key: 'total_market_cap_b', label: 'Mkt Cap', format: 'currency' }
  ];

  // Industry table columns
  const industryTableColumns = [
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
    { key: 'company_count', label: 'Companies', format: 'integer' },
    { key: 'avg_roic', label: 'Avg ROIC', format: 'percent', thresholds: { good: 15, bad: 5 } },
    { key: 'avg_gross_margin', label: 'Gross', format: 'percent', thresholds: { good: 40, bad: 20 } },
    { key: 'avg_operating_margin', label: 'Op.', format: 'percent', thresholds: { good: 20, bad: 5 } },
    { key: 'avg_net_margin', label: 'Net', format: 'percent', thresholds: { good: 15, bad: 0 } },
    { key: 'avg_fcf_margin', label: 'FCF', format: 'percent', thresholds: { good: 15, bad: 0 } }
  ];

  if (loading) {
    return <div className="loading">Loading sector analysis...</div>;
  }

  return (
    <div className="sector-analysis-page">
      <div className="page-header">
        <div>
          <h1>Sector Analysis</h1>
          <p>Industry-level aggregations and performance insights</p>
        </div>
        <PeriodToggle
          value={periodType}
          onChange={setPeriodType}
          availablePeriods={[
            { period_type: 'annual', count: 1 },
            { period_type: 'quarterly', count: 1 }
          ]}
        />
      </div>

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
                <SortableTable
                  data={filteredSectors}
                  columns={sectorTableColumns}
                  defaultSort={{ key: 'company_count', direction: 'desc' }}
                  onRowClick={(row) => setSelectedSector(row.sector)}
                  emptyMessage="No sectors found"
                />
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

              <SortableTable
                data={filteredIndustries}
                columns={industryTableColumns}
                defaultSort={{ key: 'company_count', direction: 'desc' }}
                emptyMessage="No industries found"
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

          {/* Rotation Table */}
          <div className="rotation-table">
            <table>
              <thead>
                <tr>
                  <th>Sector</th>
                  <th>Momentum</th>
                  <th>ROIC Chg</th>
                  <th>ROE Chg</th>
                  <th>Margin Chg</th>
                  <th>Current ROIC</th>
                  <th>Current Margin</th>
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
                      <td className={getValueClass(sector.trends?.roic_change, { good: 0 })}>
                        {sector.trends?.roic_change != null
                          ? `${sector.trends.roic_change > 0 ? '+' : ''}${sector.trends.roic_change}%`
                          : '-'}
                      </td>
                      <td className={getValueClass(sector.trends?.roe_change, { good: 0 })}>
                        {sector.trends?.roe_change != null
                          ? `${sector.trends.roe_change > 0 ? '+' : ''}${sector.trends.roe_change}%`
                          : '-'}
                      </td>
                      <td className={getValueClass(sector.trends?.margin_change, { good: 0 })}>
                        {sector.trends?.margin_change != null
                          ? `${sector.trends.margin_change > 0 ? '+' : ''}${sector.trends.margin_change}%`
                          : '-'}
                      </td>
                      <td>{formatValue(latest?.avg_roic, 'percent')}</td>
                      <td>{formatValue(latest?.avg_net_margin, 'percent')}</td>
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

          <div className="margin-table">
            <table>
              <thead>
                <tr>
                  <th>Industry</th>
                  <th>Sector</th>
                  <th>Companies</th>
                  <th>Gross Margin</th>
                  <th>Op. Margin</th>
                  <th>Net Margin</th>
                  <th>FCF Margin</th>
                </tr>
              </thead>
              <tbody>
                {marginData.map((row, idx) => (
                  <tr key={`${row.sector}-${row.industry}-${idx}`}>
                    <td className="industry-name">{row.industry}</td>
                    <td className="sector-name">{row.sector}</td>
                    <td className="company-count">{row.company_count}</td>
                    <td>
                      <div className="margin-cell">
                        <span className={getValueClass(row.avg_gross_margin, { good: 40, bad: 20 })}>
                          {formatValue(row.avg_gross_margin, 'percent')}
                        </span>
                        <span className="range">
                          ({formatValue(row.min_gross_margin, 'percent')} - {formatValue(row.max_gross_margin, 'percent')})
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="margin-cell">
                        <span className={getValueClass(row.avg_operating_margin, { good: 20, bad: 5 })}>
                          {formatValue(row.avg_operating_margin, 'percent')}
                        </span>
                        <span className="range">
                          ({formatValue(row.min_operating_margin, 'percent')} - {formatValue(row.max_operating_margin, 'percent')})
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="margin-cell">
                        <span className={getValueClass(row.avg_net_margin, { good: 15, bad: 0 })}>
                          {formatValue(row.avg_net_margin, 'percent')}
                        </span>
                        <span className="range">
                          ({formatValue(row.min_net_margin, 'percent')} - {formatValue(row.max_net_margin, 'percent')})
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className={getValueClass(row.avg_fcf_margin, { good: 15, bad: 0 })}>
                        {formatValue(row.avg_fcf_margin, 'percent')}
                      </span>
                    </td>
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
                <th>Industry</th>
                <th className="sortable" onClick={() => handleSort('market_cap_b')}>
                  Mkt Cap {getSortIndicator('market_cap_b')}
                </th>
                <th className="sortable" onClick={() => handleSort('roic')}>
                  ROIC {getSortIndicator('roic')}
                </th>
                <th className="sortable" onClick={() => handleSort('roe')}>
                  ROE {getSortIndicator('roe')}
                </th>
                <th className="sortable" onClick={() => handleSort('net_margin')}>
                  Net Margin {getSortIndicator('net_margin')}
                </th>
                <th className="sortable" onClick={() => handleSort('pe_ratio')}>
                  P/E {getSortIndicator('pe_ratio')}
                </th>
                <th className="sortable" onClick={() => handleSort('debt_to_equity')}>
                  D/E {getSortIndicator('debt_to_equity')}
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
                  <td className="industry">{company.industry}</td>
                  <td>{formatValue(company.market_cap_b, 'currency')}</td>
                  <td className={getValueClass(company.roic, { good: 15, bad: 5 })}>
                    {formatValue(company.roic, 'percent')}
                  </td>
                  <td className={getValueClass(company.roe, { good: 15, bad: 5 })}>
                    {formatValue(company.roe, 'percent')}
                  </td>
                  <td className={getValueClass(company.net_margin, { good: 15, bad: 0 })}>
                    {formatValue(company.net_margin, 'percent')}
                  </td>
                  <td>{formatValue(company.pe_ratio, 'ratio')}</td>
                  <td className={getValueClass(company.debt_to_equity, { bad: 2 })}>
                    {formatValue(company.debt_to_equity, 'ratio')}
                  </td>
                  <td className={getValueClass(company.revenue_growth, { good: 10, bad: 0 })}>
                    {formatValue(company.revenue_growth, 'percent')}
                  </td>
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

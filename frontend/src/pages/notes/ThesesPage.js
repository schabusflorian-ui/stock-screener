import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Target, Plus, TrendingUp, TrendingDown, AlertTriangle, CheckCircle,
  XCircle, Clock, Calendar, ChevronRight, Filter, Building2
} from '../../components/icons';
import { thesesAPI } from '../../services/api';
import {
  PageHeader, Section, Card, Grid, Button, Badge, EmptyState
} from '../../components/ui';
import ThesisEditor from './ThesisEditor';
import './ThesesPage.css';

function ThesesPage() {
  const navigate = useNavigate();

  // State
  const [dashboard, setDashboard] = useState(null);
  const [theses, setTheses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('active');
  const [showEditor, setShowEditor] = useState(false);
  const [editingThesis, setEditingThesis] = useState(null);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [dashboardRes, thesesRes] = await Promise.all([
        thesesAPI.getDashboard(),
        thesesAPI.getAll(statusFilter === 'all' ? null : statusFilter)
      ]);

      setDashboard(dashboardRes.data.dashboard);
      setTheses(thesesRes.data.theses || []);
    } catch (error) {
      console.error('Error loading theses data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveThesis = async (thesisData) => {
    try {
      if (editingThesis) {
        await thesesAPI.update(editingThesis.id, thesisData);
      } else {
        await thesesAPI.create(thesisData);
      }
      setShowEditor(false);
      setEditingThesis(null);
      loadData();
    } catch (error) {
      console.error('Error saving thesis:', error);
      throw error;
    }
  };

  const handleCloseEditor = () => {
    setShowEditor(false);
    setEditingThesis(null);
  };

  if (showEditor) {
    return (
      <ThesisEditor
        thesis={editingThesis}
        onSave={handleSaveThesis}
        onClose={handleCloseEditor}
      />
    );
  }

  return (
    <div className="theses-page">
      <PageHeader
        title="Investment Theses"
        subtitle="Track your investment theses with assumptions and catalysts"
        icon={<Target size={28} />}
        actions={
          <div className="header-actions">
            <Button
              variant="primary"
              onClick={() => {
                setEditingThesis(null);
                setShowEditor(true);
              }}
            >
              <Plus size={16} />
              New Thesis
            </Button>
            <Button
              variant="secondary"
              onClick={() => navigate('/notes')}
            >
              Research Notes
            </Button>
          </div>
        }
      />

      {/* Summary Cards */}
      {dashboard && (
        <Section>
          <Grid cols={5}>
            <Card className="summary-card">
              <div className="summary-value">{dashboard.summary?.active_count || 0}</div>
              <div className="summary-label">Active Theses</div>
            </Card>
            <Card className="summary-card">
              <div className="summary-value success">{dashboard.summary?.achieved_count || 0}</div>
              <div className="summary-label">Achieved</div>
            </Card>
            <Card className="summary-card">
              <div className="summary-value danger">{dashboard.summary?.invalidated_count || 0}</div>
              <div className="summary-label">Invalidated</div>
            </Card>
            <Card className="summary-card">
              <div className="summary-value">{dashboard.summary?.long_count || 0}</div>
              <div className="summary-label">Long Positions</div>
            </Card>
            <Card className="summary-card">
              <div className="summary-value">{dashboard.summary?.short_count || 0}</div>
              <div className="summary-label">Short Positions</div>
            </Card>
          </Grid>
        </Section>
      )}

      {/* Alerts Section */}
      {dashboard?.thesesWithBrokenAssumptions?.length > 0 && (
        <Section title="Attention Required" icon={<AlertTriangle className="text-warning" />}>
          <div className="alert-cards">
            {dashboard.thesesWithBrokenAssumptions.map(thesis => (
              <Card key={thesis.id} className="alert-card">
                <div className="alert-content">
                  <AlertTriangle size={20} className="text-warning" />
                  <div>
                    <strong>{thesis.symbol}</strong> - {thesis.title}
                    <span className="alert-detail">
                      {thesis.broken_count} broken assumption{thesis.broken_count > 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="small"
                  onClick={() => {
                    setEditingThesis(thesis);
                    setShowEditor(true);
                  }}
                >
                  Review
                  <ChevronRight size={16} />
                </Button>
              </Card>
            ))}
          </div>
        </Section>
      )}

      {/* Upcoming Catalysts */}
      {dashboard?.upcomingCatalysts?.length > 0 && (
        <Section title="Upcoming Catalysts" icon={<Calendar />}>
          <div className="catalyst-list">
            {dashboard.upcomingCatalysts.map(catalyst => (
              <Card key={catalyst.id} className="catalyst-card">
                <div className="catalyst-date">
                  {new Date(catalyst.expected_date).toLocaleDateString('en-US', {
                    month: 'short', day: 'numeric'
                  })}
                </div>
                <div className="catalyst-content">
                  <div className="catalyst-symbol">{catalyst.symbol}</div>
                  <div className="catalyst-text">{catalyst.catalyst_text}</div>
                </div>
                <Badge variant={catalyst.expected_impact === 'high' ? 'danger' : 'secondary'}>
                  {catalyst.expected_impact}
                </Badge>
              </Card>
            ))}
          </div>
        </Section>
      )}

      {/* Status Filter */}
      <div className="filter-bar">
        <div className="filter-group">
          <Filter size={16} />
          <span>Status:</span>
          {['all', 'active', 'achieved', 'invalidated', 'closed'].map(status => (
            <button
              key={status}
              className={`filter-btn ${statusFilter === status ? 'active' : ''}`}
              onClick={() => setStatusFilter(status)}
            >
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Theses List */}
      <Section>
        {loading ? (
          <div className="loading-state">Loading theses...</div>
        ) : theses.length === 0 ? (
          <EmptyState
            icon={<Target size={48} />}
            title="No theses yet"
            description="Create structured investment theses to track your ideas"
            action={
              <Button variant="primary" onClick={() => setShowEditor(true)}>
                <Plus size={16} />
                Create your first thesis
              </Button>
            }
          />
        ) : (
          <div className="theses-grid">
            {theses.map(thesis => (
              <ThesisCard
                key={thesis.id}
                thesis={thesis}
                onEdit={() => {
                  setEditingThesis(thesis);
                  setShowEditor(true);
                }}
                onView={() => navigate(`/theses/${thesis.id}`)}
              />
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

// Thesis Card Component
function ThesisCard({ thesis, onEdit, onView }) {
  const TypeIcon = {
    long: TrendingUp,
    short: TrendingDown,
    hold: Clock,
    avoid: XCircle
  }[thesis.thesis_type] || Target;

  const statusVariants = {
    active: 'success',
    achieved: 'primary',
    invalidated: 'danger',
    expired: 'warning',
    closed: 'secondary'
  };

  const convictionStars = '★'.repeat(thesis.conviction_level || 0) + '☆'.repeat(5 - (thesis.conviction_level || 0));

  return (
    <Card className={`thesis-card ${thesis.thesis_status}`}>
      <div className="thesis-header">
        <div className="thesis-type">
          <TypeIcon size={16} />
          <span>{thesis.thesis_type}</span>
        </div>
        <Badge variant={statusVariants[thesis.thesis_status] || 'secondary'}>
          {thesis.thesis_status}
        </Badge>
      </div>

      <div className="thesis-symbol" onClick={onView}>
        <Building2 size={20} />
        <span className="symbol">{thesis.symbol}</span>
        {thesis.company_name && <span className="name">{thesis.company_name}</span>}
      </div>

      <h3 className="thesis-title" onClick={onView}>{thesis.title}</h3>

      <div className="thesis-metrics">
        {thesis.target_price && (
          <div className="metric">
            <span className="label">Target</span>
            <span className="value">${thesis.target_price.toFixed(2)}</span>
            {thesis.upside && (
              <span className={`change ${parseFloat(thesis.upside) >= 0 ? 'positive' : 'negative'}`}>
                {parseFloat(thesis.upside) >= 0 ? '+' : ''}{thesis.upside}%
              </span>
            )}
          </div>
        )}
        {thesis.entry_price && (
          <div className="metric">
            <span className="label">Entry</span>
            <span className="value">${thesis.entry_price.toFixed(2)}</span>
          </div>
        )}
        {thesis.time_horizon_months && (
          <div className="metric">
            <span className="label">Horizon</span>
            <span className="value">{thesis.time_horizon_months}mo</span>
          </div>
        )}
      </div>

      <div className="thesis-conviction">
        <span className="label">Conviction</span>
        <span className="stars">{convictionStars}</span>
      </div>

      {/* Assumptions/Catalysts Summary */}
      <div className="thesis-status-bar">
        <div className="status-item">
          <CheckCircle size={14} />
          <span>{thesis.assumptions_count || 0} assumptions</span>
          {thesis.broken_assumptions > 0 && (
            <Badge variant="danger" size="small">{thesis.broken_assumptions} broken</Badge>
          )}
        </div>
        <div className="status-item">
          <Calendar size={14} />
          <span>{thesis.catalysts_count || 0} catalysts</span>
          {thesis.pending_catalysts > 0 && (
            <Badge variant="warning" size="small">{thesis.pending_catalysts} pending</Badge>
          )}
        </div>
      </div>

      <div className="thesis-actions">
        <Button variant="secondary" size="small" onClick={onEdit}>
          Edit
        </Button>
        <Button variant="ghost" size="small" onClick={onView}>
          View Details
          <ChevronRight size={14} />
        </Button>
      </div>
    </Card>
  );
}

export default ThesesPage;

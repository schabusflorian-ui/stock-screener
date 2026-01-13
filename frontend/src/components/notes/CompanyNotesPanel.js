// frontend/src/components/notes/CompanyNotesPanel.js
// Panel for displaying notes and thesis related to a specific company

import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  FileText,
  Target,
  Plus,
  Calendar,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  Clock,
  ChevronRight,
  BookOpen,
  Tag,
  Camera
} from 'lucide-react';
import { notesAPI, thesesAPI } from '../../services/api';
import './CompanyNotesPanel.css';

function CompanyNotesPanel({ symbol, companyName }) {
  const navigate = useNavigate();
  const [notes, setNotes] = useState([]);
  const [thesis, setThesis] = useState(null);
  const [snapshots, setSnapshots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview'); // 'overview', 'notes', 'thesis', 'snapshots'

  const loadData = useCallback(async () => {
    if (!symbol) return;

    setLoading(true);
    try {
      // Load notes for this company using the dedicated endpoint
      const [companyDataRes, thesesRes] = await Promise.all([
        notesAPI.getByCompany(symbol),
        thesesAPI.getByCompany(symbol)
      ]);

      setNotes(companyDataRes.data.notes || []);
      setThesis(thesesRes.data.activeThesis || null);
      setSnapshots(companyDataRes.data.snapshots || []);
    } catch (error) {
      console.error('Error loading notes data:', error);
    } finally {
      setLoading(false);
    }
  }, [symbol]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreateNote = () => {
    navigate(`/notes/new?company=${symbol}`);
  };

  const handleCreateThesis = () => {
    navigate(`/theses/new?symbol=${symbol}&name=${encodeURIComponent(companyName || symbol)}`);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
  };

  const getConvictionColor = (conviction) => {
    if (conviction >= 80) return 'high';
    if (conviction >= 60) return 'medium';
    return 'low';
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'active': return <CheckCircle size={14} />;
      case 'monitoring': return <Clock size={14} />;
      case 'invalidated': return <AlertTriangle size={14} />;
      case 'realized': return <TrendingUp size={14} />;
      default: return <Target size={14} />;
    }
  };

  if (loading) {
    return (
      <div className="company-notes-panel loading">
        <div className="loading-spinner" />
        <span>Loading research...</span>
      </div>
    );
  }

  // Overview tab shows summary of everything
  const renderOverview = () => (
    <div className="notes-panel-overview">
      {/* Active Thesis Summary */}
      {thesis ? (
        <div className={`thesis-summary-card status-${thesis.status}`}>
          <div className="thesis-summary-header">
            <div className="thesis-type-badge">{thesis.thesis_type}</div>
            {getStatusIcon(thesis.status)}
          </div>
          <h4 className="thesis-summary-title">{thesis.title}</h4>
          <div className="thesis-summary-metrics">
            <div className="thesis-metric">
              <span className="label">Conviction</span>
              <span className={`value conviction-${getConvictionColor(thesis.conviction_level)}`}>
                {thesis.conviction_level}%
              </span>
            </div>
            {thesis.target_price && (
              <div className="thesis-metric">
                <span className="label">Target</span>
                <span className="value">${thesis.target_price}</span>
              </div>
            )}
            {thesis.assumptions_count > 0 && (
              <div className="thesis-metric">
                <span className="label">Assumptions</span>
                <span className="value">
                  {thesis.valid_assumptions || 0}/{thesis.assumptions_count}
                </span>
              </div>
            )}
          </div>
          <Link to={`/theses/${thesis.id}`} className="thesis-summary-link">
            View Thesis <ChevronRight size={14} />
          </Link>
        </div>
      ) : (
        <div className="no-thesis-card">
          <Target size={24} />
          <p>No investment thesis for {symbol}</p>
          <button onClick={handleCreateThesis} className="create-thesis-btn">
            <Plus size={14} /> Create Thesis
          </button>
        </div>
      )}

      {/* Recent Notes */}
      <div className="recent-notes-section">
        <div className="section-header">
          <h4><BookOpen size={16} /> Recent Notes</h4>
          <button onClick={handleCreateNote} className="add-note-btn" title="New Note">
            <Plus size={14} />
          </button>
        </div>
        {notes.length > 0 ? (
          <div className="recent-notes-list">
            {notes.slice(0, 3).map(note => (
              <Link key={note.id} to={`/notes/${note.id}`} className="recent-note-item">
                <div className="note-item-header">
                  <span className="note-title">{note.title}</span>
                  <span className="note-date">{formatDate(note.updated_at)}</span>
                </div>
                {note.tagNames && note.tagNames.length > 0 && (
                  <div className="note-tags">
                    {note.tagNames.slice(0, 3).map(tag => (
                      <span key={tag} className="note-tag">{tag}</span>
                    ))}
                  </div>
                )}
              </Link>
            ))}
            {notes.length > 3 && (
              <Link to={`/notes?company=${symbol}`} className="view-all-notes">
                View all {notes.length} notes <ChevronRight size={14} />
              </Link>
            )}
          </div>
        ) : (
          <div className="no-notes-message">
            <FileText size={20} />
            <p>No notes yet</p>
            <button onClick={handleCreateNote} className="create-note-btn">
              Add Research Note
            </button>
          </div>
        )}
      </div>

      {/* Recent Snapshots */}
      {snapshots.length > 0 && (
        <div className="snapshots-section">
          <div className="section-header">
            <h4><Camera size={16} /> Data Snapshots</h4>
          </div>
          <div className="snapshots-list">
            {snapshots.slice(0, 2).map(snapshot => (
              <div key={snapshot.id} className="snapshot-item">
                <div className="snapshot-date">
                  <Calendar size={12} />
                  {formatDate(snapshot.snapshot_date)}
                </div>
                <div className="snapshot-metrics">
                  {snapshot.price && (
                    <span className="snapshot-metric">
                      ${snapshot.price.toFixed(2)}
                    </span>
                  )}
                  {snapshot.pe_ratio && (
                    <span className="snapshot-metric">
                      PE: {snapshot.pe_ratio.toFixed(1)}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  // Full notes list
  const renderNotes = () => (
    <div className="notes-panel-notes">
      <div className="panel-header">
        <h4>Research Notes</h4>
        <button onClick={handleCreateNote} className="add-btn">
          <Plus size={14} /> New Note
        </button>
      </div>
      {notes.length > 0 ? (
        <div className="notes-list">
          {notes.map(note => (
            <Link key={note.id} to={`/notes/${note.id}`} className="note-card">
              <div className="note-card-header">
                <span className="note-title">{note.title}</span>
                <span className={`note-type type-${note.note_type}`}>{note.note_type}</span>
              </div>
              <div className="note-card-meta">
                <span className="note-date">
                  <Calendar size={12} /> {formatDate(note.updated_at)}
                </span>
                {note.notebook_name && (
                  <span className="note-notebook">{note.notebook_name}</span>
                )}
              </div>
              {note.tagNames && note.tagNames.length > 0 && (
                <div className="note-tags">
                  <Tag size={12} />
                  {note.tagNames.map(tag => (
                    <span key={tag} className="tag">{tag}</span>
                  ))}
                </div>
              )}
            </Link>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <FileText size={32} />
          <p>No notes for {symbol}</p>
          <button onClick={handleCreateNote} className="primary-btn">
            Create First Note
          </button>
        </div>
      )}
    </div>
  );

  // Full thesis view
  const renderThesis = () => (
    <div className="notes-panel-thesis">
      {thesis ? (
        <div className="thesis-detail">
          <div className="thesis-header">
            <div className="thesis-badges">
              <span className={`status-badge status-${thesis.status}`}>{thesis.status}</span>
              <span className="type-badge">{thesis.thesis_type}</span>
            </div>
            <Link to={`/theses/${thesis.id}/edit`} className="edit-link">Edit</Link>
          </div>

          <h3 className="thesis-title">{thesis.title}</h3>

          <div className="thesis-metrics-grid">
            <div className="metric-box">
              <span className="label">Conviction</span>
              <span className={`value large conviction-${getConvictionColor(thesis.conviction_level)}`}>
                {thesis.conviction_level}%
              </span>
            </div>
            {thesis.target_price && (
              <div className="metric-box">
                <span className="label">Target Price</span>
                <span className="value large">${thesis.target_price}</span>
              </div>
            )}
            {thesis.time_horizon && (
              <div className="metric-box">
                <span className="label">Time Horizon</span>
                <span className="value">{thesis.time_horizon}</span>
              </div>
            )}
            {thesis.risk_level && (
              <div className="metric-box">
                <span className="label">Risk Level</span>
                <span className={`value risk-${thesis.risk_level}`}>{thesis.risk_level}</span>
              </div>
            )}
          </div>

          {thesis.core_thesis && (
            <div className="thesis-section">
              <h4>Core Thesis</h4>
              <p>{thesis.core_thesis}</p>
            </div>
          )}

          {/* Key Assumptions */}
          {thesis.assumptions && thesis.assumptions.length > 0 && (
            <div className="thesis-section">
              <h4>Key Assumptions</h4>
              <div className="assumptions-list">
                {thesis.assumptions.slice(0, 5).map(assumption => (
                  <div key={assumption.id} className={`assumption-item status-${assumption.status}`}>
                    <div className="assumption-status">
                      {assumption.status === 'valid' && <CheckCircle size={14} />}
                      {assumption.status === 'invalid' && <AlertTriangle size={14} />}
                      {assumption.status === 'pending' && <Clock size={14} />}
                    </div>
                    <span className="assumption-text">{assumption.assumption_text}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Upcoming Catalysts */}
          {thesis.catalysts && thesis.catalysts.filter(c => c.status === 'pending').length > 0 && (
            <div className="thesis-section">
              <h4>Upcoming Catalysts</h4>
              <div className="catalysts-list">
                {thesis.catalysts
                  .filter(c => c.status === 'pending')
                  .slice(0, 3)
                  .map(catalyst => (
                    <div key={catalyst.id} className="catalyst-item">
                      <Calendar size={14} />
                      <span className="catalyst-date">
                        {catalyst.expected_date ? formatDate(catalyst.expected_date) : 'TBD'}
                      </span>
                      <span className="catalyst-text">{catalyst.description}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          <Link to={`/theses/${thesis.id}`} className="view-full-thesis">
            View Full Thesis <ChevronRight size={14} />
          </Link>
        </div>
      ) : (
        <div className="empty-state">
          <Target size={32} />
          <h4>No Investment Thesis</h4>
          <p>Create a structured thesis to track your investment case for {symbol}</p>
          <button onClick={handleCreateThesis} className="primary-btn">
            Create Thesis
          </button>
        </div>
      )}
    </div>
  );

  // Snapshots comparison view
  const renderSnapshots = () => (
    <div className="notes-panel-snapshots">
      <div className="panel-header">
        <h4>Data Snapshots</h4>
      </div>
      {snapshots.length > 0 ? (
        <div className="snapshots-table">
          <div className="snapshots-table-header">
            <span>Date</span>
            <span>Price</span>
            <span>P/E</span>
            <span>P/B</span>
            <span>ROIC</span>
            <span>Note</span>
          </div>
          {snapshots.map(snapshot => (
            <div key={snapshot.id} className="snapshot-row">
              <span className="date">{formatDate(snapshot.snapshot_date)}</span>
              <span className="price">${snapshot.price?.toFixed(2) || '-'}</span>
              <span>{snapshot.pe_ratio?.toFixed(1) || '-'}</span>
              <span>{snapshot.pb_ratio?.toFixed(1) || '-'}</span>
              <span>{(snapshot.roic * 100)?.toFixed(1) || '-'}%</span>
              <Link to={`/notes/${snapshot.note_id}`} className="note-link">
                {snapshot.note_title || 'View'}
              </Link>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <Camera size={32} />
          <p>No snapshots captured</p>
          <p className="hint">Snapshots are captured when you create notes with company attachments</p>
        </div>
      )}
    </div>
  );

  return (
    <div className="company-notes-panel">
      {/* Tab Navigation */}
      <div className="notes-panel-tabs">
        <button
          className={activeTab === 'overview' ? 'active' : ''}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button
          className={activeTab === 'notes' ? 'active' : ''}
          onClick={() => setActiveTab('notes')}
        >
          Notes {notes.length > 0 && <span className="count">{notes.length}</span>}
        </button>
        <button
          className={activeTab === 'thesis' ? 'active' : ''}
          onClick={() => setActiveTab('thesis')}
        >
          Thesis {thesis && <span className="indicator" />}
        </button>
        <button
          className={activeTab === 'snapshots' ? 'active' : ''}
          onClick={() => setActiveTab('snapshots')}
        >
          Snapshots {snapshots.length > 0 && <span className="count">{snapshots.length}</span>}
        </button>
      </div>

      {/* Tab Content */}
      <div className="notes-panel-content">
        {activeTab === 'overview' && renderOverview()}
        {activeTab === 'notes' && renderNotes()}
        {activeTab === 'thesis' && renderThesis()}
        {activeTab === 'snapshots' && renderSnapshots()}
      </div>
    </div>
  );
}

export default CompanyNotesPanel;

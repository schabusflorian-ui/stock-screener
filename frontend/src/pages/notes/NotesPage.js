import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import {
  Book, Plus, Search, Tag, Pin, Trash2, Edit3, Clock,
  FileText, Target, Calendar, Building2, TrendingUp, TrendingDown,
  XCircle, CheckCircle, ChevronRight, Wallet
} from 'lucide-react';
import { notesAPI, thesesAPI } from '../../services/api';
import {
  PageHeader, Button, EmptyState, Badge, Card
} from '../../components/ui';
import NoteEditor from './NoteEditor';
import ThesisEditor from './ThesisEditor';
import './NotesPage.css';

function NotesPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  // Determine active view from URL or default to notes
  const isThesesView = location.pathname === '/theses' || searchParams.get('view') === 'theses';
  const [activeView, setActiveView] = useState(isThesesView ? 'theses' : 'notes');

  // Notes State
  const [notebooks, setNotebooks] = useState([]);
  const [notes, setNotes] = useState([]);
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNotebook, setSelectedNotebook] = useState(null);
  const [selectedTags, setSelectedTags] = useState([]);
  const [editingNote, setEditingNote] = useState(null);
  const [showEditor, setShowEditor] = useState(false);

  // Theses State
  const [theses, setTheses] = useState([]);
  const [thesesDashboard, setThesesDashboard] = useState(null);
  const [thesesStatusFilter, setThesesStatusFilter] = useState('active');
  const [editingThesis, setEditingThesis] = useState(null);
  const [showThesisEditor, setShowThesisEditor] = useState(false);

  // Filter State (shared)
  const [symbolFilter, setSymbolFilter] = useState('');
  const [noteTypeFilter, setNoteTypeFilter] = useState('all');

  // Load initial data
  useEffect(() => {
    loadData();
    loadThesesData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reload theses when filter changes
  useEffect(() => {
    if (thesesStatusFilter) {
      loadThesesData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thesesStatusFilter]);

  // Handle URL params for editing
  useEffect(() => {
    const noteId = searchParams.get('note');
    const action = searchParams.get('action');

    if (noteId && action === 'edit') {
      loadNoteForEditing(parseInt(noteId));
    } else if (action === 'new') {
      setEditingNote(null);
      setShowEditor(true);
    }
  }, [searchParams]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [notebooksRes, notesRes, tagsRes] = await Promise.all([
        notesAPI.getNotebooks(),
        notesAPI.getAll(),
        notesAPI.getTags()
      ]);

      setNotebooks(notebooksRes.data.notebooks || []);
      setNotes(notesRes.data.notes || []);
      setTags(tagsRes.data.tags || []);
    } catch (error) {
      console.error('Error loading notes data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadThesesData = async () => {
    try {
      const [dashboardRes, thesesRes] = await Promise.all([
        thesesAPI.getDashboard(),
        thesesAPI.getAll(thesesStatusFilter === 'all' ? null : thesesStatusFilter)
      ]);
      setThesesDashboard(dashboardRes.data.dashboard);
      setTheses(thesesRes.data.theses || []);
    } catch (error) {
      console.error('Error loading theses data:', error);
    }
  };

  const loadNoteForEditing = async (noteId) => {
    try {
      const res = await notesAPI.getOne(noteId);
      setEditingNote(res.data.note);
      setShowEditor(true);
    } catch (error) {
      console.error('Error loading note:', error);
    }
  };

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) {
      loadData();
      return;
    }
    try {
      const res = await notesAPI.search(searchQuery);
      setNotes(res.data.notes || []);
    } catch (error) {
      console.error('Error searching notes:', error);
    }
  }, [searchQuery]);

  const handleNotebookFilter = (notebookId) => {
    setSelectedNotebook(notebookId === selectedNotebook ? null : notebookId);
  };

  const handleTagFilter = (tagName) => {
    setSelectedTags(prev =>
      prev.includes(tagName)
        ? prev.filter(t => t !== tagName)
        : [...prev, tagName]
    );
  };

  const handlePinNote = async (noteId, isPinned) => {
    try {
      await notesAPI.pin(noteId, !isPinned);
      setNotes(prev => prev.map(n =>
        n.id === noteId ? { ...n, is_pinned: !isPinned } : n
      ));
    } catch (error) {
      console.error('Error pinning note:', error);
    }
  };

  const handleDeleteNote = async (noteId) => {
    if (!window.confirm('Are you sure you want to delete this note?')) return;
    try {
      await notesAPI.delete(noteId);
      setNotes(prev => prev.filter(n => n.id !== noteId));
    } catch (error) {
      console.error('Error deleting note:', error);
    }
  };

  const handleSaveNote = async (noteData) => {
    try {
      if (editingNote) {
        await notesAPI.update(editingNote.id, noteData);
      } else {
        await notesAPI.create(noteData);
      }
      setShowEditor(false);
      setEditingNote(null);
      setSearchParams({});
      loadData();
    } catch (error) {
      console.error('Error saving note:', error);
      throw error;
    }
  };

  const handleCloseEditor = () => {
    setShowEditor(false);
    setEditingNote(null);
    setSearchParams({});
  };

  // Thesis handlers
  const handleSaveThesis = async (thesisData) => {
    try {
      if (editingThesis) {
        await thesesAPI.update(editingThesis.id, thesisData);
      } else {
        await thesesAPI.create(thesisData);
      }
      setShowThesisEditor(false);
      setEditingThesis(null);
      loadThesesData();
    } catch (error) {
      console.error('Error saving thesis:', error);
      throw error;
    }
  };

  const handleCloseThesisEditor = () => {
    setShowThesisEditor(false);
    setEditingThesis(null);
  };

  // Filter notes
  const filteredNotes = notes.filter(note => {
    if (selectedNotebook && note.notebook_id !== selectedNotebook) return false;
    if (selectedTags.length > 0) {
      const noteTags = note.tagNames || [];
      if (!selectedTags.some(t => noteTags.includes(t))) return false;
    }
    // Symbol filter
    if (symbolFilter) {
      const noteSymbols = note.symbols || [];
      if (!noteSymbols.some(s => s.toUpperCase().includes(symbolFilter.toUpperCase()))) return false;
    }
    // Note type filter
    if (noteTypeFilter !== 'all' && note.note_type !== noteTypeFilter) return false;
    // Search query filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      if (!note.title?.toLowerCase().includes(query) &&
          !note.content?.toLowerCase().includes(query) &&
          !note.symbols?.some(s => s.toLowerCase().includes(query))) {
        return false;
      }
    }
    return true;
  });

  // Sort: pinned first, then by date
  const sortedNotes = [...filteredNotes].sort((a, b) => {
    if (a.is_pinned && !b.is_pinned) return -1;
    if (!a.is_pinned && b.is_pinned) return 1;
    return new Date(b.updated_at) - new Date(a.updated_at);
  });

  // Filter theses by symbol
  const filteredTheses = theses.filter(thesis => {
    if (symbolFilter && !thesis.symbol?.toUpperCase().includes(symbolFilter.toUpperCase())) {
      return false;
    }
    return true;
  });

  if (showEditor) {
    return (
      <NoteEditor
        note={editingNote}
        notebooks={notebooks}
        tags={tags}
        onSave={handleSaveNote}
        onClose={handleCloseEditor}
      />
    );
  }

  if (showThesisEditor) {
    return (
      <ThesisEditor
        thesis={editingThesis}
        onSave={handleSaveThesis}
        onClose={handleCloseThesisEditor}
      />
    );
  }

  return (
    <div className="notes-page">
      <PageHeader
        title="Research"
        subtitle="Notes and investment theses in one place"
        icon={<Book size={28} />}
        actions={
          <div className="header-actions">
            <Button
              variant="primary"
              onClick={() => {
                if (activeView === 'theses') {
                  setEditingThesis(null);
                  setShowThesisEditor(true);
                } else {
                  setEditingNote(null);
                  setShowEditor(true);
                }
              }}
            >
              <Plus size={16} />
              {activeView === 'theses' ? 'New Thesis' : 'New Note'}
            </Button>
          </div>
        }
      />

      {/* View Tabs */}
      <div className="research-tabs">
        <button
          className={`tab-btn ${activeView === 'notes' ? 'active' : ''}`}
          onClick={() => setActiveView('notes')}
        >
          <FileText size={16} />
          Notes
          <span className="count">{notes.length}</span>
        </button>
        <button
          className={`tab-btn ${activeView === 'theses' ? 'active' : ''}`}
          onClick={() => setActiveView('theses')}
        >
          <Target size={16} />
          Theses
          <span className="count">{theses.length}</span>
        </button>
      </div>

      <div className="notes-layout">
        {/* Sidebar */}
        <aside className="notes-sidebar">
          {/* Search */}
          <div className="sidebar-search">
            <Search size={16} />
            <input
              type="text"
              placeholder={activeView === 'notes' ? "Search notes..." : "Search theses..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
          </div>

          {/* Symbol Filter */}
          <div className="sidebar-section">
            <h3>Filter by Symbol</h3>
            <div className="symbol-filter">
              <Building2 size={14} />
              <input
                type="text"
                placeholder="e.g., AAPL"
                value={symbolFilter}
                onChange={(e) => setSymbolFilter(e.target.value.toUpperCase())}
              />
              {symbolFilter && (
                <button className="clear-btn" onClick={() => setSymbolFilter('')}>
                  <XCircle size={14} />
                </button>
              )}
            </div>
          </div>

          {/* Note Type Filter (only for notes view) */}
          {activeView === 'notes' && (
            <div className="sidebar-section">
              <h3>Note Type</h3>
              <div className="type-filter">
                {['all', 'general', 'earnings', 'comparison', 'meeting', 'quick'].map(type => (
                  <button
                    key={type}
                    className={`type-filter-btn ${noteTypeFilter === type ? 'active' : ''}`}
                    onClick={() => setNoteTypeFilter(type)}
                  >
                    {type === 'all' ? 'All' : type.charAt(0).toUpperCase() + type.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Thesis Status Filter (only for theses view) */}
          {activeView === 'theses' && (
            <div className="sidebar-section">
              <h3>Status</h3>
              <div className="type-filter">
                {['all', 'active', 'achieved', 'invalidated', 'closed'].map(status => (
                  <button
                    key={status}
                    className={`type-filter-btn ${thesesStatusFilter === status ? 'active' : ''}`}
                    onClick={() => setThesesStatusFilter(status)}
                  >
                    {status.charAt(0).toUpperCase() + status.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Notebooks (only for notes view) */}
          {activeView === 'notes' && (
            <div className="sidebar-section">
              <h3>Notebooks</h3>
              <ul className="notebook-list">
                <li
                  className={`notebook-item ${!selectedNotebook ? 'active' : ''}`}
                  onClick={() => setSelectedNotebook(null)}
                >
                  <FileText size={16} />
                  <span>All Notes</span>
                  <span className="count">{notes.length}</span>
                </li>
                {notebooks.map(nb => (
                  <li
                    key={nb.id}
                    className={`notebook-item ${selectedNotebook === nb.id ? 'active' : ''}`}
                    onClick={() => handleNotebookFilter(nb.id)}
                    style={{ '--notebook-color': nb.color }}
                  >
                    <span className="notebook-dot" />
                    <span>{nb.name}</span>
                    <span className="count">{nb.notes_count || 0}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Tags (only for notes view) */}
          {activeView === 'notes' && tags.length > 0 && (
            <div className="sidebar-section">
              <h3>Tags</h3>
              <div className="tag-cloud">
                {tags.map(tag => (
                  <Badge
                    key={tag.id}
                    variant={selectedTags.includes(tag.name) ? 'primary' : 'secondary'}
                    onClick={() => handleTagFilter(tag.name)}
                    style={{ backgroundColor: selectedTags.includes(tag.name) ? tag.color : undefined }}
                  >
                    {tag.name}
                    {tag.usage_count > 0 && <span className="tag-count">{tag.usage_count}</span>}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Theses Summary (only for theses view) */}
          {activeView === 'theses' && thesesDashboard && (
            <div className="sidebar-section">
              <h3>Summary</h3>
              <div className="theses-summary">
                <div className="summary-item">
                  <span className="value">{thesesDashboard.summary?.active_count || 0}</span>
                  <span className="label">Active</span>
                </div>
                <div className="summary-item success">
                  <span className="value">{thesesDashboard.summary?.achieved_count || 0}</span>
                  <span className="label">Achieved</span>
                </div>
                <div className="summary-item danger">
                  <span className="value">{thesesDashboard.summary?.invalidated_count || 0}</span>
                  <span className="label">Invalidated</span>
                </div>
              </div>
            </div>
          )}
        </aside>

        {/* Main Content */}
        <main className="notes-main">
          {activeView === 'notes' ? (
            // Notes View
            loading ? (
              <div className="loading-state">Loading notes...</div>
            ) : sortedNotes.length === 0 ? (
              <EmptyState
                icon={FileText}
                title="No notes yet"
                description="Start documenting your investment research"
                action={{
                  label: "Create your first note",
                  onClick: () => setShowEditor(true)
                }}
              />
            ) : (
              <div className="notes-grid">
                {sortedNotes.map(note => (
                  <NoteCard
                    key={note.id}
                    note={note}
                    onEdit={() => loadNoteForEditing(note.id)}
                    onPin={() => handlePinNote(note.id, note.is_pinned)}
                    onDelete={() => handleDeleteNote(note.id)}
                    onView={() => navigate(`/notes/${note.id}`)}
                  />
                ))}
              </div>
            )
          ) : (
            // Theses View
            filteredTheses.length === 0 ? (
              <EmptyState
                icon={Target}
                title="No theses yet"
                description="Create structured investment theses to track your ideas"
                action={{
                  label: "Create your first thesis",
                  onClick: () => setShowThesisEditor(true)
                }}
              />
            ) : (
              <div className="theses-grid">
                {filteredTheses.map(thesis => (
                  <ThesisCard
                    key={thesis.id}
                    thesis={thesis}
                    onEdit={() => {
                      setEditingThesis(thesis);
                      setShowThesisEditor(true);
                    }}
                    onView={() => navigate(`/theses/${thesis.id}`)}
                  />
                ))}
              </div>
            )
          )}
        </main>
      </div>
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

// Note Card Component
function NoteCard({ note, onEdit, onPin, onDelete, onView }) {
  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const noteTypeIcons = {
    general: FileText,
    earnings: Calendar,
    thesis: Target,
    comparison: Building2,
  };

  const TypeIcon = noteTypeIcons[note.note_type] || FileText;

  return (
    <Card className={`note-card ${note.is_pinned ? 'pinned' : ''}`}>
      <div className="note-card-header">
        <div className="note-meta">
          <TypeIcon size={14} className="note-type-icon" />
          <span className="note-date">{formatDate(note.updated_at)}</span>
          {note.is_pinned && <Pin size={12} className="pin-icon" />}
        </div>
        <div className="note-actions">
          <button onClick={onPin} title={note.is_pinned ? 'Unpin' : 'Pin'}>
            <Pin size={14} />
          </button>
          <button onClick={onEdit} title="Edit">
            <Edit3 size={14} />
          </button>
          <button onClick={onDelete} title="Delete" className="delete-btn">
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <h3 className="note-title" onClick={onView}>{note.title}</h3>

      {note.excerpt && (
        <p className="note-excerpt">{note.excerpt}</p>
      )}

      {/* Company symbols */}
      {note.symbols && note.symbols.length > 0 && (
        <div className="note-symbols">
          {note.symbols.map(symbol => (
            <Badge key={symbol} variant="secondary" size="small">
              {symbol}
            </Badge>
          ))}
        </div>
      )}

      {/* Portfolio tags */}
      {note.portfolioNames && note.portfolioNames.length > 0 && (
        <div className="note-portfolios">
          {note.portfolioNames.map(name => (
            <span key={name} className="portfolio-tag">
              <Wallet size={10} />
              {name}
            </span>
          ))}
        </div>
      )}

      {/* Tags */}
      {note.tagNames && note.tagNames.length > 0 && (
        <div className="note-tags">
          {note.tagNames.map(tag => (
            <span key={tag} className="tag">
              <Tag size={10} />
              {tag}
            </span>
          ))}
        </div>
      )}

      <div className="note-footer">
        <span className="notebook-name" style={{ color: note.notebook_color }}>
          {note.notebook_name}
        </span>
        {note.reading_time_minutes > 0 && (
          <span className="reading-time">
            <Clock size={12} />
            {note.reading_time_minutes} min read
          </span>
        )}
      </div>
    </Card>
  );
}

export default NotesPage;

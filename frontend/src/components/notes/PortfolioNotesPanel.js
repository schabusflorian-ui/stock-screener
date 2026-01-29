// frontend/src/components/notes/PortfolioNotesPanel.js
// Panel for displaying notes related to a specific portfolio

import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  FileText,
  Plus,
  Calendar,
  ChevronRight,
  BookOpen,
  Tag,
  Search
} from '../icons';
import { notesAPI } from '../../services/api';
import './PortfolioNotesPanel.css';

function PortfolioNotesPanel({ portfolioId, portfolioName }) {
  const navigate = useNavigate();
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const loadData = useCallback(async () => {
    if (!portfolioId) return;

    setLoading(true);
    try {
      const res = await notesAPI.getByPortfolio(portfolioId);
      setNotes(res.data.notes || []);
    } catch (error) {
      console.error('Error loading portfolio notes:', error);
    } finally {
      setLoading(false);
    }
  }, [portfolioId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreateNote = () => {
    navigate(`/notes?action=new&portfolio=${portfolioId}`);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    });
  };

  const filteredNotes = notes.filter(note => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return note.title?.toLowerCase().includes(query) ||
           note.excerpt?.toLowerCase().includes(query) ||
           note.tagNames?.some(t => t.toLowerCase().includes(query));
  });

  if (loading) {
    return (
      <div className="portfolio-notes-panel loading">
        <div className="loading-spinner" />
        <span>Loading notes...</span>
      </div>
    );
  }

  return (
    <div className="portfolio-notes-panel">
      {/* Header */}
      <div className="notes-panel-header">
        <div className="header-title">
          <BookOpen size={20} />
          <h3>Portfolio Notes</h3>
          {notes.length > 0 && <span className="notes-count">{notes.length}</span>}
        </div>
        <button onClick={handleCreateNote} className="add-note-btn">
          <Plus size={16} />
          New Note
        </button>
      </div>

      {/* Search */}
      {notes.length > 3 && (
        <div className="notes-search">
          <Search size={16} />
          <input
            type="text"
            placeholder="Search notes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      )}

      {/* Notes List */}
      {filteredNotes.length > 0 ? (
        <div className="notes-list">
          {filteredNotes.map(note => (
            <Link key={note.id} to={`/notes/${note.id}`} className="note-card">
              <div className="note-card-header">
                <span className="note-title">{note.title}</span>
                <span className={`note-type type-${note.note_type}`}>{note.note_type}</span>
              </div>
              {note.excerpt && (
                <p className="note-excerpt">{note.excerpt}</p>
              )}
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
                  {note.tagNames.slice(0, 3).map(tag => (
                    <span key={tag} className="tag">{tag}</span>
                  ))}
                  {note.tagNames.length > 3 && (
                    <span className="tag more">+{note.tagNames.length - 3}</span>
                  )}
                </div>
              )}
              {note.symbols && note.symbols.length > 0 && (
                <div className="note-symbols">
                  {note.symbols.slice(0, 5).map(symbol => (
                    <span key={symbol} className="symbol-badge">{symbol}</span>
                  ))}
                </div>
              )}
            </Link>
          ))}
        </div>
      ) : notes.length === 0 ? (
        <div className="empty-state">
          <FileText size={40} />
          <h4>No Notes Yet</h4>
          <p>Create notes to track your research, decisions, and thoughts about this portfolio.</p>
          <button onClick={handleCreateNote} className="primary-btn">
            <Plus size={16} />
            Create First Note
          </button>
        </div>
      ) : (
        <div className="empty-state">
          <Search size={32} />
          <p>No notes matching "{searchQuery}"</p>
        </div>
      )}

      {/* View All Link */}
      {notes.length > 5 && (
        <Link to={`/notes?portfolio=${portfolioId}`} className="view-all-link">
          View all {notes.length} notes <ChevronRight size={14} />
        </Link>
      )}
    </div>
  );
}

export default PortfolioNotesPanel;

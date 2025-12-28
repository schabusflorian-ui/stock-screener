import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Book, Plus, Search, Tag, Pin, Trash2, Edit3, Eye, Clock,
  FileText, Target, Filter, ChevronRight, Calendar, Building2
} from 'lucide-react';
import { notesAPI, thesesAPI } from '../../services/api';
import {
  PageHeader, Section, Card, Grid, Button, EmptyState, Badge
} from '../../components/ui';
import NoteEditor from './NoteEditor';
import './NotesPage.css';

function NotesPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // State
  const [notebooks, setNotebooks] = useState([]);
  const [notes, setNotes] = useState([]);
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNotebook, setSelectedNotebook] = useState(null);
  const [selectedTags, setSelectedTags] = useState([]);
  const [editingNote, setEditingNote] = useState(null);
  const [showEditor, setShowEditor] = useState(false);

  // Load initial data
  useEffect(() => {
    loadData();
  }, []);

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

  // Filter notes
  const filteredNotes = notes.filter(note => {
    if (selectedNotebook && note.notebook_id !== selectedNotebook) return false;
    if (selectedTags.length > 0) {
      const noteTags = note.tagNames || [];
      if (!selectedTags.some(t => noteTags.includes(t))) return false;
    }
    return true;
  });

  // Sort: pinned first, then by date
  const sortedNotes = [...filteredNotes].sort((a, b) => {
    if (a.is_pinned && !b.is_pinned) return -1;
    if (!a.is_pinned && b.is_pinned) return 1;
    return new Date(b.updated_at) - new Date(a.updated_at);
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

  return (
    <div className="notes-page">
      <PageHeader
        title="Research Notes"
        subtitle="Document your investment research and insights"
        icon={<Book size={28} />}
        actions={
          <div className="header-actions">
            <Button
              variant="primary"
              onClick={() => {
                setEditingNote(null);
                setShowEditor(true);
              }}
            >
              <Plus size={16} />
              New Note
            </Button>
            <Button
              variant="secondary"
              onClick={() => navigate('/theses')}
            >
              <Target size={16} />
              Investment Theses
            </Button>
          </div>
        }
      />

      <div className="notes-layout">
        {/* Sidebar */}
        <aside className="notes-sidebar">
          {/* Search */}
          <div className="sidebar-search">
            <Search size={16} />
            <input
              type="text"
              placeholder="Search notes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
          </div>

          {/* Notebooks */}
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

          {/* Tags */}
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
        </aside>

        {/* Main Content */}
        <main className="notes-main">
          {loading ? (
            <div className="loading-state">Loading notes...</div>
          ) : sortedNotes.length === 0 ? (
            <EmptyState
              icon={<FileText size={48} />}
              title="No notes yet"
              description="Start documenting your investment research"
              action={
                <Button variant="primary" onClick={() => setShowEditor(true)}>
                  <Plus size={16} />
                  Create your first note
                </Button>
              }
            />
          ) : (
            <div className="notes-grid">
              {sortedNotes.map(note => (
                <NoteCard
                  key={note.id}
                  note={note}
                  onEdit={() => {
                    setEditingNote(note);
                    setShowEditor(true);
                  }}
                  onPin={() => handlePinNote(note.id, note.is_pinned)}
                  onDelete={() => handleDeleteNote(note.id)}
                  onView={() => navigate(`/notes/${note.id}`)}
                />
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
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

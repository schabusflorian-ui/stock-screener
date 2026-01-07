import { useState, useEffect, useCallback, useRef } from 'react';
import {
  X, Save, Eye, EyeOff, Tag, Building2, Plus, Edit3, Trash2, Check,
  Bold, Italic, Link, List, ListOrdered, Code, Quote, Heading, Wallet
} from 'lucide-react';
import { companyAPI, notesAPI, portfoliosAPI } from '../../services/api';
import { Button, Badge, Card } from '../../components/ui';
import './NoteEditor.css';

function NoteEditor({ note, notebooks, tags: initialTags, onSave, onClose }) {
  const textareaRef = useRef(null);

  // Helper to get initial selected tag IDs
  // note.tags comes from getNote() API call (has id), note.tagNames comes from list (string array)
  const getInitialSelectedTags = () => {
    if (note?.tags && Array.isArray(note.tags)) {
      return note.tags.map(t => t.id);
    }
    // Fallback: match tagNames against initialTags to get IDs
    if (note?.tagNames && Array.isArray(note.tagNames) && initialTags) {
      return initialTags
        .filter(t => note.tagNames.includes(t.name))
        .map(t => t.id);
    }
    return [];
  };

  // Form state
  const [title, setTitle] = useState(note?.title || '');
  const [content, setContent] = useState(note?.content || '');
  const [notebookId, setNotebookId] = useState(note?.notebook_id || notebooks[0]?.id);
  const [noteType, setNoteType] = useState(note?.note_type || 'general');
  const [selectedTags, setSelectedTags] = useState(getInitialSelectedTags());
  const [symbols, setSymbols] = useState(note?.attachments?.filter(a => a.attachment_type === 'company').map(a => a.symbol) || note?.symbols || []);
  const [portfolioIds, setPortfolioIds] = useState(note?.attachments?.filter(a => a.attachment_type === 'portfolio').map(a => a.portfolio_id) || []);
  const [availablePortfolios, setAvailablePortfolios] = useState([]);

  // Tags state (for creating/editing)
  const [tags, setTags] = useState(initialTags || []);
  const [showTagManager, setShowTagManager] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#6366f1');
  const [editingTag, setEditingTag] = useState(null);
  const [editTagName, setEditTagName] = useState('');
  const [editTagColor, setEditTagColor] = useState('');

  // UI state
  const [showPreview, setShowPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [symbolInput, setSymbolInput] = useState('');
  const [symbolSuggestions, setSymbolSuggestions] = useState([]);
  const [showTagSelector, setShowTagSelector] = useState(false);
  const [autoSaveTimer, setAutoSaveTimer] = useState(null);

  // Predefined tag colors
  const tagColors = [
    '#6366f1', // Indigo
    '#8b5cf6', // Purple
    '#ec4899', // Pink
    '#ef4444', // Red
    '#f97316', // Orange
    '#eab308', // Yellow
    '#22c55e', // Green
    '#14b8a6', // Teal
    '#3b82f6', // Blue
    '#64748b', // Slate
  ];

  // State for draft restoration prompt
  const [hasDraft, setHasDraft] = useState(false);
  const [draftData, setDraftData] = useState(null);

  // Check for draft on mount (don't auto-prompt)
  useEffect(() => {
    if (!note) {
      const draft = localStorage.getItem('note-draft');
      if (draft) {
        try {
          const parsed = JSON.parse(draft);
          // Only show restore option if draft has meaningful content
          if (parsed.title || parsed.content) {
            setDraftData(parsed);
            setHasDraft(true);
          }
        } catch (e) {
          localStorage.removeItem('note-draft');
        }
      }
    }

    return () => {
      if (autoSaveTimer) clearTimeout(autoSaveTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load available portfolios
  useEffect(() => {
    const loadPortfolios = async () => {
      try {
        const res = await portfoliosAPI.getAll();
        setAvailablePortfolios(res.data.portfolios || []);
      } catch (err) {
        console.error('Error loading portfolios:', err);
      }
    };
    loadPortfolios();
  }, []);

  const restoreDraft = () => {
    if (draftData) {
      setTitle(draftData.title || '');
      setContent(draftData.content || '');
    }
    setHasDraft(false);
    setDraftData(null);
  };

  const discardDraft = () => {
    localStorage.removeItem('note-draft');
    setHasDraft(false);
    setDraftData(null);
  };

  // Save draft on changes
  useEffect(() => {
    if (!note && (title || content)) {
      if (autoSaveTimer) clearTimeout(autoSaveTimer);
      const timer = setTimeout(() => {
        localStorage.setItem('note-draft', JSON.stringify({ title, content }));
      }, 2000);
      setAutoSaveTimer(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, content, note]);

  // Symbol search
  const searchSymbols = useCallback(async (query) => {
    if (query.length < 1) {
      setSymbolSuggestions([]);
      return;
    }
    try {
      const res = await companyAPI.search(query);
      setSymbolSuggestions(res.data.companies?.slice(0, 5) || []);
    } catch (error) {
      console.error('Error searching symbols:', error);
    }
  }, []);

  const handleSymbolInputChange = (e) => {
    const value = e.target.value.toUpperCase();
    setSymbolInput(value);
    searchSymbols(value);
  };

  const addSymbol = (symbol) => {
    if (!symbols.includes(symbol)) {
      setSymbols([...symbols, symbol]);
    }
    setSymbolInput('');
    setSymbolSuggestions([]);
  };

  const removeSymbol = (symbol) => {
    setSymbols(symbols.filter(s => s !== symbol));
  };

  // Portfolio search
  const [portfolioInput, setPortfolioInput] = useState('');
  const [portfolioSuggestions, setPortfolioSuggestions] = useState([]);

  const handlePortfolioInputChange = (e) => {
    const value = e.target.value;
    setPortfolioInput(value);

    if (value.length >= 1) {
      const filtered = availablePortfolios.filter(p =>
        p.name.toLowerCase().includes(value.toLowerCase()) &&
        !portfolioIds.includes(p.id)
      );
      setPortfolioSuggestions(filtered.slice(0, 5));
    } else {
      // Show all available portfolios when input is empty but focused
      setPortfolioSuggestions(availablePortfolios.filter(p => !portfolioIds.includes(p.id)).slice(0, 5));
    }
  };

  const addPortfolio = (portfolio) => {
    if (!portfolioIds.includes(portfolio.id)) {
      setPortfolioIds([...portfolioIds, portfolio.id]);
    }
    setPortfolioInput('');
    setPortfolioSuggestions([]);
  };

  const removePortfolio = (portfolioId) => {
    setPortfolioIds(portfolioIds.filter(id => id !== portfolioId));
  };

  const toggleTag = (tagId) => {
    setSelectedTags(prev =>
      prev.includes(tagId)
        ? prev.filter(id => id !== tagId)
        : [...prev, tagId]
    );
  };

  // Tag management functions
  const handleCreateTag = async () => {
    if (!newTagName.trim()) return;
    try {
      const res = await notesAPI.createTag({ name: newTagName.trim(), color: newTagColor });
      const newTag = res.data.tag;
      setTags([...tags, newTag]);
      setNewTagName('');
      setNewTagColor('#6366f1');
    } catch (err) {
      console.error('Error creating tag:', err);
      setError('Failed to create tag');
    }
  };

  const startEditTag = (tag) => {
    setEditingTag(tag.id);
    setEditTagName(tag.name);
    setEditTagColor(tag.color);
  };

  const handleUpdateTag = async (tagId) => {
    if (!editTagName.trim()) return;
    try {
      await notesAPI.updateTag(tagId, { name: editTagName.trim(), color: editTagColor });
      setTags(tags.map(t =>
        t.id === tagId ? { ...t, name: editTagName.trim(), color: editTagColor } : t
      ));
      setEditingTag(null);
      setEditTagName('');
      setEditTagColor('');
    } catch (err) {
      console.error('Error updating tag:', err);
      setError('Failed to update tag');
    }
  };

  const handleDeleteTag = async (tagId) => {
    if (!window.confirm('Delete this tag? It will be removed from all notes.')) return;
    try {
      await notesAPI.deleteTag(tagId);
      setTags(tags.filter(t => t.id !== tagId));
      setSelectedTags(selectedTags.filter(id => id !== tagId));
    } catch (err) {
      console.error('Error deleting tag:', err);
      setError('Failed to delete tag');
    }
  };

  // Markdown toolbar actions
  const insertMarkdown = (before, after = '', placeholder = '') => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = content.substring(start, end) || placeholder;

    const newContent =
      content.substring(0, start) +
      before + selectedText + after +
      content.substring(end);

    setContent(newContent);

    // Set cursor position
    setTimeout(() => {
      textarea.focus();
      const newPos = start + before.length + selectedText.length;
      textarea.setSelectionRange(newPos, newPos);
    }, 0);
  };

  const toolbarActions = [
    { icon: Bold, action: () => insertMarkdown('**', '**', 'bold'), title: 'Bold' },
    { icon: Italic, action: () => insertMarkdown('*', '*', 'italic'), title: 'Italic' },
    { icon: Heading, action: () => insertMarkdown('## ', '', 'Heading'), title: 'Heading' },
    { icon: Link, action: () => insertMarkdown('[', '](url)', 'link text'), title: 'Link' },
    { icon: List, action: () => insertMarkdown('- ', '', 'item'), title: 'Bullet List' },
    { icon: ListOrdered, action: () => insertMarkdown('1. ', '', 'item'), title: 'Numbered List' },
    { icon: Code, action: () => insertMarkdown('`', '`', 'code'), title: 'Code' },
    { icon: Quote, action: () => insertMarkdown('> ', '', 'quote'), title: 'Quote' },
  ];

  const handleSave = async (status = 'draft') => {
    if (!title.trim()) {
      setError('Title is required');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await onSave({
        notebookId: parseInt(notebookId),
        title: title.trim(),
        content,
        noteType,
        status,
        symbols,
        portfolioIds,
        tagIds: selectedTags,
        captureSnapshots: true
      });

      // Clear draft on successful save
      localStorage.removeItem('note-draft');
    } catch (err) {
      setError(err.message || 'Failed to save note');
    } finally {
      setSaving(false);
    }
  };

  // Simple Markdown renderer for preview
  const renderMarkdown = (text) => {
    if (!text) return '';

    return text
      // Headers
      .replace(/^### (.*$)/gim, '<h3>$1</h3>')
      .replace(/^## (.*$)/gim, '<h2>$1</h2>')
      .replace(/^# (.*$)/gim, '<h1>$1</h1>')
      // Bold and Italic
      .replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      // Code
      .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
      .replace(/`(.*?)`/g, '<code>$1</code>')
      // Links
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>')
      // Lists
      .replace(/^\s*-\s+(.*$)/gim, '<li>$1</li>')
      .replace(/^\s*\d+\.\s+(.*$)/gim, '<li>$1</li>')
      // Blockquotes
      .replace(/^>\s*(.*$)/gim, '<blockquote>$1</blockquote>')
      // Paragraphs
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br/>');
  };

  return (
    <div className="note-editor">
      <div className="editor-header">
        <div className="editor-title-section">
          <input
            type="text"
            className="title-input"
            placeholder="Note title..."
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
          />
        </div>

        <div className="editor-actions">
          <Button
            variant="ghost"
            onClick={() => setShowPreview(!showPreview)}
            title={showPreview ? 'Edit' : 'Preview'}
          >
            {showPreview ? <EyeOff size={18} /> : <Eye size={18} />}
          </Button>
          <Button
            variant="secondary"
            onClick={() => handleSave('draft')}
            disabled={saving}
          >
            Save Draft
          </Button>
          <Button
            variant="primary"
            onClick={() => handleSave('published')}
            disabled={saving}
          >
            <Save size={16} />
            {saving ? 'Saving...' : 'Publish'}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            <X size={18} />
          </Button>
        </div>
      </div>

      {error && (
        <div className="editor-error">
          {error}
        </div>
      )}

      {hasDraft && (
        <div className="draft-restore-banner">
          <span>You have an unsaved draft. Would you like to restore it?</span>
          <div className="draft-actions">
            <Button variant="primary" size="small" onClick={restoreDraft}>
              Restore Draft
            </Button>
            <Button variant="ghost" size="small" onClick={discardDraft}>
              Discard
            </Button>
          </div>
        </div>
      )}

      <div className="editor-toolbar">
        <div className="toolbar-group">
          {toolbarActions.map(({ icon: Icon, action, title }) => (
            <button
              key={title}
              className="toolbar-btn"
              onClick={action}
              title={title}
              disabled={showPreview}
            >
              <Icon size={16} />
            </button>
          ))}
        </div>

        <div className="toolbar-divider" />

        <div className="toolbar-group">
          <select
            value={notebookId}
            onChange={(e) => setNotebookId(e.target.value)}
            className="notebook-select"
          >
            {notebooks.map(nb => (
              <option key={nb.id} value={nb.id}>{nb.name}</option>
            ))}
          </select>

          <select
            value={noteType}
            onChange={(e) => setNoteType(e.target.value)}
            className="type-select"
          >
            <option value="general">General</option>
            <option value="earnings">Earnings</option>
            <option value="comparison">Comparison</option>
            <option value="meeting">Meeting Notes</option>
            <option value="quick">Quick Note</option>
          </select>
        </div>
      </div>

      <div className="editor-body">
        <div className="editor-main">
          {showPreview ? (
            <div
              className="markdown-preview"
              dangerouslySetInnerHTML={{ __html: `<p>${renderMarkdown(content)}</p>` }}
            />
          ) : (
            <textarea
              ref={textareaRef}
              className="content-textarea"
              placeholder="Start writing your research notes...

Use Markdown for formatting:
- **bold** and *italic*
- # Headings
- [links](url)
- `code`
- > quotes
- - bullet lists"
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
          )}
        </div>

        <div className="editor-sidebar">
          {/* Company Symbols */}
          <Card className="sidebar-card">
            <h4><Building2 size={16} /> Companies</h4>
            <div className="symbol-input-wrapper">
              <input
                type="text"
                placeholder="Add symbol..."
                value={symbolInput}
                onChange={handleSymbolInputChange}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && symbolInput) {
                    addSymbol(symbolInput);
                  }
                }}
              />
              {symbolSuggestions.length > 0 && (
                <ul className="symbol-suggestions">
                  {symbolSuggestions.map(company => (
                    <li key={company.symbol} onClick={() => addSymbol(company.symbol)}>
                      <strong>{company.symbol}</strong>
                      <span>{company.name}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="symbol-list">
              {symbols.map(symbol => (
                <Badge key={symbol} variant="primary">
                  {symbol}
                  <button onClick={() => removeSymbol(symbol)}>
                    <X size={12} />
                  </button>
                </Badge>
              ))}
            </div>
          </Card>

          {/* Portfolios */}
          {availablePortfolios.length > 0 && (
            <Card className="sidebar-card">
              <h4><Wallet size={16} /> Portfolios</h4>
              <div className="symbol-input-wrapper">
                <input
                  type="text"
                  placeholder="Add portfolio..."
                  value={portfolioInput}
                  onChange={handlePortfolioInputChange}
                  onFocus={() => {
                    // Show suggestions on focus
                    setPortfolioSuggestions(availablePortfolios.filter(p => !portfolioIds.includes(p.id)).slice(0, 5));
                  }}
                  onBlur={() => {
                    // Delay to allow click on suggestion
                    setTimeout(() => setPortfolioSuggestions([]), 150);
                  }}
                />
                {portfolioSuggestions.length > 0 && (
                  <ul className="symbol-suggestions">
                    {portfolioSuggestions.map(portfolio => (
                      <li key={portfolio.id} onClick={() => addPortfolio(portfolio)}>
                        <strong>{portfolio.name}</strong>
                        <span>{portfolio.strategy || 'Portfolio'}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="symbol-list">
                {availablePortfolios
                  .filter(p => portfolioIds.includes(p.id))
                  .map(portfolio => (
                    <Badge key={portfolio.id} variant="primary">
                      {portfolio.name}
                      <button onClick={() => removePortfolio(portfolio.id)}>
                        <X size={12} />
                      </button>
                    </Badge>
                  ))}
              </div>
            </Card>
          )}

          {/* Tags */}
          <Card className="sidebar-card">
            <h4>
              <Tag size={16} /> Tags
              <button
                className="add-tag-btn"
                onClick={() => setShowTagSelector(!showTagSelector)}
                title="Select tags"
              >
                <Plus size={14} />
              </button>
              <button
                className="add-tag-btn"
                onClick={() => setShowTagManager(!showTagManager)}
                title="Manage tags"
              >
                <Edit3 size={14} />
              </button>
            </h4>

            {/* Tag Selector */}
            {showTagSelector && (
              <div className="tag-selector">
                {tags.map(tag => (
                  <Badge
                    key={tag.id}
                    variant={selectedTags.includes(tag.id) ? 'primary' : 'secondary'}
                    onClick={() => toggleTag(tag.id)}
                    style={{
                      backgroundColor: selectedTags.includes(tag.id) ? tag.color : undefined,
                      cursor: 'pointer'
                    }}
                  >
                    {tag.name}
                  </Badge>
                ))}
                {tags.length === 0 && (
                  <p className="no-tags-hint">No tags yet. Click the edit icon to create tags.</p>
                )}
              </div>
            )}

            {/* Tag Manager - Create/Edit/Delete */}
            {showTagManager && (
              <div className="tag-manager">
                {/* Create New Tag */}
                <div className="create-tag-form">
                  <input
                    type="text"
                    placeholder="New tag name..."
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleCreateTag()}
                  />
                  <div className="color-picker">
                    {tagColors.map(color => (
                      <button
                        key={color}
                        className={`color-btn ${newTagColor === color ? 'active' : ''}`}
                        style={{ backgroundColor: color }}
                        onClick={() => setNewTagColor(color)}
                      />
                    ))}
                  </div>
                  <Button
                    variant="primary"
                    size="small"
                    onClick={handleCreateTag}
                    disabled={!newTagName.trim()}
                  >
                    <Plus size={14} /> Create
                  </Button>
                </div>

                {/* Existing Tags List */}
                <div className="tag-list">
                  {tags.map(tag => (
                    <div key={tag.id} className="tag-item">
                      {editingTag === tag.id ? (
                        <>
                          <input
                            type="text"
                            value={editTagName}
                            onChange={(e) => setEditTagName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleUpdateTag(tag.id)}
                          />
                          <div className="color-picker compact">
                            {tagColors.map(color => (
                              <button
                                key={color}
                                className={`color-btn ${editTagColor === color ? 'active' : ''}`}
                                style={{ backgroundColor: color }}
                                onClick={() => setEditTagColor(color)}
                              />
                            ))}
                          </div>
                          <button className="save-btn" onClick={() => handleUpdateTag(tag.id)}>
                            <Check size={14} />
                          </button>
                          <button className="cancel-btn" onClick={() => setEditingTag(null)}>
                            <X size={14} />
                          </button>
                        </>
                      ) : (
                        <>
                          <Badge style={{ backgroundColor: tag.color }}>{tag.name}</Badge>
                          <span className="tag-count">({tag.usage_count || 0})</span>
                          <button className="edit-btn" onClick={() => startEditTag(tag)}>
                            <Edit3 size={12} />
                          </button>
                          <button className="delete-btn" onClick={() => handleDeleteTag(tag.id)}>
                            <Trash2 size={12} />
                          </button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Selected Tags Display */}
            <div className="selected-tags">
              {tags.filter(t => selectedTags.includes(t.id)).map(tag => (
                <Badge
                  key={tag.id}
                  style={{ backgroundColor: tag.color }}
                >
                  {tag.name}
                  <button onClick={() => toggleTag(tag.id)}>
                    <X size={12} />
                  </button>
                </Badge>
              ))}
            </div>
          </Card>

          {/* Quick Tips */}
          <Card className="sidebar-card tips-card">
            <h4>Tips</h4>
            <ul>
              <li>Use <code>**bold**</code> for emphasis</li>
              <li>Use <code># Heading</code> for sections</li>
              <li>Add symbols to capture metrics snapshots</li>
              <li>Tag notes for easy filtering</li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default NoteEditor;

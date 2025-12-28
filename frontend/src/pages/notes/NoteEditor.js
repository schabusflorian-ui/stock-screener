import { useState, useEffect, useCallback, useRef } from 'react';
import {
  X, Save, Eye, EyeOff, Tag, Building2, Plus,
  Bold, Italic, Link, List, ListOrdered, Code, Quote, Heading
} from 'lucide-react';
import { companyAPI } from '../../services/api';
import { Button, Badge, Card } from '../../components/ui';
import './NoteEditor.css';

function NoteEditor({ note, notebooks, tags, onSave, onClose }) {
  const textareaRef = useRef(null);

  // Form state
  const [title, setTitle] = useState(note?.title || '');
  const [content, setContent] = useState(note?.content || '');
  const [notebookId, setNotebookId] = useState(note?.notebook_id || notebooks[0]?.id);
  const [noteType, setNoteType] = useState(note?.note_type || 'general');
  const [selectedTags, setSelectedTags] = useState(note?.tags?.map(t => t.id) || []);
  const [symbols, setSymbols] = useState(note?.attachments?.filter(a => a.attachment_type === 'company').map(a => a.symbol) || []);

  // UI state
  const [showPreview, setShowPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [symbolInput, setSymbolInput] = useState('');
  const [symbolSuggestions, setSymbolSuggestions] = useState([]);
  const [showTagSelector, setShowTagSelector] = useState(false);
  const [autoSaveTimer, setAutoSaveTimer] = useState(null);

  // Auto-save draft to localStorage
  useEffect(() => {
    if (!note) {
      const draft = localStorage.getItem('note-draft');
      if (draft) {
        const parsed = JSON.parse(draft);
        if (window.confirm('Restore unsaved draft?')) {
          setTitle(parsed.title || '');
          setContent(parsed.content || '');
        }
      }
    }

    return () => {
      if (autoSaveTimer) clearTimeout(autoSaveTimer);
    };
  }, []);

  // Save draft on changes
  useEffect(() => {
    if (!note && (title || content)) {
      if (autoSaveTimer) clearTimeout(autoSaveTimer);
      const timer = setTimeout(() => {
        localStorage.setItem('note-draft', JSON.stringify({ title, content }));
      }, 2000);
      setAutoSaveTimer(timer);
    }
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

  const toggleTag = (tagId) => {
    setSelectedTags(prev =>
      prev.includes(tagId)
        ? prev.filter(id => id !== tagId)
        : [...prev, tagId]
    );
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

          {/* Tags */}
          <Card className="sidebar-card">
            <h4>
              <Tag size={16} /> Tags
              <button
                className="add-tag-btn"
                onClick={() => setShowTagSelector(!showTagSelector)}
              >
                <Plus size={14} />
              </button>
            </h4>
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
              </div>
            )}
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

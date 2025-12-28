// frontend/src/components/notes/NoteVersionHistory.js
// Component for viewing and comparing note versions

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  History,
  Clock,
  ArrowLeft,
  RefreshCw,
  FileText,
  GitBranch,
  ArrowLeftRight
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { notesAPI } from '../../services/api';
import './NoteVersionHistory.css';

function NoteVersionHistory() {
  const { noteId } = useParams();
  const navigate = useNavigate();

  const [note, setNote] = useState(null);
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedVersion, setSelectedVersion] = useState(null);
  const [compareMode, setCompareMode] = useState(false);
  const [compareVersions, setCompareVersions] = useState({ v1: null, v2: null });
  const [restoring, setRestoring] = useState(false);

  const loadData = useCallback(async () => {
    if (!noteId) return;

    setLoading(true);
    try {
      const [noteRes, versionsRes] = await Promise.all([
        notesAPI.getOne(noteId),
        notesAPI.getVersions(noteId)
      ]);

      setNote(noteRes.data.note);
      setVersions(versionsRes.data.versions || []);
    } catch (error) {
      console.error('Error loading version history:', error);
    } finally {
      setLoading(false);
    }
  }, [noteId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSelectVersion = async (version) => {
    if (compareMode) {
      if (!compareVersions.v1) {
        setCompareVersions({ v1: version, v2: null });
      } else if (!compareVersions.v2) {
        setCompareVersions({ ...compareVersions, v2: version });
      } else {
        setCompareVersions({ v1: version, v2: null });
      }
    } else {
      setSelectedVersion(version);
    }
  };

  const handleRestoreVersion = async () => {
    if (!selectedVersion) return;

    setRestoring(true);
    try {
      await notesAPI.restoreVersion(noteId, selectedVersion.version_number);
      navigate(`/notes/${noteId}`);
    } catch (error) {
      console.error('Error restoring version:', error);
      alert('Failed to restore version');
    } finally {
      setRestoring(false);
    }
  };

  const toggleCompareMode = () => {
    setCompareMode(!compareMode);
    setCompareVersions({ v1: null, v2: null });
    setSelectedVersion(null);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getTimeSince = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 30) return `${diffDays}d ago`;
    return formatDate(dateStr);
  };

  const computeDiff = (oldContent, newContent) => {
    // Simple line-by-line diff
    const oldLines = (oldContent || '').split('\n');
    const newLines = (newContent || '').split('\n');
    const diff = [];

    const maxLen = Math.max(oldLines.length, newLines.length);
    for (let i = 0; i < maxLen; i++) {
      const oldLine = oldLines[i];
      const newLine = newLines[i];

      if (oldLine === undefined) {
        diff.push({ type: 'added', content: newLine, lineNum: i + 1 });
      } else if (newLine === undefined) {
        diff.push({ type: 'removed', content: oldLine, lineNum: i + 1 });
      } else if (oldLine !== newLine) {
        diff.push({ type: 'removed', content: oldLine, lineNum: i + 1 });
        diff.push({ type: 'added', content: newLine, lineNum: i + 1 });
      } else {
        diff.push({ type: 'unchanged', content: oldLine, lineNum: i + 1 });
      }
    }

    return diff;
  };

  if (loading) {
    return (
      <div className="version-history-page loading">
        <div className="loading-spinner" />
        <span>Loading version history...</span>
      </div>
    );
  }

  if (!note) {
    return (
      <div className="version-history-page error">
        <p>Note not found</p>
        <button onClick={() => navigate('/notes')}>Back to Notes</button>
      </div>
    );
  }

  return (
    <div className="version-history-page">
      {/* Header */}
      <header className="version-history-header">
        <button onClick={() => navigate(`/notes/${noteId}`)} className="back-btn">
          <ArrowLeft size={18} />
          <span>Back to Note</span>
        </button>

        <div className="header-info">
          <h1>
            <History size={20} />
            Version History
          </h1>
          <span className="note-title">{note.title}</span>
        </div>

        <button
          onClick={toggleCompareMode}
          className={`compare-toggle ${compareMode ? 'active' : ''}`}
        >
          <ArrowLeftRight size={16} />
          {compareMode ? 'Exit Compare' : 'Compare Versions'}
        </button>
      </header>

      <div className="version-history-content">
        {/* Version List */}
        <aside className="version-list">
          <div className="version-list-header">
            <h3>
              <GitBranch size={16} />
              Versions ({versions.length})
            </h3>
          </div>

          <div className="versions">
            {/* Current version */}
            <div
              className={`version-item current ${
                selectedVersion === null && !compareMode ? 'selected' : ''
              } ${
                compareMode && compareVersions.v1 === null ? 'compare-selected' : ''
              }`}
              onClick={() => handleSelectVersion(null)}
            >
              <div className="version-badge current">Current</div>
              <div className="version-info">
                <span className="version-title">{note.title}</span>
                <span className="version-date">
                  <Clock size={12} />
                  {getTimeSince(note.updated_at)}
                </span>
              </div>
              {compareMode && compareVersions.v1 === null && (
                <div className="compare-marker">1</div>
              )}
              {compareMode && compareVersions.v2 === null && compareVersions.v1 !== null && (
                <div className="compare-marker">2</div>
              )}
            </div>

            {/* Historical versions */}
            {versions.map(version => (
              <div
                key={version.id}
                className={`version-item ${
                  selectedVersion?.id === version.id ? 'selected' : ''
                } ${
                  compareVersions.v1?.id === version.id || compareVersions.v2?.id === version.id
                    ? 'compare-selected'
                    : ''
                }`}
                onClick={() => handleSelectVersion(version)}
              >
                <div className="version-badge">v{version.version_number}</div>
                <div className="version-info">
                  <span className="version-title">{version.title}</span>
                  <span className="version-date">
                    <Clock size={12} />
                    {getTimeSince(version.created_at)}
                  </span>
                  {version.change_summary && (
                    <span className="version-summary">{version.change_summary}</span>
                  )}
                </div>
                {compareMode && compareVersions.v1?.id === version.id && (
                  <div className="compare-marker">1</div>
                )}
                {compareMode && compareVersions.v2?.id === version.id && (
                  <div className="compare-marker">2</div>
                )}
              </div>
            ))}

            {versions.length === 0 && (
              <div className="no-versions">
                <FileText size={24} />
                <p>No previous versions</p>
                <span>Changes are saved automatically</span>
              </div>
            )}
          </div>
        </aside>

        {/* Version Preview / Compare View */}
        <main className="version-preview">
          {compareMode ? (
            // Compare Mode
            <div className="compare-view">
              {compareVersions.v1 !== undefined && compareVersions.v2 !== undefined &&
               (compareVersions.v1 !== null || compareVersions.v2 !== null) ? (
                <>
                  <div className="compare-header">
                    <div className="compare-label">
                      <span className="marker">1</span>
                      {compareVersions.v1 === null
                        ? 'Current Version'
                        : `Version ${compareVersions.v1.version_number}`}
                    </div>
                    <ArrowLeftRight size={16} />
                    <div className="compare-label">
                      <span className="marker">2</span>
                      {compareVersions.v2 === null
                        ? 'Current Version'
                        : `Version ${compareVersions.v2.version_number}`}
                    </div>
                  </div>

                  <div className="diff-view">
                    {(() => {
                      const content1 = compareVersions.v1?.content || note.content;
                      const content2 = compareVersions.v2?.content || note.content;
                      const diff = computeDiff(content1, content2);

                      return diff.map((line, idx) => (
                        <div key={idx} className={`diff-line ${line.type}`}>
                          <span className="line-num">{line.lineNum}</span>
                          <span className="line-prefix">
                            {line.type === 'added' && '+'}
                            {line.type === 'removed' && '-'}
                            {line.type === 'unchanged' && ' '}
                          </span>
                          <span className="line-content">{line.content}</span>
                        </div>
                      ));
                    })()}
                  </div>
                </>
              ) : (
                <div className="compare-instructions">
                  <ArrowLeftRight size={32} />
                  <h3>Compare Versions</h3>
                  <p>Select two versions from the list to compare their content</p>
                </div>
              )}
            </div>
          ) : selectedVersion ? (
            // Single Version Preview
            <div className="single-version-view">
              <div className="version-preview-header">
                <div className="version-meta">
                  <span className="version-badge large">v{selectedVersion.version_number}</span>
                  <div className="version-details">
                    <h3>{selectedVersion.title}</h3>
                    <span className="date">{formatDate(selectedVersion.created_at)}</span>
                    {selectedVersion.change_summary && (
                      <span className="summary">{selectedVersion.change_summary}</span>
                    )}
                  </div>
                </div>

                <button
                  onClick={handleRestoreVersion}
                  disabled={restoring}
                  className="restore-btn"
                >
                  {restoring ? (
                    <>
                      <RefreshCw size={16} className="spinning" />
                      Restoring...
                    </>
                  ) : (
                    <>
                      <RefreshCw size={16} />
                      Restore This Version
                    </>
                  )}
                </button>
              </div>

              <div className="version-content">
                <ReactMarkdown>{selectedVersion.content}</ReactMarkdown>
              </div>
            </div>
          ) : (
            // Current version preview (default)
            <div className="single-version-view">
              <div className="version-preview-header">
                <div className="version-meta">
                  <span className="version-badge large current">Current</span>
                  <div className="version-details">
                    <h3>{note.title}</h3>
                    <span className="date">Last updated: {formatDate(note.updated_at)}</span>
                  </div>
                </div>
              </div>

              <div className="version-content">
                <ReactMarkdown>{note.content}</ReactMarkdown>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default NoteVersionHistory;

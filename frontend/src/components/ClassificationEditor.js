// frontend/src/components/ClassificationEditor.js
import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Settings, X } from 'lucide-react';
import { classificationsAPI } from '../services/api';
import './ClassificationEditor.css';

function ClassificationEditor({ symbol, companyName, onUpdate, mode = 'inline', compact = false }) {
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Classification definitions
  const [customSectors, setCustomSectors] = useState([]);
  const [customTags, setCustomTags] = useState([]);

  // Company's current classifications
  const [companyClassifications, setCompanyClassifications] = useState({
    default_sector: '',
    default_industry: '',
    user_sector: '',
    user_industry: '',
    user_subsector: '',
    user_tags: []
  });

  // Edit state
  const [isEditing, setIsEditing] = useState(false);
  const [editValues, setEditValues] = useState({});

  // New classification creation
  const [showNewSector, setShowNewSector] = useState(false);
  const [showNewTag, setShowNewTag] = useState(false);
  const [newSectorName, setNewSectorName] = useState('');
  const [newTagName, setNewTagName] = useState('');

  // Load data
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [classificationsRes, companyRes] = await Promise.all([
        classificationsAPI.getAll(),
        classificationsAPI.getCompany(symbol)
      ]);

      setCustomSectors(classificationsRes.data.classifications.sectors || []);
      setCustomTags(classificationsRes.data.classifications.tags || []);
      setCompanyClassifications(companyRes.data);
      setEditValues({
        user_sector: companyRes.data.user_sector || '',
        user_industry: companyRes.data.user_industry || '',
        user_subsector: companyRes.data.user_subsector || '',
        user_tags: companyRes.data.user_tags || []
      });
    } catch (err) {
      setError('Failed to load classifications');
      console.error(err);
    }
    setLoading(false);
  }, [symbol]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Save changes
  const handleSave = async () => {
    setSaving(true);
    try {
      await classificationsAPI.updateCompany(symbol, editValues);
      setCompanyClassifications(prev => ({
        ...prev,
        ...editValues
      }));
      setIsEditing(false);
      if (onUpdate) onUpdate();
    } catch (err) {
      setError('Failed to save');
      console.error(err);
    }
    setSaving(false);
  };

  // Cancel editing
  const handleCancel = () => {
    setEditValues({
      user_sector: companyClassifications.user_sector || '',
      user_industry: companyClassifications.user_industry || '',
      user_subsector: companyClassifications.user_subsector || '',
      user_tags: companyClassifications.user_tags || []
    });
    setIsEditing(false);
  };

  // Toggle tag
  const toggleTag = (tagName) => {
    setEditValues(prev => {
      const tags = prev.user_tags || [];
      if (tags.includes(tagName)) {
        return { ...prev, user_tags: tags.filter(t => t !== tagName) };
      } else {
        return { ...prev, user_tags: [...tags, tagName] };
      }
    });
  };

  // Create new sector
  const createSector = async () => {
    if (!newSectorName.trim()) return;
    try {
      await classificationsAPI.create({
        type: 'sector',
        name: newSectorName.trim()
      });
      setNewSectorName('');
      setShowNewSector(false);
      loadData();
    } catch (err) {
      setError('Failed to create sector');
    }
  };

  // Create new tag
  const createTag = async () => {
    if (!newTagName.trim()) return;
    try {
      await classificationsAPI.create({
        type: 'tag',
        name: newTagName.trim()
      });
      setNewTagName('');
      setShowNewTag(false);
      loadData();
    } catch (err) {
      setError('Failed to create tag');
    }
  };

  // Render editor content (used by both modes)
  const renderEditorContent = () => (
    <>
      {error && <div className="ce-error">{error}</div>}

      {/* Default Classifications (read-only) */}
      <div className="ce-section">
        <h5>Default (from SIC code)</h5>
        <div className="ce-row">
          <span className="ce-label">Sector:</span>
          <span className="ce-value">{companyClassifications.default_sector || '-'}</span>
        </div>
        <div className="ce-row">
          <span className="ce-label">Industry:</span>
          <span className="ce-value">{companyClassifications.default_industry || '-'}</span>
        </div>
      </div>

      {/* Custom Sector */}
      <div className="ce-section">
        <h5>Custom Sector</h5>
        {isEditing ? (
          <div className="ce-edit-field">
            <select
              value={editValues.user_sector}
              onChange={(e) => setEditValues(prev => ({ ...prev, user_sector: e.target.value }))}
            >
              <option value="">-- Use default --</option>
              {customSectors.map(s => (
                <option key={s.id} value={s.name}>{s.name}</option>
              ))}
            </select>
            <button
              className="add-new-btn"
              onClick={() => setShowNewSector(!showNewSector)}
              title="Create new sector"
            >
              +
            </button>
          </div>
        ) : (
          <div className="ce-row">
            <span className="ce-value highlight">
              {companyClassifications.user_sector || <span className="muted">Not set</span>}
            </span>
          </div>
        )}

        {showNewSector && (
          <div className="ce-new-item">
            <input
              type="text"
              placeholder="New sector name..."
              value={newSectorName}
              onChange={(e) => setNewSectorName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && createSector()}
            />
            <button onClick={createSector}>Add</button>
          </div>
        )}
      </div>

      {/* Custom Industry */}
      <div className="ce-section">
        <h5>Custom Industry</h5>
        {isEditing ? (
          <input
            type="text"
            value={editValues.user_industry}
            onChange={(e) => setEditValues(prev => ({ ...prev, user_industry: e.target.value }))}
            placeholder="Enter custom industry..."
          />
        ) : (
          <div className="ce-row">
            <span className="ce-value">
              {companyClassifications.user_industry || <span className="muted">Not set</span>}
            </span>
          </div>
        )}
      </div>

      {/* Custom Subsector */}
      <div className="ce-section">
        <h5>Subsector</h5>
        {isEditing ? (
          <input
            type="text"
            value={editValues.user_subsector}
            onChange={(e) => setEditValues(prev => ({ ...prev, user_subsector: e.target.value }))}
            placeholder="Enter subsector..."
          />
        ) : (
          <div className="ce-row">
            <span className="ce-value">
              {companyClassifications.user_subsector || <span className="muted">Not set</span>}
            </span>
          </div>
        )}
      </div>

      {/* Tags */}
      <div className="ce-section">
        <h5>
          Tags
          {isEditing && (
            <button
              className="add-new-btn small"
              onClick={() => setShowNewTag(!showNewTag)}
              title="Create new tag"
            >
              +
            </button>
          )}
        </h5>

        {showNewTag && (
          <div className="ce-new-item">
            <input
              type="text"
              placeholder="New tag name..."
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && createTag()}
            />
            <button onClick={createTag}>Add</button>
          </div>
        )}

        <div className="ce-tags">
          {customTags.map(tag => {
            const isActive = isEditing
              ? (editValues.user_tags || []).includes(tag.name)
              : (companyClassifications.user_tags || []).includes(tag.name);

            return (
              <button
                key={tag.id}
                className={`tag-chip ${isActive ? 'active' : ''}`}
                onClick={() => isEditing && toggleTag(tag.name)}
                disabled={!isEditing}
                style={isActive && tag.color ? { backgroundColor: tag.color } : {}}
              >
                {tag.name}
              </button>
            );
          })}
          {customTags.length === 0 && (
            <span className="muted">No tags defined</span>
          )}
        </div>
      </div>

      {/* Effective Classification */}
      <div className="ce-section effective">
        <h5>Effective Classification</h5>
        <div className="ce-row">
          <span className="ce-label">Sector:</span>
          <span className="ce-value">
            {companyClassifications.user_sector || companyClassifications.default_sector || '-'}
          </span>
        </div>
        <div className="ce-row">
          <span className="ce-label">Industry:</span>
          <span className="ce-value">
            {companyClassifications.user_industry || companyClassifications.default_industry || '-'}
          </span>
        </div>
      </div>
    </>
  );

  // Button mode - render just a button that opens modal
  if (mode === 'button') {
    const modalContent = showModal && createPortal(
      <div className="ce-modal-overlay" onClick={() => setShowModal(false)}>
        <div className="ce-modal" onClick={(e) => e.stopPropagation()}>
          <div className="ce-modal-header">
            <h3>Classifications for {companyName || symbol}</h3>
            <button className="ce-modal-close" onClick={() => setShowModal(false)}>
              <X size={20} />
            </button>
          </div>
          <div className="ce-modal-body">
            {loading ? (
              <div className="ce-loading">Loading classifications...</div>
            ) : (
              <div className="classification-editor modal-content">
                <div className="ce-header">
                  {!isEditing ? (
                    <button className="edit-btn" onClick={() => setIsEditing(true)}>
                      Edit
                    </button>
                  ) : (
                    <div className="edit-actions">
                      <button className="cancel-btn" onClick={handleCancel} disabled={saving}>
                        Cancel
                      </button>
                      <button className="save-btn" onClick={handleSave} disabled={saving}>
                        {saving ? 'Saving...' : 'Save'}
                      </button>
                    </div>
                  )}
                </div>
                {renderEditorContent()}
              </div>
            )}
          </div>
        </div>
      </div>,
      document.body
    );

    return (
      <>
        <button className="ce-trigger-btn" onClick={() => setShowModal(true)} title="Edit Classifications">
          <Settings size={16} />
          {!compact && <span>Classify</span>}
        </button>
        {modalContent}
      </>
    );
  }

  if (loading) {
    return <div className="classification-editor loading">Loading...</div>;
  }

  return (
    <div className="classification-editor">
      <div className="ce-header">
        <h4>Classifications</h4>
        {!isEditing ? (
          <button className="edit-btn" onClick={() => setIsEditing(true)}>
            Edit
          </button>
        ) : (
          <div className="edit-actions">
            <button className="cancel-btn" onClick={handleCancel} disabled={saving}>
              Cancel
            </button>
            <button className="save-btn" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        )}
      </div>

      {renderEditorContent()}
    </div>
  );
}

export default ClassificationEditor;

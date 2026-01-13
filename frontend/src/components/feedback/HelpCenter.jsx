/**
 * HelpCenter Component
 *
 * Slide-in help panel with contextual help, search, and article viewing.
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  X,
  Search,
  ChevronLeft,
  MapPin,
  BookOpen,
  ExternalLink,
  ThumbsUp,
  ThumbsDown,
  MessageCircle,
  Lightbulb
} from 'lucide-react';
import { useHelp } from '../../hooks/useHelp';
import './HelpCenter.css';

const HelpCenter = ({
  onContactSupport,
  onRequestFeature,
  // Allow parent to pass help state (from FeedbackManager)
  helpState
}) => {
  // Use passed helpState if provided, otherwise use own hook
  const ownHelp = useHelp();
  const {
    isOpen,
    closeHelp,
    contextualArticles,
    popularArticles,
    categories,
    currentArticle,
    searchResults,
    searchQuery,
    isLoading,
    error,
    fetchArticles,
    fetchArticle,
    searchArticles,
    markHelpful,
    clearArticle
  } = helpState || ownHelp;

  const [localSearchQuery, setLocalSearchQuery] = useState('');
  const [helpfulness, setHelpfulness] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [categoryArticles, setCategoryArticles] = useState([]);
  const [isAnimatingOut, setIsAnimatingOut] = useState(false);

  // Reset state when opening
  useEffect(() => {
    if (isOpen) {
      setLocalSearchQuery('');
      setHelpfulness(null);
      setSelectedCategory(null);
      setCategoryArticles([]);
      setIsAnimatingOut(false);
    }
  }, [isOpen]);

  // Debounced search
  useEffect(() => {
    if (!localSearchQuery.trim()) {
      return;
    }

    const timer = setTimeout(() => {
      searchArticles(localSearchQuery.trim());
    }, 300);

    return () => clearTimeout(timer);
  }, [localSearchQuery, searchArticles]);

  const handleClose = useCallback(() => {
    setIsAnimatingOut(true);
    setTimeout(() => {
      closeHelp();
    }, 250);
  }, [closeHelp]);

  const handleArticleClick = useCallback((slug) => {
    fetchArticle(slug);
    setHelpfulness(null);
  }, [fetchArticle]);

  const handleCategoryClick = useCallback(async (category) => {
    setSelectedCategory(category);
    const result = await fetchArticles(category);
    setCategoryArticles(result || []);
  }, [fetchArticles]);

  const handleBack = useCallback(() => {
    if (currentArticle) {
      clearArticle();
    } else if (selectedCategory) {
      setSelectedCategory(null);
      setCategoryArticles([]);
    }
  }, [currentArticle, selectedCategory, clearArticle]);

  const handleHelpful = useCallback(async (helpful) => {
    if (!currentArticle) return;

    setHelpfulness(helpful);
    await markHelpful(currentArticle.slug, helpful);
  }, [currentArticle, markHelpful]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleClose]);

  if (!isOpen) return null;

  const showBackButton = currentArticle || selectedCategory;
  const showSearch = !currentArticle;

  return (
    <>
      <div
        className={`help-center-backdrop ${isAnimatingOut ? 'help-center-backdrop--hiding' : ''}`}
        onClick={handleClose}
      />
      <div
        className={`help-center ${isAnimatingOut ? 'help-center--hiding' : ''}`}
        role="dialog"
        aria-labelledby="help-center-title"
        aria-modal="true"
      >
        <div className="help-center__header">
          {showBackButton && (
            <button
              className="help-center__back"
              onClick={handleBack}
              aria-label="Go back"
            >
              <ChevronLeft size={20} />
            </button>
          )}
          <h2 id="help-center-title" className="help-center__title">
            {currentArticle ? currentArticle.title : '\u2753 Help Center'}
          </h2>
          <button
            className="help-center__close"
            onClick={handleClose}
            aria-label="Close help"
          >
            <X size={20} />
          </button>
        </div>

        {showSearch && (
          <div className="help-center__search">
            <Search size={18} className="help-center__search-icon" />
            <input
              type="text"
              className="help-center__search-input"
              placeholder="Search help articles..."
              value={localSearchQuery}
              onChange={(e) => setLocalSearchQuery(e.target.value)}
              aria-label="Search help articles"
            />
          </div>
        )}

        <div className="help-center__content">
          {isLoading && (
            <div className="help-center__loading">Loading...</div>
          )}

          {error && (
            <div className="help-center__error">{error}</div>
          )}

          {/* Current Article View */}
          {currentArticle && !isLoading && (
            <div className="help-center__article">
              <div className="help-center__article-meta">
                <span className="help-center__article-category">
                  {currentArticle.category}
                </span>
              </div>

              <div
                className="help-center__article-content"
                dangerouslySetInnerHTML={{ __html: formatMarkdown(currentArticle.content) }}
              />

              {/* Helpfulness feedback */}
              <div className="help-center__helpfulness">
                <span>Was this article helpful?</span>
                <div className="help-center__helpfulness-buttons">
                  <button
                    className={`help-center__helpfulness-btn ${
                      helpfulness === true ? 'help-center__helpfulness-btn--selected' : ''
                    }`}
                    onClick={() => handleHelpful(true)}
                    disabled={helpfulness !== null}
                  >
                    <ThumbsUp size={16} />
                    <span>Yes</span>
                  </button>
                  <button
                    className={`help-center__helpfulness-btn ${
                      helpfulness === false ? 'help-center__helpfulness-btn--selected' : ''
                    }`}
                    onClick={() => handleHelpful(false)}
                    disabled={helpfulness !== null}
                  >
                    <ThumbsDown size={16} />
                    <span>No</span>
                  </button>
                </div>
                {helpfulness !== null && (
                  <span className="help-center__helpfulness-thanks">
                    Thanks for your feedback!
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Search Results */}
          {!currentArticle && localSearchQuery && searchResults.length > 0 && (
            <div className="help-center__section">
              <h3 className="help-center__section-title">
                <Search size={16} /> Search Results
              </h3>
              <ul className="help-center__article-list">
                {searchResults.map((article) => (
                  <li key={article.slug}>
                    <button
                      className="help-center__article-link"
                      onClick={() => handleArticleClick(article.slug)}
                    >
                      <span className="help-center__article-title">{article.title}</span>
                      {article.summary && (
                        <span className="help-center__article-summary">{article.summary}</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* No search results */}
          {!currentArticle && localSearchQuery && searchResults.length === 0 && !isLoading && (
            <div className="help-center__no-results">
              <p>No articles found for "{localSearchQuery}"</p>
              <p className="help-center__no-results-hint">
                Try different keywords or browse categories below.
              </p>
            </div>
          )}

          {/* Category Articles */}
          {!currentArticle && selectedCategory && categoryArticles.length > 0 && (
            <div className="help-center__section">
              <h3 className="help-center__section-title">
                <BookOpen size={16} /> {selectedCategory}
              </h3>
              <ul className="help-center__article-list">
                {categoryArticles.map((article) => (
                  <li key={article.slug}>
                    <button
                      className="help-center__article-link"
                      onClick={() => handleArticleClick(article.slug)}
                    >
                      <span className="help-center__article-title">{article.title}</span>
                      {article.summary && (
                        <span className="help-center__article-summary">{article.summary}</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Default view: Contextual + Popular + Categories */}
          {!currentArticle && !localSearchQuery && !selectedCategory && (
            <>
              {/* Contextual help */}
              {contextualArticles.length > 0 && (
                <div className="help-center__section">
                  <h3 className="help-center__section-title">
                    <MapPin size={16} /> Help for this page
                  </h3>
                  <ul className="help-center__article-list">
                    {contextualArticles.map((article) => (
                      <li key={article.slug}>
                        <button
                          className="help-center__article-link"
                          onClick={() => handleArticleClick(article.slug)}
                        >
                          <span className="help-center__article-title">{article.title}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Popular topics */}
              {popularArticles.length > 0 && (
                <div className="help-center__section">
                  <h3 className="help-center__section-title">
                    <BookOpen size={16} /> Popular Topics
                  </h3>
                  <ul className="help-center__article-list">
                    {popularArticles.map((article) => (
                      <li key={article.slug}>
                        <button
                          className="help-center__article-link"
                          onClick={() => handleArticleClick(article.slug)}
                        >
                          <span className="help-center__article-title">{article.title}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Categories */}
              {categories.length > 0 && (
                <div className="help-center__section">
                  <h3 className="help-center__section-title">Browse by Category</h3>
                  <ul className="help-center__category-list">
                    {categories.map((cat) => (
                      <li key={cat.category}>
                        <button
                          className="help-center__category-link"
                          onClick={() => handleCategoryClick(cat.category)}
                        >
                          <span className="help-center__category-name">
                            {formatCategoryName(cat.category)}
                          </span>
                          <span className="help-center__category-count">
                            {cat.article_count} articles
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer with support links */}
        <div className="help-center__footer">
          <span className="help-center__footer-label">Still need help?</span>
          <div className="help-center__footer-actions">
            {onContactSupport && (
              <button
                className="help-center__footer-btn"
                onClick={() => {
                  handleClose();
                  onContactSupport();
                }}
              >
                <MessageCircle size={16} />
                <span>Contact Support</span>
              </button>
            )}
            {onRequestFeature && (
              <button
                className="help-center__footer-btn"
                onClick={() => {
                  handleClose();
                  onRequestFeature();
                }}
              >
                <Lightbulb size={16} />
                <span>Request Feature</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

// Helper function to format category names
function formatCategoryName(category) {
  return category
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// Simple markdown formatter (for basic formatting)
function formatMarkdown(content) {
  if (!content) return '';

  return content
    // Headers
    .replace(/^### (.*$)/gm, '<h4>$1</h4>')
    .replace(/^## (.*$)/gm, '<h3>$1</h3>')
    .replace(/^# (.*$)/gm, '<h2>$1</h2>')
    // Bold
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    // Code blocks
    .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Lists
    .replace(/^- (.*$)/gm, '<li>$1</li>')
    .replace(/^(\d+)\. (.*$)/gm, '<li>$2</li>')
    // Wrap consecutive li items
    .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
    // Paragraphs
    .replace(/\n\n/g, '</p><p>')
    .replace(/^(.+)$/gm, (match, p1) => {
      if (p1.startsWith('<')) return p1;
      return `<p>${p1}</p>`;
    })
    // Clean up empty paragraphs
    .replace(/<p><\/p>/g, '');
}

export default HelpCenter;

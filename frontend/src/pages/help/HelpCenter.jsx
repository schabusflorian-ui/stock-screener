// pages/help/HelpCenter.jsx
import { useState } from 'react';
import { FAQ_CATEGORIES } from '../../data/faq';
import { ChevronDown, Search, MessageCircle, Book } from 'lucide-react';
import { AIHelpAssistant } from './AIHelpAssistant';
import './HelpCenter.css';

export default function HelpCenter() {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedQuestions, setExpandedQuestions] = useState({});

  const toggleQuestion = (categoryId, questionIndex) => {
    const key = `${categoryId}-${questionIndex}`;
    setExpandedQuestions(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const filteredCategories = searchQuery
    ? FAQ_CATEGORIES.map(category => ({
        ...category,
        questions: category.questions.filter(
          q =>
            q.q.toLowerCase().includes(searchQuery.toLowerCase()) ||
            q.a.toLowerCase().includes(searchQuery.toLowerCase())
        ),
      })).filter(category => category.questions.length > 0)
    : FAQ_CATEGORIES;

  return (
    <div className="help-center">
      <div className="help-center-header">
        <Book className="help-center-icon" />
        <h1 className="help-center-title">Help Center</h1>
        <p className="help-center-subtitle">
          Find answers to common questions and learn how to use the platform
        </p>
      </div>

      {/* AI Help Assistant */}
      <AIHelpAssistant />

      {/* Search */}
      <div className="help-search-container">
        <div className="help-search-wrapper">
          <Search className="help-search-icon" />
          <input
            type="text"
            placeholder="Search FAQ..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="help-search-input"
          />
        </div>
      </div>

      {/* FAQ Categories */}
      <div className="faq-categories">
        {filteredCategories.map((category) => (
          <div key={category.id} className="faq-category">
            <h2 className="faq-category-title">
              <span className="faq-category-icon">{category.icon}</span>
              {category.title}
            </h2>

            <div className="faq-questions">
              {category.questions.map((item, index) => {
                const isExpanded = expandedQuestions[`${category.id}-${index}`];

                return (
                  <div key={index} className="faq-question-item">
                    <button
                      onClick={() => toggleQuestion(category.id, index)}
                      className="faq-question-button"
                    >
                      <span className="faq-question-text">{item.q}</span>
                      <ChevronDown
                        className={`faq-chevron ${isExpanded ? 'expanded' : ''}`}
                      />
                    </button>

                    {isExpanded && (
                      <div className="faq-answer">
                        {item.a}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {filteredCategories.length === 0 && (
          <div className="no-results">
            <Search className="no-results-icon" />
            <p>No results found for "{searchQuery}"</p>
            <button onClick={() => setSearchQuery('')} className="clear-search-btn">
              Clear search
            </button>
          </div>
        )}
      </div>

      {/* Contact Support */}
      <div className="help-contact-section">
        <MessageCircle className="help-contact-icon" />
        <h3 className="help-contact-title">Still need help?</h3>
        <p className="help-contact-description">
          Can't find what you're looking for? Our team is here to help.
        </p>
        <a
          href="mailto:support@yourplatform.com"
          className="help-contact-button"
        >
          Contact Support
        </a>
      </div>
    </div>
  );
}

# Knowledge Base Update Strategy

## Overview

The knowledge base is a vector database containing investment wisdom from various sources (Warren Buffett, Howard Marks, tech analysts, etc.). This document outlines the strategy for keeping it current and relevant.

## Current Architecture

### Components

1. **Scrapers** (`src/scrapers/`)
   - Python classes inheriting from `BaseScraper`
   - Each scraper handles one source (Buffett letters, Marks memos, etc.)
   - Built-in resume capability (skip already-scraped items)
   - Rate limiting to respect source servers

2. **Document Processor** (`src/services/ai/document_processor.py`)
   - Chunks documents into ~1000 char segments with 200 char overlap
   - Preserves metadata (source, author, topics)

3. **Topic Tagger** (`src/services/ai/topic_tagger.py`)
   - Tags chunks with relevant topics (valuation, moats, cycles, etc.)
   - Keyword-based classification

4. **Embedding Generator** (`src/services/ai/embedding_generator.py`)
   - Creates 384-dimensional vectors using MiniLM model
   - Runs locally (no API costs)

5. **Vector Store** (`src/services/ai/vector_store.py`)
   - SQLite-based storage with embeddings
   - Cosine similarity search

### Content Sources

| Source | Category | Update Frequency | Type |
|--------|----------|------------------|------|
| Buffett Letters | Value | Annual | Static |
| Oaktree Memos | Value | ~Monthly | Semi-static |
| Damodaran | Valuation | Periodic | Semi-static |
| Farnam Street | Mental Models | Weekly | Semi-dynamic |
| Collaborative Fund | Value | Weekly | Semi-dynamic |
| Taleb | Tail Risk | Periodic | Static |
| Spitznagel | Tail Risk | Periodic | Static |
| a16z | Tech/VC | Weekly | Dynamic |
| Benedict Evans | Tech | Weekly | Dynamic |
| ARK Invest | Tech/Disruption | Weekly | Dynamic |
| AI Insights | AI/Robotics | Manual | Curated |

## Update Strategy

### Three-Tier Refresh Schedule

#### 1. Weekly Full Refresh (Sundays 3:00 AM ET)
- Scrapes ALL sources
- Rebuilds entire vector store
- Ensures consistency
- Run time: ~10-15 minutes

```bash
node src/jobs/knowledgeBaseRefresh.js  # or
python scripts/build_knowledge_base.py
```

#### 2. Daily Incremental (Mon-Sat 6:00 AM ET)
- Only scrapes dynamic sources (a16z, Evans, ARK, AI)
- Faster execution (~2-3 minutes)
- Catches new tech/market commentary

```bash
node src/jobs/knowledgeBaseRefresh.js --incremental  # or
python scripts/build_knowledge_base.py --sources a16z evans ark ai
```

#### 3. On-Demand Updates
- After major market events
- When new curated content is added
- Manual trigger via CLI

```bash
python scripts/incremental_knowledge_update.py --sources ai
```

### Integration with Existing Jobs

The knowledge base refresh can be integrated with existing sentiment refresh:

```javascript
// In a master scheduler
const cron = require('node-cron');
const KnowledgeBaseRefresh = require('./jobs/knowledgeBaseRefresh');
const { runFullRefresh: refreshSentiment } = require('./jobs/sentimentRefresh');

// Morning routine: Update knowledge, then sentiment
cron.schedule('0 6 * * 1-5', async () => {
  // First: Update knowledge base with latest market commentary
  const kbRefresher = new KnowledgeBaseRefresh();
  await kbRefresher.runIncrementalRefresh();

  // Then: Refresh sentiment data
  await refreshSentiment();
}, { timezone: 'America/New_York' });
```

## Content Update Procedures

### Adding New Curated Content

1. **Add to Scraper Class**
   Edit the appropriate scraper (e.g., `ai_insights.py`) to add new insights:
   ```python
   AI_INSIGHTS = [
       # ... existing insights ...
       {
           'id': 'new_insight_id',
           'title': 'New Insight Title',
           'content': """
   Your curated content here...
   """
       }
   ]
   ```

2. **Rebuild Knowledge Base**
   ```bash
   python scripts/build_knowledge_base.py --sources ai
   ```

3. **Verify**
   ```bash
   python scripts/verify_knowledge.py -v
   ```

### Adding New Web Sources

1. **Create New Scraper**
   ```python
   # src/scrapers/new_source.py
   from .base_scraper import BaseScraper

   class NewSourceScraper(BaseScraper):
       def __init__(self):
           super().__init__(output_dir="knowledge_base/category/source")

       def get_source_name(self) -> str:
           return "New Source Name"

       def get_urls(self) -> List[Dict]:
           # Return list of items to scrape
           pass

       def scrape_item(self, item: Dict) -> Optional[Dict]:
           # Scrape individual item
           pass
   ```

2. **Register in `__init__.py`**

3. **Add to `build_knowledge_base.py`**

4. **Categorize as static/dynamic** for scheduling

## Monitoring & Maintenance

### Health Checks

```bash
# Check knowledge base status
node src/jobs/knowledgeBaseRefresh.js --status

# Verify retrieval quality
python scripts/verify_knowledge.py
```

### Status Tracking

The refresh job maintains a status file at `data/knowledge_refresh_status.json`:
```json
{
  "lastRun": "2024-01-15T08:00:00.000Z",
  "lastSuccess": true,
  "isRunning": false,
  "history": [
    {"timestamp": "...", "success": true, "duration": "2.5 minutes", "sources": ["a16z", "ark"]}
  ]
}
```

### Logging

All operations log to stdout with timestamps:
```
2024-01-15 08:00:00 - INFO - Starting knowledge base build
2024-01-15 08:00:05 - INFO - Scraping: a16z
2024-01-15 08:00:10 - INFO - Completed a16z: {'scraped': 5, 'skipped': 20}
```

## Error Handling

### Common Issues

1. **Rate Limiting**
   - Scrapers have built-in delays (1-2 seconds between requests)
   - Resume capability allows restarting after failures

2. **Content Changes**
   - Web sources may change structure
   - Scrapers use flexible selectors with fallbacks
   - Manual curated content is always reliable

3. **Embedding Failures**
   - Local embedding model is reliable
   - Falls back gracefully if content is empty

### Recovery

If the knowledge base is corrupted:
```bash
# Full rebuild from scratch
rm data/knowledge_vectors.db
python scripts/build_knowledge_base.py
```

## Future Enhancements

### Potential Improvements

1. **True Incremental Updates**
   - Hash-based change detection
   - Only update changed documents
   - Preserve unchanged embeddings

2. **Real-Time Market Commentary**
   - Integrate with news APIs
   - Process earnings call transcripts
   - Add analyst reports

3. **User Feedback Loop**
   - Track which retrievals were helpful
   - Boost relevance of useful content
   - Remove outdated/unhelpful content

4. **Multi-Modal Content**
   - Process charts/images from reports
   - Extract insights from videos/podcasts
   - Structured data from SEC filings

### Integration Opportunities

1. **Sentiment + Knowledge**
   - Use sentiment data to surface relevant knowledge
   - "Fear high? Here's what Buffett says about market panics"

2. **Portfolio + Knowledge**
   - Context-aware insights based on holdings
   - "You own NVDA - here's latest AI market analysis"

3. **Alerts + Knowledge**
   - Include relevant wisdom in alert notifications
   - Educational content tied to market events

## Quick Reference

### Commands

```bash
# Full knowledge base rebuild
python scripts/build_knowledge_base.py

# Skip scraping, just rebuild embeddings
python scripts/build_knowledge_base.py --skip-scrape

# Specific sources only
python scripts/build_knowledge_base.py --sources buffett marks

# Verification
python scripts/verify_knowledge.py -v

# Start scheduler daemon
node src/jobs/knowledgeBaseRefresh.js --schedule

# Manual refresh
node src/jobs/knowledgeBaseRefresh.js           # Full
node src/jobs/knowledgeBaseRefresh.js -i        # Incremental

# Status check
node src/jobs/knowledgeBaseRefresh.js --status
```

### File Locations

- Scrapers: `src/scrapers/`
- Knowledge content: `knowledge_base/`
- Vector database: `data/knowledge_vectors.db`
- Refresh status: `data/knowledge_refresh_status.json`
- Build script: `scripts/build_knowledge_base.py`
- Refresh job: `src/jobs/knowledgeBaseRefresh.js`

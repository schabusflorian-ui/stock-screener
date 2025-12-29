# Comprehensive Testing & QA Strategy

## LLM Features from Agents 5, 6, 7

This document outlines the testing and quality assurance strategy for all LLM-related features in the Investment Project.

---

## 1. Test Suite Overview

### Test Structure

```
tests/
├── conftest.py                    # Shared fixtures and utilities
├── scrapers/
│   └── test_scrapers.py           # Scraper unit tests
├── ai/
│   ├── test_document_processing.py  # Document/embedding tests
│   ├── test_analyst_personas.py     # Analyst persona tests
│   └── test_llm_routing.py          # LLM routing/cost tests
├── api/
│   └── test_api_endpoints.py        # API endpoint tests
└── integration/
    ├── test_knowledge_retrieval.py  # Knowledge retrieval tests
    └── test_conversations.py        # E2E conversation tests
```

### Test Categories

| Category | Purpose | Test Count (Est.) |
|----------|---------|-------------------|
| Scrapers | Validate knowledge base scrapers | ~40 tests |
| Document Processing | Test chunking, embeddings, vector store | ~35 tests |
| Analyst Personas | Validate all 6 analyst personas | ~45 tests |
| Knowledge Retrieval | Test RAG pipeline | ~25 tests |
| LLM Routing | Test model selection, costs | ~30 tests |
| API Endpoints | Test REST API | ~35 tests |
| Conversations | E2E conversation flows | ~30 tests |

**Total: ~240 tests**

---

## 2. Test Execution

### Quick Start

```bash
# Install test dependencies
pip install pytest pytest-cov pytest-xdist pytest-html

# Run all tests
python scripts/run_tests.py

# Run specific category
python scripts/run_tests.py --category ai
python scripts/run_tests.py --category scrapers
python scripts/run_tests.py --category integration

# Run with coverage
python scripts/run_tests.py --coverage

# Verbose output
python scripts/run_tests.py -v
```

### Test Commands Reference

```bash
# Run specific test file
pytest tests/ai/test_analyst_personas.py -v

# Run tests matching keyword
pytest -k "tailrisk" -v

# Run tests with specific marker
pytest -m "not slow" -v

# Generate HTML report
pytest --html=report.html --self-contained-html

# Run in parallel
pytest -n auto
```

---

## 3. Component-Specific Testing

### 3.1 Scrapers Testing

**What We Test:**
- Scraper initialization and configuration
- URL generation for all sources
- Manual/curated content extraction
- Metadata generation (topics, source, author)
- Resume capability
- Error handling for failed requests

**Key Scrapers:**
1. **TalebScraper** - Black Swan, Antifragility content
2. **UniversaSpitznagelScraper** - Tail risk, Austrian economics
3. **A16ZScraper** - Software eating world, network effects
4. **BenedictEvansScraper** - Tech analysis, disruption
5. **ARKInvestScraper** - Disruptive innovation
6. **AIInsightsScraper** - AI investment frameworks

**Test Examples:**
```python
def test_taleb_scraper_has_black_swan_content():
    scraper = TalebScraper()
    urls = scraper.get_urls()
    assert any('black_swan' in url['id'] for url in urls)

def test_scraped_content_has_topics():
    scraper = AIInsightsScraper()
    result = scraper.scrape_item(...)
    assert 'topics' in result['metadata']
```

### 3.2 Document Processing Testing

**What We Test:**
- Text chunking with overlap
- Minimum chunk size enforcement
- Metadata preservation through chunking
- Chunk index tracking
- Text cleaning and normalization

**Test Examples:**
```python
def test_chunk_overlap():
    processor = DocumentProcessor(chunk_size=100, overlap=20)
    chunks = processor.chunk_text(long_text)
    # Verify consecutive chunks share content

def test_metadata_preserved():
    doc = {'content': text, 'metadata': {'source': 'Test'}}
    chunks = processor.process_document(doc)
    for chunk in chunks:
        assert chunk['metadata']['source'] == 'Test'
```

### 3.3 Embedding & Vector Store Testing

**What We Test:**
- Embedding generation (mocked for CI)
- Correct embedding dimensions (384 for MiniLM)
- Vector store CRUD operations
- Similarity search
- Topic-based filtering
- Store statistics

**Test Examples:**
```python
def test_embedding_dimension():
    generator = EmbeddingGenerator(method='local')
    assert generator.get_embedding_dimension() == 384

def test_vector_search():
    store = VectorStore(temp_db)
    store.add_document(doc_with_embedding)
    results = store.search(query_embedding, k=5)
    assert len(results) <= 5
```

### 3.4 Analyst Persona Testing

**What We Test:**
- All 6 analysts registered correctly
- Required fields present (id, name, system_prompt, etc.)
- System prompts contain key concepts
- Influences include expected figures
- Unique prompts/names/styles for each analyst
- Color codes are valid hex

**Analysts Tested:**
1. **Benjamin** (Value) - Buffett, Munger influence
2. **Catherine** (Growth) - Fisher, Lynch influence
3. **Diana** (Contrarian) - Marks, Burry influence
4. **Marcus** (Quant) - O'Shaughnessy, AQR influence
5. **Elena** (Tech) - a16z, ARK, Evans influence
6. **Nikolai** (Tail Risk) - Taleb, Spitznagel influence

**Test Examples:**
```python
def test_tailrisk_analyst_influences():
    analyst = get_analyst('tailrisk')
    influences = [i.lower() for i in analyst.influences]
    assert any('taleb' in i for i in influences)

def test_tech_analyst_covers_disruption():
    analyst = get_analyst('tech')
    assert 'disruption' in analyst.system_prompt.lower()
```

### 3.5 LLM Routing Testing

**What We Test:**
- Model selection based on task type
- Fallback when Claude unavailable
- Cost calculation accuracy
- Token usage tracking
- Budget compliance
- Latency tracking

**Test Examples:**
```python
def test_analysis_uses_claude():
    router = ModelRouter()
    model = router.get_model(TaskType.ANALYSIS)
    assert model == router.claude

def test_cost_accumulates():
    tracker = UsageTracker()
    tracker.log_request(cost_usd=0.001)
    tracker.log_request(cost_usd=0.002)
    assert tracker.get_session_stats()['total_cost'] == 0.003
```

### 3.6 Knowledge Retrieval Testing

**What We Test:**
- Basic query retrieval
- Topic filtering
- Company-specific retrieval
- Multi-query expansion
- Source attribution
- Result ranking by score

**Test Examples:**
```python
def test_retrieval_for_tech_company():
    retriever = KnowledgeRetriever()
    results = retriever.retrieve_for_company_analysis(
        {'symbol': 'NVDA', 'sector': 'Technology'}
    )
    # Should include tech-relevant wisdom

def test_results_have_sources():
    results = retriever.retrieve("query")
    for r in results:
        assert 'source' in r['metadata']
```

### 3.7 Conversation Testing

**What We Test:**
- Conversation creation
- Greeting messages included
- Multi-turn context preservation
- Quick (one-shot) analysis
- Different analyst personalities
- Debate features (bull/bear, round table)

**Test Examples:**
```python
def test_multi_turn_conversation():
    service.chat(conv_id, "Question 1")
    service.chat(conv_id, "Follow-up")
    # Context from Q1 should inform follow-up

def test_analysts_stay_in_character():
    for analyst_id in all_analysts:
        analyst = get_analyst(analyst_id)
        assert analyst.name in analyst.system_prompt
```

---

## 4. Mocking Strategy

### LLM API Mocking

```python
@pytest.fixture
def mock_claude_client():
    with patch('src.services.ai.llm.claude_client.ClaudeClient') as mock:
        instance = mock.return_value
        instance.is_available.return_value = True
        instance.chat.return_value = MagicMock(
            content='Mock response',
            tokens_used={'input': 100, 'output': 50},
            cost_usd=0.001
        )
        yield instance
```

### Embedding Mocking

```python
@pytest.fixture
def sample_vector_embedding():
    import numpy as np
    np.random.seed(42)
    return np.random.randn(384).astype(np.float32).tolist()
```

### Web Request Mocking

```python
@patch('requests.get')
def test_scraper_handles_error(mock_get):
    mock_get.side_effect = Exception("Network error")
    result = scraper.scrape_item(item)
    assert result is None  # Graceful failure
```

---

## 5. Coverage Targets

| Component | Target Coverage |
|-----------|-----------------|
| Scrapers | 80% |
| Document Processing | 85% |
| Vector Store | 80% |
| Analyst Personas | 90% |
| LLM Routing | 75% |
| Knowledge Retrieval | 80% |
| API Endpoints | 70% |

**Overall Target: 80%**

---

## 6. CI/CD Integration

### GitHub Actions Workflow

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Set up Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.9'

      - name: Install dependencies
        run: |
          pip install -r requirements.txt
          pip install pytest pytest-cov

      - name: Run tests
        run: |
          python scripts/run_tests.py --coverage

      - name: Upload coverage
        uses: codecov/codecov-action@v3
```

### Pre-commit Hooks

```yaml
# .pre-commit-config.yaml
repos:
  - repo: local
    hooks:
      - id: pytest-check
        name: pytest-check
        entry: pytest tests/ -x -q
        language: system
        pass_filenames: false
        always_run: true
```

---

## 7. Manual QA Checklist

### Analyst Persona QA

- [ ] Each analyst has distinct personality in responses
- [ ] System prompts produce relevant analysis
- [ ] Greetings are appropriate and professional
- [ ] Suggested questions are relevant to analyst focus
- [ ] Color codes display correctly in UI

### Knowledge Base QA

- [ ] Scraped content is readable and well-formatted
- [ ] Topic tagging is accurate
- [ ] Search returns relevant results
- [ ] Citations are properly attributed
- [ ] No duplicate content

### Conversation QA

- [ ] Conversations maintain context across turns
- [ ] Analysts reference previous messages appropriately
- [ ] Company data is correctly incorporated
- [ ] Wisdom citations are relevant
- [ ] Response times are acceptable (<5s for most)

### API QA

- [ ] All endpoints return correct status codes
- [ ] Error messages are helpful
- [ ] Rate limiting works correctly
- [ ] Streaming responses work in browser
- [ ] CORS is properly configured

---

## 8. Performance Testing

### Benchmarks

| Operation | Target | Acceptable |
|-----------|--------|------------|
| Knowledge search (100k docs) | <200ms | <500ms |
| Embedding generation (1 doc) | <100ms | <200ms |
| Analyst response (w/wisdom) | <3s | <5s |
| Full conversation turn | <4s | <7s |

### Load Testing

```bash
# Test API under load
ab -n 100 -c 10 http://localhost:3000/api/analyst/personas
```

---

## 9. Security Testing

### Checklist

- [ ] API keys not exposed in responses
- [ ] Input sanitization on all endpoints
- [ ] Rate limiting prevents abuse
- [ ] No SQL injection in vector store
- [ ] XSS prevention in responses

---

## 10. Maintenance

### Weekly Tasks

1. Run full test suite
2. Check coverage hasn't decreased
3. Review any flaky tests
4. Update mocks if APIs changed

### Monthly Tasks

1. Update test data/fixtures
2. Review and update performance benchmarks
3. Add tests for new features
4. Clean up deprecated tests

---

## Quick Reference

```bash
# Most common commands
python scripts/run_tests.py                    # All tests
python scripts/run_tests.py -c ai -v           # AI tests verbose
python scripts/run_tests.py --coverage         # With coverage
python scripts/run_tests.py -k "analyst"       # Keyword filter
python scripts/run_tests.py -x                 # Stop on first fail
```

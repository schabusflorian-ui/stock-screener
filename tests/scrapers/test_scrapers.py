"""
Unit tests for all knowledge base scrapers.

Tests cover:
- Scraper initialization and configuration
- URL generation and validation
- Content extraction from manual/curated sources
- Metadata generation
- Resume capability
- Error handling
"""

import pytest
import sys
import os
from pathlib import Path
from unittest.mock import patch, MagicMock
import tempfile

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))


class TestBaseScraper:
    """Tests for the BaseScraper abstract class."""

    def test_base_scraper_initialization(self, temp_dir):
        """Test that scrapers initialize with correct defaults."""
        from src.scrapers.base_scraper import BaseScraper

        # Create a concrete implementation for testing
        class TestScraper(BaseScraper):
            def get_source_name(self):
                return "Test Source"

            def get_urls(self):
                return [{'id': 'test', 'url': None, 'type': 'manual'}]

            def scrape_item(self, item):
                return {'title': 'Test', 'content': 'Test content'}

        scraper = TestScraper(output_dir=str(temp_dir), rate_limit=1.0)

        assert scraper.output_dir == str(temp_dir)
        assert scraper.rate_limit == 1.0

    def test_output_directory_creation(self, temp_dir):
        """Test that output directory is created if it doesn't exist."""
        from src.scrapers.base_scraper import BaseScraper

        class TestScraper(BaseScraper):
            def get_source_name(self):
                return "Test Source"

            def get_urls(self):
                return []

            def scrape_item(self, item):
                return None

        new_dir = temp_dir / "new_subdir" / "scraper_output"
        scraper = TestScraper(output_dir=str(new_dir), rate_limit=1.0)

        assert Path(new_dir).exists()


class TestTalebScraper:
    """Tests for the Taleb scraper."""

    def test_taleb_scraper_initialization(self):
        """Test Taleb scraper initializes correctly."""
        from src.scrapers.taleb import TalebScraper

        scraper = TalebScraper()

        assert scraper.get_source_name() == "Nassim Nicholas Taleb"
        assert "knowledge_base/investors/taleb" in scraper.output_dir

    def test_taleb_get_urls(self):
        """Test that Taleb scraper returns expected URLs/content."""
        from src.scrapers.taleb import TalebScraper

        scraper = TalebScraper()
        urls = scraper.get_urls()

        assert len(urls) >= 5
        assert any('black_swan' in url['id'] for url in urls)
        assert any('antifragile' in url['id'] for url in urls)
        assert any('skin_in_the_game' in url['id'] for url in urls)

    def test_taleb_scrape_manual_content(self):
        """Test scraping manual/curated content."""
        from src.scrapers.taleb import TalebScraper

        scraper = TalebScraper()
        urls = scraper.get_urls()

        # Find a manual content item
        manual_item = next(u for u in urls if u.get('type') == 'manual')
        result = scraper.scrape_item(manual_item)

        assert result is not None
        assert 'title' in result
        assert 'content' in result
        assert len(result['content']) > 100

    def test_taleb_content_topics(self):
        """Test that Taleb content has correct topics."""
        from src.scrapers.taleb import TalebScraper

        scraper = TalebScraper()
        urls = scraper.get_urls()

        manual_item = next(u for u in urls if u.get('type') == 'manual')
        result = scraper.scrape_item(manual_item)

        assert 'metadata' in result
        assert 'topics' in result['metadata']
        topics = result['metadata']['topics']
        assert any(t in topics for t in ['tail_risk', 'antifragility', 'black_swan'])


class TestSpitznagelScraper:
    """Tests for the Spitznagel/Universa scraper."""

    def test_spitznagel_scraper_initialization(self):
        """Test Spitznagel scraper initializes correctly."""
        from src.scrapers.universa_spitznagel import UniversaSpitznagelScraper

        scraper = UniversaSpitznagelScraper()

        assert scraper.get_source_name() == "Mark Spitznagel - Universa Investments"
        assert "knowledge_base/investors/spitznagel" in scraper.output_dir

    def test_spitznagel_get_urls(self):
        """Test that Spitznagel scraper returns expected URLs."""
        from src.scrapers.universa_spitznagel import UniversaSpitznagelScraper

        scraper = UniversaSpitznagelScraper()
        urls = scraper.get_urls()

        assert len(urls) >= 4
        assert any('roundabout' in url['id'] for url in urls)
        assert any('safe_haven' in url['id'] for url in urls)
        assert any('austrian' in url['id'] for url in urls)

    def test_spitznagel_content_covers_key_concepts(self):
        """Test that Spitznagel content covers key investment concepts."""
        from src.scrapers.universa_spitznagel import UniversaSpitznagelScraper

        scraper = UniversaSpitznagelScraper()
        urls = scraper.get_urls()

        all_content = ""
        for item in urls:
            if item.get('type') == 'manual':
                result = scraper.scrape_item(item)
                if result:
                    all_content += result['content'].lower()

        # Key concepts should be present
        assert 'tail risk' in all_content or 'roundabout' in all_content
        assert 'austrian' in all_content or 'böhm-bawerk' in all_content.replace('ö', 'o')


class TestA16ZScraper:
    """Tests for the a16z scraper."""

    def test_a16z_scraper_initialization(self):
        """Test a16z scraper initializes correctly."""
        from src.scrapers.a16z import A16ZScraper

        scraper = A16ZScraper()

        assert scraper.get_source_name() == "Andreessen Horowitz (a16z)"
        assert "knowledge_base/technology/a16z" in scraper.output_dir

    def test_a16z_curated_insights(self):
        """Test that a16z has curated insights."""
        from src.scrapers.a16z import A16ZScraper

        scraper = A16ZScraper()
        urls = scraper.get_urls()

        curated = [u for u in urls if u.get('type') == 'manual']
        assert len(curated) >= 4

        # Check for key theses
        ids = [u['id'] for u in curated]
        assert any('software' in id for id in ids)
        assert any('network' in id for id in ids)

    def test_a16z_software_eating_world_content(self):
        """Test the 'Software Eating World' content."""
        from src.scrapers.a16z import A16ZScraper

        scraper = A16ZScraper()
        urls = scraper.get_urls()

        software_item = next(u for u in urls if 'software' in u['id'])
        result = scraper.scrape_item(software_item)

        assert result is not None
        assert 'software' in result['content'].lower()
        assert 'disruption' in result['metadata']['topics'] or 'technology' in result['metadata']['topics']


class TestBenedictEvansScraper:
    """Tests for the Benedict Evans scraper."""

    def test_evans_scraper_initialization(self):
        """Test Benedict Evans scraper initializes correctly."""
        from src.scrapers.benedict_evans import BenedictEvansScraper

        scraper = BenedictEvansScraper()

        assert scraper.get_source_name() == "Benedict Evans"
        assert "knowledge_base/technology/benedict_evans" in scraper.output_dir

    def test_evans_curated_insights(self):
        """Test that Evans has curated insights on key topics."""
        from src.scrapers.benedict_evans import BenedictEvansScraper

        scraper = BenedictEvansScraper()
        urls = scraper.get_urls()

        curated = [u for u in urls if u.get('type') == 'manual']
        assert len(curated) >= 4

        # Check key topics covered
        ids = [u['id'] for u in curated]
        assert any('market' in id or 'sizing' in id for id in ids)
        assert any('ai' in id for id in ids)


class TestARKInvestScraper:
    """Tests for the ARK Invest scraper."""

    def test_ark_scraper_initialization(self):
        """Test ARK Invest scraper initializes correctly."""
        from src.scrapers.ark_invest import ARKInvestScraper

        scraper = ARKInvestScraper()

        assert scraper.get_source_name() == "ARK Invest Research"
        assert "knowledge_base/technology/ark_invest" in scraper.output_dir

    def test_ark_disruptive_innovation_content(self):
        """Test ARK's disruptive innovation framework content."""
        from src.scrapers.ark_invest import ARKInvestScraper

        scraper = ARKInvestScraper()
        urls = scraper.get_urls()

        innovation_item = next(u for u in urls if 'disruptive' in u.get('id', ''))
        result = scraper.scrape_item(innovation_item)

        assert result is not None
        content_lower = result['content'].lower()
        # ARK's key themes
        assert 'innovation' in content_lower
        assert any(term in content_lower for term in ['ai', 'robot', 'energy', 'dna', 'blockchain'])

    def test_ark_topics_metadata(self):
        """Test that ARK content has appropriate topic tags."""
        from src.scrapers.ark_invest import ARKInvestScraper

        scraper = ARKInvestScraper()
        urls = scraper.get_urls()

        for item in urls:
            if item.get('type') == 'manual':
                result = scraper.scrape_item(item)
                if result:
                    topics = result['metadata']['topics']
                    assert 'technology' in topics or 'disruption' in topics


class TestAIInsightsScraper:
    """Tests for the AI Insights scraper."""

    def test_ai_insights_initialization(self):
        """Test AI Insights scraper initializes correctly."""
        from src.scrapers.ai_insights import AIInsightsScraper

        scraper = AIInsightsScraper()

        assert scraper.get_source_name() == "AI & Robotics Investment Insights"
        assert "knowledge_base/technology/ai_insights" in scraper.output_dir

    def test_ai_insights_content_count(self):
        """Test that AI Insights has all expected content."""
        from src.scrapers.ai_insights import AIInsightsScraper

        scraper = AIInsightsScraper()
        urls = scraper.get_urls()

        assert len(urls) >= 5
        ids = [u['id'] for u in urls]

        # Check for key frameworks
        assert any('investment_framework' in id for id in ids)
        assert any('robotics' in id for id in ids)
        assert any('moat' in id or 'valuation' in id for id in ids)

    def test_ai_insights_valuation_framework(self):
        """Test the AI valuation framework content."""
        from src.scrapers.ai_insights import AIInsightsScraper

        scraper = AIInsightsScraper()
        urls = scraper.get_urls()

        valuation_item = next((u for u in urls if 'valuation' in u.get('id', '')), None)
        if valuation_item:
            result = scraper.scrape_item(valuation_item)
            assert result is not None
            content_lower = result['content'].lower()
            assert 'valuation' in content_lower
            assert any(term in content_lower for term in ['revenue', 'margin', 'growth', 'tam'])


class TestScraperOutput:
    """Tests for scraper output format and structure."""

    def test_scraper_output_format(self, temp_dir):
        """Test that scraper output follows standard format."""
        from src.scrapers.taleb import TalebScraper

        scraper = TalebScraper()
        scraper.output_dir = str(temp_dir)

        urls = scraper.get_urls()
        item = next(u for u in urls if u.get('type') == 'manual')
        result = scraper.scrape_item(item)

        # Save the item
        scraper.save_item(item['id'], result)

        # Check file was created
        output_file = temp_dir / f"{item['id']}.txt"
        assert output_file.exists()

        # Check content format
        content = output_file.read_text()
        assert 'Title:' in content
        assert 'Source:' in content
        assert '---' in content  # Separator

    def test_resume_capability(self, temp_dir):
        """Test that scrapers can resume from existing files."""
        from src.scrapers.ai_insights import AIInsightsScraper

        scraper = AIInsightsScraper()
        scraper.output_dir = str(temp_dir)

        # First run
        stats1 = scraper.scrape_all(resume=True, limit=2)
        scraped_first = stats1['scraped']

        # Second run should skip existing
        stats2 = scraper.scrape_all(resume=True, limit=2)

        assert stats2['skipped'] >= scraped_first or stats2['scraped'] == 0


class TestScraperTopicTagging:
    """Tests for topic tagging in scraped content."""

    def test_tail_risk_topics(self):
        """Test that tail risk scrapers tag content correctly."""
        from src.scrapers.taleb import TalebScraper

        scraper = TalebScraper()
        urls = scraper.get_urls()

        for item in urls:
            if item.get('type') == 'manual':
                result = scraper.scrape_item(item)
                if result:
                    topics = result['metadata']['topics']
                    # Should have at least one tail risk related topic
                    tail_risk_topics = ['tail_risk', 'antifragility', 'black_swan', 'risk_management']
                    assert any(t in topics for t in tail_risk_topics), f"Missing tail risk topics in {item['id']}"

    def test_technology_topics(self):
        """Test that technology scrapers tag content correctly."""
        from src.scrapers.a16z import A16ZScraper

        scraper = A16ZScraper()
        urls = scraper.get_urls()

        curated = [u for u in urls if u.get('type') == 'manual']
        for item in curated:
            result = scraper.scrape_item(item)
            if result:
                topics = result['metadata']['topics']
                tech_topics = ['technology', 'disruption', 'ai', 'network_effects', 'fintech']
                assert any(t in topics for t in tech_topics), f"Missing tech topics in {item['id']}"


class TestScraperErrorHandling:
    """Tests for scraper error handling."""

    def test_graceful_http_error_handling(self, temp_dir):
        """Test that scrapers handle HTTP errors gracefully."""
        from src.scrapers.base_scraper import BaseScraper
        from unittest.mock import patch, MagicMock

        class TestScraper(BaseScraper):
            def get_source_name(self):
                return "Test"

            def get_urls(self):
                return [{'id': 'test', 'url': 'http://invalid-url-that-does-not-exist.com', 'type': 'web'}]

            def scrape_item(self, item):
                soup = self.fetch_page(item['url'])
                if soup is None:
                    return None
                return {'title': 'Test', 'content': 'Content'}

        scraper = TestScraper(output_dir=str(temp_dir))

        # Patch the session's get method, not requests.get
        scraper.session.get = MagicMock(side_effect=Exception("Network error"))

        urls = scraper.get_urls()
        result = scraper.scrape_item(urls[0])

        assert result is None  # Should return None, not raise

    def test_empty_content_handling(self, temp_dir):
        """Test handling of empty content from scraping."""
        from src.scrapers.base_scraper import BaseScraper

        class TestScraper(BaseScraper):
            def get_source_name(self):
                return "Test"

            def get_urls(self):
                return [{'id': 'empty', 'type': 'manual', 'content': ''}]

            def scrape_item(self, item):
                if not item.get('content'):
                    return None
                return {'title': 'Test', 'content': item['content']}

        scraper = TestScraper(output_dir=str(temp_dir))
        urls = scraper.get_urls()
        result = scraper.scrape_item(urls[0])

        assert result is None


# Run tests if executed directly
if __name__ == '__main__':
    pytest.main([__file__, '-v'])

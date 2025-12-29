# src/services/ai/knowledge/maintenance/freshness_checker.py

"""
Check content freshness and identify stale content.

Helps keep the knowledge base current by:
- Tracking content age
- Identifying outdated information
- Suggesting content for refresh
"""

import os
import logging
from typing import List, Dict, Optional
from datetime import datetime, timedelta
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class FreshnessReport:
    """Report on content freshness"""
    source: str
    last_updated: Optional[datetime]
    document_count: int
    stale_count: int
    freshness_score: float  # 0-1
    needs_update: bool
    suggested_action: str


class FreshnessChecker:
    """
    Check and report on knowledge base freshness.

    Different sources have different freshness requirements:
    - Buffett letters: Annual, so OK to be a year old
    - Blog posts: Should be checked monthly
    - News/current events: Need frequent updates
    """

    # Freshness thresholds by source type
    FRESHNESS_THRESHOLDS = {
        # Type: (days_until_stale, days_until_critical)
        'annual_letter': (400, 800),      # Yearly publications
        'quarterly_report': (120, 240),   # Quarterly
        'blog_post': (180, 365),          # Semi-annual refresh
        'news': (7, 30),                  # Weekly for news
        'research': (365, 730),           # Annual for research
        'book_content': (730, 1460),      # Books stay relevant longer
        'timeless': (1825, 3650),         # Classic wisdom (5+ years OK)
        'default': (365, 730)             # Default: yearly
    }

    # Source to type mapping
    SOURCE_TYPES = {
        'berkshire hathaway': 'annual_letter',
        'oaktree': 'quarterly_report',
        'farnam street': 'blog_post',
        'damodaran': 'blog_post',
        'collaborative fund': 'blog_post',
        'nassim taleb': 'timeless',
        'universa': 'research',
    }

    def __init__(self, knowledge_dir: str = "knowledge_base"):
        self.knowledge_dir = knowledge_dir

    def check_source(self, source_path: str) -> FreshnessReport:
        """
        Check freshness of a specific source directory.

        Args:
            source_path: Path to source directory

        Returns:
            FreshnessReport for this source
        """
        if not os.path.exists(source_path):
            return FreshnessReport(
                source=source_path,
                last_updated=None,
                document_count=0,
                stale_count=0,
                freshness_score=0,
                needs_update=True,
                suggested_action="Source directory does not exist"
            )

        # Get all files and their modification times
        files = []
        for root, dirs, filenames in os.walk(source_path):
            for filename in filenames:
                if filename.endswith('.txt'):
                    filepath = os.path.join(root, filename)
                    mtime = datetime.fromtimestamp(os.path.getmtime(filepath))
                    files.append({
                        'path': filepath,
                        'modified': mtime,
                        'age_days': (datetime.now() - mtime).days
                    })

        if not files:
            return FreshnessReport(
                source=source_path,
                last_updated=None,
                document_count=0,
                stale_count=0,
                freshness_score=0,
                needs_update=True,
                suggested_action="No documents found - run scraper"
            )

        # Determine source type
        source_name = os.path.basename(source_path).lower()
        source_type = self._get_source_type(source_name)
        stale_threshold, critical_threshold = self.FRESHNESS_THRESHOLDS[source_type]

        # Calculate freshness metrics
        last_updated = max(f['modified'] for f in files)
        stale_count = sum(1 for f in files if f['age_days'] > stale_threshold)
        days_since_update = (datetime.now() - last_updated).days

        # Calculate freshness score (1 = fresh, 0 = very stale)
        if days_since_update <= stale_threshold:
            freshness_score = 1.0 - (days_since_update / stale_threshold) * 0.3
        elif days_since_update <= critical_threshold:
            freshness_score = 0.7 - (days_since_update - stale_threshold) / (critical_threshold - stale_threshold) * 0.5
        else:
            freshness_score = max(0.1, 0.2 - (days_since_update - critical_threshold) / 365 * 0.1)

        # Determine if update needed
        needs_update = days_since_update > stale_threshold or stale_count > len(files) * 0.3

        # Suggest action
        if days_since_update > critical_threshold:
            suggested_action = f"Critical: {days_since_update} days since update. Run full refresh."
        elif days_since_update > stale_threshold:
            suggested_action = f"Stale: {days_since_update} days since update. Consider refreshing."
        elif stale_count > 0:
            suggested_action = f"{stale_count} documents stale. Consider incremental update."
        else:
            suggested_action = "Content is fresh. No action needed."

        return FreshnessReport(
            source=source_path,
            last_updated=last_updated,
            document_count=len(files),
            stale_count=stale_count,
            freshness_score=round(freshness_score, 2),
            needs_update=needs_update,
            suggested_action=suggested_action
        )

    def _get_source_type(self, source_name: str) -> str:
        """Determine source type from name"""
        for name_part, source_type in self.SOURCE_TYPES.items():
            if name_part in source_name.lower():
                return source_type
        return 'default'

    def check_all_sources(self) -> List[FreshnessReport]:
        """
        Check freshness of all sources in knowledge base.

        Returns:
            List of FreshnessReports for each source
        """
        reports = []

        if not os.path.exists(self.knowledge_dir):
            logger.warning(f"Knowledge directory does not exist: {self.knowledge_dir}")
            return reports

        # Walk the knowledge base structure
        for category in os.listdir(self.knowledge_dir):
            category_path = os.path.join(self.knowledge_dir, category)
            if not os.path.isdir(category_path):
                continue

            for source in os.listdir(category_path):
                source_path = os.path.join(category_path, source)
                if os.path.isdir(source_path):
                    report = self.check_source(source_path)
                    reports.append(report)

        # Sort by freshness (least fresh first)
        reports.sort(key=lambda r: r.freshness_score)

        return reports

    def get_update_recommendations(self) -> Dict:
        """
        Get prioritized update recommendations.

        Returns:
            Dict with categorized recommendations
        """
        reports = self.check_all_sources()

        recommendations = {
            'critical': [],      # Needs immediate update
            'should_update': [], # Should update soon
            'optional': [],      # Could update
            'fresh': []          # No update needed
        }

        for report in reports:
            item = {
                'source': report.source,
                'last_updated': report.last_updated.isoformat() if report.last_updated else None,
                'freshness_score': report.freshness_score,
                'action': report.suggested_action
            }

            if report.freshness_score < 0.3:
                recommendations['critical'].append(item)
            elif report.freshness_score < 0.6:
                recommendations['should_update'].append(item)
            elif report.freshness_score < 0.8:
                recommendations['optional'].append(item)
            else:
                recommendations['fresh'].append(item)

        return recommendations

    def get_summary(self) -> Dict:
        """Get overall freshness summary"""
        reports = self.check_all_sources()

        if not reports:
            return {
                'status': 'no_data',
                'message': 'No knowledge sources found'
            }

        total_docs = sum(r.document_count for r in reports)
        stale_docs = sum(r.stale_count for r in reports)
        avg_freshness = sum(r.freshness_score for r in reports) / len(reports)
        needing_update = sum(1 for r in reports if r.needs_update)

        if avg_freshness > 0.8:
            status = 'healthy'
        elif avg_freshness > 0.5:
            status = 'needs_attention'
        else:
            status = 'stale'

        return {
            'status': status,
            'total_sources': len(reports),
            'total_documents': total_docs,
            'stale_documents': stale_docs,
            'average_freshness': round(avg_freshness, 2),
            'sources_needing_update': needing_update,
            'recommendations': self.get_update_recommendations()
        }

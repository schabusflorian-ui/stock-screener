# Knowledge Scrapers
# Each scraper inherits from BaseScraper and implements source-specific logic

from .base_scraper import BaseScraper
from .berkshire_letters import BerkshireLettersScraper
from .oaktree_memos import OaktreeMemosScraper
from .farnam_street import FarnamStreetScraper
from .damodaran import DamodaranScraper
from .collaborative_fund import CollaborativeFundScraper

# Tail Risk & Anti-Fragility
from .taleb import TalebScraper
from .universa_spitznagel import UniversaSpitznagelScraper

# Technology & Disruption
from .a16z import A16ZScraper
from .benedict_evans import BenedictEvansScraper
from .ark_invest import ARKInvestScraper
from .ai_insights import AIInsightsScraper

__all__ = [
    'BaseScraper',
    # Value/Traditional Investing
    'BerkshireLettersScraper',
    'OaktreeMemosScraper',
    'FarnamStreetScraper',
    'DamodaranScraper',
    'CollaborativeFundScraper',
    # Tail Risk & Anti-Fragility
    'TalebScraper',
    'UniversaSpitznagelScraper',
    # Technology & Disruption
    'A16ZScraper',
    'BenedictEvansScraper',
    'ARKInvestScraper',
    'AIInsightsScraper',
]

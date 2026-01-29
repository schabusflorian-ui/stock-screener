#!/usr/bin/env python3
"""
Test runner script for the Investment Project LLM features.

This script provides:
- Easy test execution with different modes
- Coverage reporting
- Test categorization (unit, integration, all)
- Parallel test execution
- Detailed reporting

Usage:
    # Run all tests
    python scripts/run_tests.py

    # Run specific test category
    python scripts/run_tests.py --category unit
    python scripts/run_tests.py --category integration
    python scripts/run_tests.py --category scrapers
    python scripts/run_tests.py --category ai
    python scripts/run_tests.py --category api

    # Run with coverage
    python scripts/run_tests.py --coverage

    # Run specific test file
    python scripts/run_tests.py --file tests/ai/test_analyst_personas.py

    # Run with verbose output
    python scripts/run_tests.py --verbose

    # Run in parallel
    python scripts/run_tests.py --parallel
"""

import argparse
import subprocess
import sys
import os
from pathlib import Path

# Project root
PROJECT_ROOT = Path(__file__).parent.parent

# Test directories
TEST_DIRS = {
    'all': 'tests',
    'unit': ['tests/ai', 'tests/scrapers'],
    'integration': 'tests/integration',
    'scrapers': 'tests/scrapers',
    'ai': 'tests/ai',
    'api': 'tests/api'
}

# Test markers for categorization
TEST_MARKERS = {
    'slow': 'Tests that take a long time',
    'llm': 'Tests that require LLM API',
    'network': 'Tests that require network access',
    'database': 'Tests that require database'
}


def run_pytest(args: list, cwd: Path = PROJECT_ROOT) -> int:
    """Run pytest with given arguments."""
    cmd = [sys.executable, '-m', 'pytest'] + args
    print(f"\n{'='*60}")
    print(f"Running: {' '.join(cmd)}")
    print(f"{'='*60}\n")

    result = subprocess.run(cmd, cwd=cwd)
    return result.returncode


def get_test_paths(category: str) -> list:
    """Get test paths for a category."""
    if category == 'all':
        return [str(PROJECT_ROOT / TEST_DIRS['all'])]

    paths = TEST_DIRS.get(category, [])
    if isinstance(paths, str):
        paths = [paths]

    return [str(PROJECT_ROOT / p) for p in paths]


def main():
    parser = argparse.ArgumentParser(
        description='Run tests for Investment Project LLM features',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
    python scripts/run_tests.py                    # Run all tests
    python scripts/run_tests.py --category ai      # Run AI tests only
    python scripts/run_tests.py --coverage         # Run with coverage
    python scripts/run_tests.py -v --category scrapers  # Verbose scraper tests
        """
    )

    parser.add_argument(
        '--category', '-c',
        choices=['all', 'unit', 'integration', 'scrapers', 'ai', 'api'],
        default='all',
        help='Test category to run'
    )

    parser.add_argument(
        '--file', '-f',
        help='Run specific test file'
    )

    parser.add_argument(
        '--coverage',
        action='store_true',
        help='Run with coverage reporting'
    )

    parser.add_argument(
        '--verbose', '-v',
        action='store_true',
        help='Verbose output'
    )

    parser.add_argument(
        '--parallel', '-p',
        action='store_true',
        help='Run tests in parallel (requires pytest-xdist)'
    )

    parser.add_argument(
        '--markers', '-m',
        help='Run tests matching marker expression'
    )

    parser.add_argument(
        '--keyword', '-k',
        help='Run tests matching keyword expression'
    )

    parser.add_argument(
        '--failfast', '-x',
        action='store_true',
        help='Stop on first failure'
    )

    parser.add_argument(
        '--last-failed',
        action='store_true',
        help='Run only last failed tests'
    )

    parser.add_argument(
        '--html-report',
        action='store_true',
        help='Generate HTML report (requires pytest-html)'
    )

    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='Show what would be run without executing'
    )

    args = parser.parse_args()

    # Build pytest arguments
    pytest_args = []

    # Add test paths
    if args.file:
        pytest_args.append(args.file)
    else:
        pytest_args.extend(get_test_paths(args.category))

    # Verbosity
    if args.verbose:
        pytest_args.append('-v')
    else:
        pytest_args.append('-q')

    # Coverage
    if args.coverage:
        pytest_args.extend([
            '--cov=src',
            '--cov-report=term-missing',
            '--cov-report=html:coverage_report',
            '--cov-fail-under=50'  # Minimum coverage threshold
        ])

    # Parallel execution
    if args.parallel:
        pytest_args.extend(['-n', 'auto'])

    # Markers
    if args.markers:
        pytest_args.extend(['-m', args.markers])

    # Keywords
    if args.keyword:
        pytest_args.extend(['-k', args.keyword])

    # Fail fast
    if args.failfast:
        pytest_args.append('-x')

    # Last failed
    if args.last_failed:
        pytest_args.append('--lf')

    # HTML report
    if args.html_report:
        pytest_args.extend(['--html=test_report.html', '--self-contained-html'])

    # Show test durations
    pytest_args.extend(['--durations=10'])

    # Dry run
    if args.dry_run:
        print(f"Would run: pytest {' '.join(pytest_args)}")
        return 0

    # Check if pytest is installed
    try:
        import pytest
    except ImportError:
        print("ERROR: pytest is not installed. Install with: pip install pytest")
        return 1

    # Check for coverage if requested
    if args.coverage:
        try:
            import pytest_cov
        except ImportError:
            print("WARNING: pytest-cov not installed. Install with: pip install pytest-cov")
            # Remove coverage args
            pytest_args = [a for a in pytest_args if not a.startswith('--cov')]

    # Check for parallel if requested
    if args.parallel:
        try:
            import xdist
        except ImportError:
            print("WARNING: pytest-xdist not installed. Install with: pip install pytest-xdist")
            pytest_args = [a for a in pytest_args if a not in ['-n', 'auto']]

    # Run tests
    return run_pytest(pytest_args)


def print_test_summary():
    """Print summary of available tests."""
    print("\n" + "="*60)
    print("INVESTMENT PROJECT - LLM FEATURE TESTS")
    print("="*60)

    print("\nTest Categories:")
    for category, paths in TEST_DIRS.items():
        if isinstance(paths, list):
            paths = ', '.join(paths)
        print(f"  {category:15} -> {paths}")

    print("\nTest Markers:")
    for marker, desc in TEST_MARKERS.items():
        print(f"  {marker:15} -> {desc}")

    print("\nQuick Commands:")
    print("  python scripts/run_tests.py                    # All tests")
    print("  python scripts/run_tests.py -c ai -v           # AI tests verbose")
    print("  python scripts/run_tests.py -c scrapers        # Scraper tests")
    print("  python scripts/run_tests.py --coverage         # With coverage")
    print("  python scripts/run_tests.py -k 'analyst'       # Tests with 'analyst'")
    print()


if __name__ == '__main__':
    if len(sys.argv) == 1:
        # If no arguments, print summary and run all tests
        print_test_summary()

    sys.exit(main())

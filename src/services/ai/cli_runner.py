#!/usr/bin/env python3
# src/services/ai/cli_runner.py
"""
CLI runner for AI services.

This script provides a command-line interface for Node.js to call Python AI services.
It handles JSON input/output and routes commands to the appropriate service.

Usage:
    python cli_runner.py <command> <json_args>

Commands:
    - analyst: Analyst service commands (list, get, chat, analyze)
    - briefing: Daily briefing generation
    - debate: Bull vs Bear debates
    - document: Document analysis
    - status: Service status check
"""

import sys
import json
import logging
import os

# Add project root to path for imports
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
sys.path.insert(0, PROJECT_ROOT)

# Use relative imports from within the ai package
try:
    from src.services.ai.analyst_service import get_analyst_service
except ImportError:
    # Fallback for when running from within the package
    from analyst_service import get_analyst_service

# Configure logging to stderr (stdout is for JSON output)
logging.basicConfig(
    level=logging.WARNING,
    format='%(name)s - %(levelname)s - %(message)s',
    stream=sys.stderr
)

logger = logging.getLogger(__name__)


def handle_analyst_command(action: str, args: dict) -> dict:
    """Handle analyst service commands."""
    service = get_analyst_service()

    if action == 'list':
        return {'analysts': service.get_analysts()}

    elif action == 'get':
        analyst_id = args.get('analyst_id')
        if not analyst_id:
            return {'error': 'analyst_id required'}
        return {'analyst': service.get_analyst_info(analyst_id)}

    elif action == 'create_conversation':
        conv = service.create_conversation(
            args.get('analyst_id'),
            args.get('company_id'),
            args.get('company_symbol')
        )
        return {'conversation': conv.to_dict()}

    elif action == 'get_conversation':
        conv = service.get_conversation(args.get('conversation_id'))
        if conv:
            return {'conversation': conv.to_dict()}
        return {'error': 'Conversation not found'}

    elif action == 'chat':
        msg = service.chat(
            args.get('conversation_id'),
            args.get('message'),
            args.get('company_context')
        )
        return {
            'message': {
                'id': msg.id,
                'role': msg.role,
                'content': msg.content,
                'timestamp': msg.timestamp,
                'metadata': msg.metadata
            }
        }

    elif action == 'analyze':
        response = service.quick_analyze(
            args.get('analyst_id'),
            args.get('company_data', {}),
            args.get('question')
        )
        return {
            'analysis': {
                'content': response.content,
                'model': response.model,
                'tokens': response.tokens_used,
                'cost_usd': response.cost_usd
            }
        }

    elif action == 'stats':
        return {'stats': service.get_stats()}

    else:
        return {'error': f'Unknown analyst action: {action}'}


def handle_briefing_command(action: str, args: dict) -> dict:
    """Handle daily briefing commands."""
    try:
        from src.services.ai.proactive.daily_briefing import DailyBriefingGenerator

        if action == 'generate':
            generator = DailyBriefingGenerator()
            briefing = generator.generate_briefing(
                portfolio_data=args.get('portfolio_data', []),
                market_data=args.get('market_data', {}),
                news_data=args.get('news_data', []),
                user_preferences=args.get('user_preferences', {})
            )
            return {'briefing': briefing.to_dict() if hasattr(briefing, 'to_dict') else briefing}

        return {'error': f'Unknown briefing action: {action}'}

    except ImportError as e:
        return {'error': f'Briefing service not available: {str(e)}'}


def handle_debate_command(action: str, args: dict) -> dict:
    """Handle debate commands."""
    try:
        from src.services.ai.debate.debate_engine import DebateEngine, DebateFormat

        engine = DebateEngine()

        if action == 'bull_bear':
            result = engine.run_debate(
                format=DebateFormat.BULL_BEAR,
                topic=args.get('topic', f"Investment case for {args.get('symbol', 'Unknown')}"),
                symbol=args.get('symbol'),
                company_data=args.get('company_data', {}),
                bull_analyst=args.get('bull_analyst', 'growth'),
                bear_analyst=args.get('bear_analyst', 'contrarian')
            )
            return {'debate': result.to_dict() if hasattr(result, 'to_dict') else result}

        elif action == 'round_table':
            result = engine.run_debate(
                format=DebateFormat.ROUND_TABLE,
                topic=args.get('topic', f"Analysis of {args.get('symbol', 'Unknown')}"),
                symbol=args.get('symbol'),
                company_data=args.get('company_data', {}),
                analysts=args.get('analysts', ['value', 'growth', 'contrarian'])
            )
            return {'debate': result.to_dict() if hasattr(result, 'to_dict') else result}

        elif action == 'challenge':
            result = engine.run_debate(
                format=DebateFormat.THESIS_CHALLENGE,
                topic=args.get('thesis', ''),
                symbol=args.get('symbol'),
                company_data=args.get('company_data', {}),
                challenger=args.get('challenger', 'contrarian')
            )
            return {'challenge': result.to_dict() if hasattr(result, 'to_dict') else result}

        return {'error': f'Unknown debate action: {action}'}

    except ImportError as e:
        return {'error': f'Debate service not available: {str(e)}'}


def handle_document_command(action: str, args: dict) -> dict:
    """Handle document analysis commands."""
    try:
        from src.services.ai.documents.extractor import DocumentExtractor
        from src.services.ai.documents.earnings_analyzer import EarningsCallAnalyzer

        if action == 'extract':
            extractor = DocumentExtractor()
            content = extractor.extract(
                args.get('file_path', ''),
                args.get('file_type', 'auto')
            )
            return {'content': content}

        elif action == 'analyze_earnings':
            analyzer = EarningsCallAnalyzer()
            analysis = analyzer.analyze(
                transcript=args.get('transcript', ''),
                symbol=args.get('symbol'),
                quarter=args.get('quarter')
            )
            return {'analysis': analysis.to_dict() if hasattr(analysis, 'to_dict') else analysis}

        return {'error': f'Unknown document action: {action}'}

    except ImportError as e:
        return {'error': f'Document service not available: {str(e)}'}


def handle_notes_command(action: str, args: dict) -> dict:
    """Handle notes AI commands."""
    try:
        from src.services.ai.notes_ai_service import get_notes_ai_service

        service = get_notes_ai_service()

        if not service.is_available():
            return {'error': 'Notes AI service not available. Configure ANTHROPIC_API_KEY.'}

        if action == 'summarize':
            response = service.summarize_note(
                note_content=args.get('content', ''),
                note_title=args.get('title', ''),
                max_length=args.get('max_length', 200)
            )
            return {
                'summary': response.content,
                'model': response.model,
                'tokens': response.tokens_used,
                'cost_usd': response.cost_usd
            }

        elif action == 'extract_assumptions':
            response = service.extract_assumptions(
                note_content=args.get('content', ''),
                thesis_context=args.get('thesis_context', '')
            )
            return {
                'result': response.content,
                'parsed': response.metadata,
                'model': response.model,
                'tokens': response.tokens_used,
                'cost_usd': response.cost_usd
            }

        elif action == 'challenge_thesis':
            response = service.challenge_thesis(
                thesis_summary=args.get('thesis_summary', ''),
                assumptions=args.get('assumptions', []),
                company_data=args.get('company_data')
            )
            return {
                'challenges': response.content,
                'model': response.model,
                'tokens': response.tokens_used,
                'cost_usd': response.cost_usd
            }

        elif action == 'extract_insights':
            response = service.extract_key_insights(
                note_content=args.get('content', ''),
                note_type=args.get('note_type', 'research')
            )
            return {
                'result': response.content,
                'parsed': response.metadata,
                'model': response.model,
                'tokens': response.tokens_used,
                'cost_usd': response.cost_usd
            }

        elif action == 'suggest_tags':
            response = service.suggest_tags(
                note_content=args.get('content', ''),
                existing_tags=args.get('existing_tags', [])
            )
            return {
                'result': response.content,
                'parsed': response.metadata,
                'model': response.model,
                'tokens': response.tokens_used,
                'cost_usd': response.cost_usd
            }

        else:
            return {'error': f'Unknown notes action: {action}'}

    except ImportError as e:
        return {'error': f'Notes AI service not available: {str(e)}'}


def handle_status_command() -> dict:
    """Check AI service status."""
    status = {
        'claude': False,
        'ollama': False,
        'services': {
            'analyst': False,
            'briefing': False,
            'debate': False,
            'document': False,
            'notes': False
        }
    }

    # Check Claude API
    if os.environ.get('ANTHROPIC_API_KEY'):
        status['claude'] = True

    # Check Ollama
    try:
        import urllib.request
        ollama_url = os.environ.get('OLLAMA_URL', 'http://localhost:11434')
        req = urllib.request.Request(f"{ollama_url}/api/tags", method='GET')
        req.add_header('Content-Type', 'application/json')
        with urllib.request.urlopen(req, timeout=2) as response:
            status['ollama'] = response.status == 200
    except Exception:
        status['ollama'] = False

    # Check services
    try:
        from src.services.ai.analyst_service import AnalystService
        status['services']['analyst'] = True
    except Exception:
        pass

    try:
        from src.services.ai.proactive.daily_briefing import DailyBriefingGenerator
        status['services']['briefing'] = True
    except Exception:
        pass

    try:
        from src.services.ai.debate.debate_engine import DebateEngine
        status['services']['debate'] = True
    except Exception:
        pass

    try:
        from src.services.ai.documents.extractor import DocumentExtractor
        status['services']['document'] = True
    except Exception:
        pass

    try:
        from src.services.ai.notes_ai_service import NotesAIService
        status['services']['notes'] = True
    except Exception:
        pass

    return status


def main():
    """Main CLI entry point."""
    if len(sys.argv) < 2:
        print(json.dumps({'error': 'Command required'}))
        sys.exit(1)

    command = sys.argv[1]

    # Parse args from stdin or command line
    try:
        if len(sys.argv) > 2:
            args = json.loads(sys.argv[2])
        else:
            # Try reading from stdin
            input_data = sys.stdin.read().strip()
            args = json.loads(input_data) if input_data else {}
    except json.JSONDecodeError:
        args = {}

    try:
        if command == 'status':
            result = handle_status_command()

        elif command.startswith('analyst:'):
            action = command.split(':', 1)[1]
            result = handle_analyst_command(action, args)

        elif command.startswith('briefing:'):
            action = command.split(':', 1)[1]
            result = handle_briefing_command(action, args)

        elif command.startswith('debate:'):
            action = command.split(':', 1)[1]
            result = handle_debate_command(action, args)

        elif command.startswith('document:'):
            action = command.split(':', 1)[1]
            result = handle_document_command(action, args)

        elif command.startswith('notes:'):
            action = command.split(':', 1)[1]
            result = handle_notes_command(action, args)

        else:
            result = {'error': f'Unknown command: {command}'}

        print(json.dumps(result))

    except Exception as e:
        logger.exception("Command failed")
        print(json.dumps({'error': str(e)}))
        sys.exit(1)


if __name__ == '__main__':
    main()

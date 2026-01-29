# src/services/ai/streaming/stream_handler.py

import json
import logging
import asyncio
from typing import Generator, AsyncGenerator, Dict, Any, Optional, Callable
from dataclasses import dataclass
from datetime import datetime

logger = logging.getLogger(__name__)


@dataclass
class StreamEvent:
    """A streaming event"""
    event_type: str  # 'start', 'token', 'complete', 'error'
    data: Any
    timestamp: datetime = None

    def __post_init__(self):
        if self.timestamp is None:
            self.timestamp = datetime.now()

    def to_sse(self) -> str:
        """Convert to Server-Sent Events format"""
        event_data = {
            'type': self.event_type,
            'data': self.data,
            'timestamp': self.timestamp.isoformat()
        }
        return f"data: {json.dumps(event_data)}\n\n"

    def to_json(self) -> str:
        """Convert to JSON string"""
        return json.dumps({
            'type': self.event_type,
            'data': self.data,
            'timestamp': self.timestamp.isoformat()
        })


class StreamHandler:
    """
    Handle streaming responses for LLM outputs.

    Provides:
    - SSE (Server-Sent Events) formatting
    - Token-by-token streaming
    - Progress tracking
    - Cancellation support
    """

    def __init__(self):
        self._cancelled = False
        self._on_token_callbacks: list = []
        self._on_complete_callbacks: list = []

    def cancel(self):
        """Cancel the current stream"""
        self._cancelled = True

    def is_cancelled(self) -> bool:
        """Check if stream is cancelled"""
        return self._cancelled

    def reset(self):
        """Reset stream state"""
        self._cancelled = False

    def on_token(self, callback: Callable[[str], None]):
        """Register callback for each token"""
        self._on_token_callbacks.append(callback)

    def on_complete(self, callback: Callable[[str], None]):
        """Register callback for completion"""
        self._on_complete_callbacks.append(callback)

    async def stream_response(self,
                              generator: Generator[str, None, None],
                              include_progress: bool = True) -> AsyncGenerator[StreamEvent, None]:
        """
        Stream response tokens as events.

        Args:
            generator: Token generator from LLM
            include_progress: Include progress events

        Yields:
            StreamEvent objects
        """
        self.reset()

        # Start event
        yield StreamEvent(event_type='start', data={'message': 'Starting generation'})

        full_response = []
        token_count = 0

        try:
            for token in generator:
                if self._cancelled:
                    yield StreamEvent(
                        event_type='cancelled',
                        data={'message': 'Stream cancelled by user'}
                    )
                    break

                full_response.append(token)
                token_count += 1

                # Notify callbacks
                for callback in self._on_token_callbacks:
                    try:
                        callback(token)
                    except Exception as e:
                        logger.warning(f"Token callback error: {e}")

                # Yield token event
                yield StreamEvent(event_type='token', data=token)

                # Yield progress event periodically
                if include_progress and token_count % 20 == 0:
                    yield StreamEvent(
                        event_type='progress',
                        data={'tokens': token_count}
                    )

                # Small delay to prevent overwhelming the stream
                await asyncio.sleep(0)

            # Complete event
            complete_text = ''.join(full_response)

            # Notify complete callbacks
            for callback in self._on_complete_callbacks:
                try:
                    callback(complete_text)
                except Exception as e:
                    logger.warning(f"Complete callback error: {e}")

            yield StreamEvent(
                event_type='complete',
                data={
                    'full_response': complete_text,
                    'token_count': token_count
                }
            )

        except Exception as e:
            logger.error(f"Stream error: {e}")
            yield StreamEvent(
                event_type='error',
                data={'error': str(e)}
            )

    def wrap_for_sse(self,
                     events: AsyncGenerator[StreamEvent, None]
                     ) -> AsyncGenerator[str, None]:
        """
        Wrap stream events as SSE formatted strings.

        Args:
            events: Stream events

        Yields:
            SSE formatted strings
        """
        async def sse_generator():
            async for event in events:
                yield event.to_sse()

        return sse_generator()


class ProgressTracker:
    """
    Track progress for long-running LLM operations.

    Useful for:
    - Multi-step analysis
    - Document processing
    - Batch operations
    """

    def __init__(self, total_steps: int = 0):
        """
        Initialize progress tracker.

        Args:
            total_steps: Total number of steps (0 = unknown)
        """
        self.total_steps = total_steps
        self.current_step = 0
        self.current_message = ""
        self.started_at = None
        self.completed_at = None
        self._callbacks: list = []

    def start(self, message: str = "Starting..."):
        """Start tracking"""
        self.started_at = datetime.now()
        self.current_message = message
        self._notify()

    def update(self, step: int = None, message: str = None):
        """Update progress"""
        if step is not None:
            self.current_step = step
        else:
            self.current_step += 1

        if message:
            self.current_message = message

        self._notify()

    def complete(self, message: str = "Complete"):
        """Mark as complete"""
        self.current_step = self.total_steps
        self.current_message = message
        self.completed_at = datetime.now()
        self._notify()

    def on_update(self, callback: Callable[['ProgressTracker'], None]):
        """Register callback for updates"""
        self._callbacks.append(callback)

    @property
    def progress_pct(self) -> float:
        """Get progress percentage"""
        if self.total_steps == 0:
            return 0.0
        return (self.current_step / self.total_steps) * 100

    @property
    def elapsed_seconds(self) -> float:
        """Get elapsed time in seconds"""
        if not self.started_at:
            return 0.0
        end = self.completed_at or datetime.now()
        return (end - self.started_at).total_seconds()

    def to_dict(self) -> Dict:
        """Convert to dictionary"""
        return {
            'current_step': self.current_step,
            'total_steps': self.total_steps,
            'progress_pct': self.progress_pct,
            'message': self.current_message,
            'elapsed_seconds': self.elapsed_seconds,
            'is_complete': self.completed_at is not None
        }

    def _notify(self):
        """Notify callbacks"""
        for callback in self._callbacks:
            try:
                callback(self)
            except Exception as e:
                logger.warning(f"Progress callback error: {e}")


class StreamingAnalysis:
    """
    Helper for streaming multi-step analyses.

    Coordinates streaming and progress for complex operations.
    """

    def __init__(self, router, stream_handler: StreamHandler = None):
        """
        Initialize streaming analysis.

        Args:
            router: ModelRouter for LLM access
            stream_handler: Optional custom stream handler
        """
        self.router = router
        self.stream_handler = stream_handler or StreamHandler()
        self.progress = None

    async def analyze_with_progress(self,
                                    steps: list,
                                    company_data: Dict,
                                    system_prompt: str = None
                                    ) -> AsyncGenerator[Dict, None]:
        """
        Run multi-step analysis with progress updates.

        Args:
            steps: List of analysis step definitions
            company_data: Company data context
            system_prompt: Optional system prompt

        Yields:
            Progress and result updates
        """
        self.progress = ProgressTracker(total_steps=len(steps))
        self.progress.start("Starting analysis...")

        yield {
            'type': 'progress',
            'data': self.progress.to_dict()
        }

        results = {}

        for i, step in enumerate(steps):
            step_name = step.get('name', f'Step {i+1}')
            step_prompt = step.get('prompt', '')

            self.progress.update(message=f"Analyzing: {step_name}")
            yield {
                'type': 'progress',
                'data': self.progress.to_dict()
            }

            # Build prompt with context
            full_prompt = f"""
{company_data}

{step_prompt}
"""

            # Check if streaming is supported for this step
            if step.get('stream', False) and hasattr(self.router, 'stream_chat'):
                # Stream this step
                from ..llm.base import Message, TaskType

                async for event in self.stream_handler.stream_response(
                    self.router.stream_chat([Message(role='user', content=full_prompt)])
                ):
                    yield {
                        'type': 'stream',
                        'step': step_name,
                        'data': event.data
                    }
            else:
                # Non-streaming step
                from ..llm.base import TaskType

                response = self.router.route(
                    TaskType.ANALYSIS,
                    prompt=full_prompt,
                    temperature=step.get('temperature', 0.7)
                )

                results[step_name] = response.content

                yield {
                    'type': 'result',
                    'step': step_name,
                    'data': response.content
                }

        self.progress.complete("Analysis complete")

        yield {
            'type': 'complete',
            'data': {
                'results': results,
                'progress': self.progress.to_dict()
            }
        }

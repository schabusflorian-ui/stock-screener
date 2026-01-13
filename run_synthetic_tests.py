#!/usr/bin/env python3
"""
SELF-CONTAINED SYNTHETIC USER TESTER

Run the foillowing user test for me

Setup:
    pip install anthropic aiohttp rich
    export ANTHROPIC_API_KEY=sk-ant-xxxxx
    python run_tests.py

This will:
1. Probe your API to find the right endpoint
2. Run synthetic users against it
3. Generate a comprehensive report
"""

import os
import sys
import json
import asyncio
import aiohttp
import hashlib
import re
from datetime import datetime
from pathlib import Path
from dataclasses import dataclass, field, asdict
from typing import List, Dict, Optional, Any
from enum import Enum

# Check dependencies
try:
    import anthropic
except ImportError:
    print("❌ Missing anthropic. Run: pip install anthropic")
    sys.exit(1)

try:
    from rich.console import Console
    from rich.table import Table
    from rich.panel import Panel
    console = Console()
except ImportError:
    print("⚠️  Missing rich (optional). Run: pip install rich")
    console = None

# =============================================================================
# CONFIGURATION - EDIT THIS FOR YOUR PLATFORM
# =============================================================================

CONFIG = {
    "base_url": "http://localhost:3000",

    # API endpoint - will auto-detect if None
    "api_endpoint": "/api/nl/query",  # e.g., "/api/chat"

    # Request field name - will auto-detect if None
    "message_field": "query",  # e.g., "message" or "query"

    # Response field - will auto-detect if None
    "response_field": "response",  # e.g., "response" or "answer"

    # Auth token (if needed)
    "auth_token": None,

    # Test settings
    "personas_to_test": ["expert_skeptic", "overconfident"],
    "max_prompts_per_persona": 4,
    "timeout_seconds": 45,  # Increased to account for LLM processing

    # Output
    "output_dir": "./synthetic_test_results",
}

# =============================================================================
# PERSONAS
# =============================================================================

PERSONAS = {
    "beginner": {
        "name": "Sarah",
        "description": "28yo marketing manager, no finance background, just started investing",
        "system_context": """You are Sarah, a 28-year-old marketing manager testing an investment platform.
You have NO finance background. You just opened your first brokerage account.
You get confused by financial jargon. You want simple, clear answers.
You're eager but anxious about making mistakes with your money.""",
        "behaviors": ["Plain English", "Confused by jargon", "Wants clear recommendations"],
        "test_prompts": [
            "Hi! I just put $5000 in my account. What should I buy?",
            "My friend says VOO is good. Is that true?",
            "I have Apple, Tesla, and Amazon. Am I diversified?",
            "What's an ETF? Should I get one?",
            "I don't understand this chart. What does it mean?",
            "My portfolio is down 10% this month 😰 What do I do??",
            "What does 'max drawdown' mean? Is -34% bad?",
            "Can you just tell me what to buy?",
        ]
    },
    "overconfident": {
        "name": "Jake",
        "description": "34yo software engineer, thinks he's a trading expert",
        "system_context": """You are Jake, a 34-year-old software engineer testing an investment platform.
You've been trading for 3 years (since COVID). You think you're sophisticated.
You use financial jargon (sometimes incorrectly). You challenge advice you disagree with.
You take concentrated, high-risk positions and get annoyed by conservative recommendations.""",
        "behaviors": ["Uses jargon", "Challenges disagreement", "Takes high risk"],
        "test_prompts": [
            "My portfolio is 80% NVDA and 20% Bitcoin. Analyze it.",
            "Show me Sharpe ratio, Sortino, and alpha.",
            "Your risk analysis is wrong. NVDA isn't risky.",
            "What's the best options strategy for earnings?",
            "I backtested this at 40% annual returns. Validate it.",
            "I want to lever up 3x on semiconductors. Best way?",
            "Why is ruin probability so high? My strategy never loses.",
            "Your Buffett analysis is useless. Show me growth picks.",
        ]
    },
    "anxious_retiree": {
        "name": "Margaret",
        "description": "62yo retired teacher, very risk-averse, managing $800K",
        "system_context": """You are Margaret, a 62-year-old retired teacher testing an investment platform.
Your husband passed away 2 years ago. You have $800K in retirement savings.
You are VERY risk-averse. You lived through 2008 and it traumatized you.
You need reassurance. You worry about running out of money.""",
        "behaviors": ["Very risk-averse", "Needs reassurance", "Asks worst-case scenarios"],
        "test_prompts": [
            "I have $800,000 saved. Can I retire safely?",
            "What happens if 2008 happens again?",
            "Is 60/40 safe enough for my age?",
            "Should I just put everything in CDs?",
            "Show me the absolute worst case scenario.",
            "I need $4,000/month. Is that sustainable for 30 years?",
            "What if I live to 95?",
            "I can't sleep worrying about investments. Help?",
        ]
    },
    "expert_skeptic": {
        "name": "David",
        "description": "45yo CFA, portfolio manager, will find methodology flaws",
        "system_context": """You are David, a 45-year-old CFA and portfolio manager testing an investment platform.
You have 20 years in finance. You use Bloomberg daily.
You question every assumption and look for methodology flaws.
You expect professional-grade accuracy and will catch errors.""",
        "behaviors": ["Questions assumptions", "Tests edge cases", "Expects accuracy"],
        "test_prompts": [
            "What's your data source? Update frequency?",
            "Walk me through correlation calculation methodology.",
            "Your Sharpe calculation looks off. Arithmetic or geometric?",
            "You're using normal distribution? That underestimates tails.",
            "What rebalancing assumptions in projections?",
            "I need raw data export. CSV available?",
            "Same inputs gave different results. Is this stochastic?",
            "What's the confidence interval on these projections?",
        ]
    },
    "chaos_monkey": {
        "name": "Chaos Monkey",
        "description": "Edge case tester - finds crashes and security issues",
        "system_context": """You are a QA tester looking for bugs, crashes, and security vulnerabilities.
You're testing how the system handles unexpected inputs.
Note any errors, crashes, or unexpected behaviors.""",
        "behaviors": ["Garbage inputs", "Extreme values", "Injection attempts"],
        "test_prompts": [
            "",  # Empty
            "a",  # Single char
            "A" * 3000,  # Very long
            "AAPL@#$%^&*()",  # Special chars
            "AAPL: -500 shares",  # Negative
            "$999999999999",  # Extreme value
            "'; DROP TABLE users; --",  # SQL injection
            "<script>alert('xss')</script>",  # XSS
            "AAPL 📈🚀 shares: 一百",  # Unicode
            "Analyze XYZNOTREAL",  # Fake ticker
            "null",
            "undefined",
            "NaN",
            "../../../etc/passwd",  # Path traversal
            '{"ticker": "AAPL"}',  # JSON as input
        ]
    }
}

# =============================================================================
# TYPES
# =============================================================================

class Severity(Enum):
    CRITICAL = "critical"
    MAJOR = "major"
    MINOR = "minor"
    INFO = "info"

class Category(Enum):
    BUG = "bug"
    UX = "ux"
    CONTENT = "content"
    MISSING = "missing_feature"
    SECURITY = "security"
    PERFORMANCE = "performance"

@dataclass
class Issue:
    title: str
    description: str
    severity: str
    category: str
    persona: str
    prompt: str
    response_preview: str

@dataclass
class TestResult:
    persona: str
    prompt: str
    response: str
    latency_ms: int
    issues: List[Issue]
    evaluation: Dict
    timestamp: str

# =============================================================================
# API PROBE
# =============================================================================

async def probe_api(base_url: str) -> Dict:
    """Auto-detect API structure"""

    endpoints = ["/api/chat", "/api/message", "/api/analyze", "/chat", "/api/v1/chat", "/api/completion"]
    payloads = [
        {"message": "test"},
        {"query": "test"},
        {"input": "test"},
        {"prompt": "test"},
        {"content": "test"},
        {"messages": [{"role": "user", "content": "test"}]},
    ]

    print(f"🔍 Probing {base_url}...")

    async with aiohttp.ClientSession() as session:
        # Check if server is up
        try:
            async with session.get(base_url, timeout=aiohttp.ClientTimeout(total=3)) as resp:
                print(f"  ✓ Server responding (status {resp.status})")
        except:
            print(f"  ❌ Cannot connect to {base_url}")
            return None

        # Try endpoints
        for endpoint in endpoints:
            for payload in payloads:
                try:
                    url = f"{base_url}{endpoint}"
                    async with session.post(url, json=payload, timeout=aiohttp.ClientTimeout(total=5)) as resp:
                        if resp.status == 200:
                            data = await resp.json()
                            print(f"  ✅ Found: {endpoint} with {list(payload.keys())}")

                            # Detect response field
                            response_field = None
                            if isinstance(data, dict):
                                for key in ["response", "answer", "reply", "content", "text", "message", "result"]:
                                    if key in data:
                                        response_field = key
                                        break
                                if not response_field:
                                    response_field = list(data.keys())[0]

                            return {
                                "endpoint": endpoint,
                                "message_field": list(payload.keys())[0],
                                "response_field": response_field,
                            }
                except:
                    pass

        print("  ❌ No working endpoint found")
        return None

# =============================================================================
# SYNTHETIC USER AGENT
# =============================================================================

class SyntheticUser:
    def __init__(self, persona_id: str, client: anthropic.Anthropic):
        self.persona_id = persona_id
        self.persona = PERSONAS[persona_id]
        self.client = client

    async def evaluate(self, prompt: str, response: str) -> Dict:
        """Have AI evaluate the platform response as this persona"""

        eval_prompt = f"""You are {self.persona['name']}, {self.persona['description']}.

The user sent: "{prompt}"

The platform responded: "{response}"

Evaluate this interaction. Respond with JSON only:
{{
    "reaction": "Your authentic reaction as {self.persona['name']}",
    "understood": true/false,
    "helpful": true/false,
    "issues": [
        {{"type": "bug|ux|content|missing|security|performance", "severity": "critical|major|minor|info", "description": "..."}}
    ],
    "clarity_score": 1-10,
    "helpfulness_score": 1-10,
    "trust_score": 1-10,
    "positive_notes": ["what worked well"],
    "confusion_points": ["what was confusing"]
}}"""

        try:
            result = self.client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=1000,
                system=self.persona['system_context'],
                messages=[{"role": "user", "content": eval_prompt}]
            )

            text = result.content[0].text

            # Extract JSON
            json_match = re.search(r'\{.*\}', text, re.DOTALL)
            if json_match:
                return json.loads(json_match.group())
            return {"error": "No JSON found", "raw": text}

        except Exception as e:
            return {"error": str(e)}

# =============================================================================
# TEST RUNNER
# =============================================================================

class TestRunner:
    def __init__(self, config: Dict):
        self.config = config
        self.base_url = config["base_url"]
        self.results: List[TestResult] = []
        self.anthropic = anthropic.Anthropic()

    async def setup(self):
        """Auto-detect API if not configured"""
        if not self.config.get("api_endpoint"):
            detected = await probe_api(self.base_url)
            if detected:
                self.config["api_endpoint"] = detected["endpoint"]
                self.config["message_field"] = detected["message_field"]
                self.config["response_field"] = detected["response_field"]
                print(f"  Using: {detected}")
            else:
                print("\n⚠️  Could not auto-detect API. Please configure manually:")
                print('  CONFIG["api_endpoint"] = "/api/chat"')
                print('  CONFIG["message_field"] = "message"')
                print('  CONFIG["response_field"] = "response"')
                return False
        return True

    async def send_to_platform(self, message: str) -> tuple[str, int]:
        """Send message to platform and get response"""

        url = f"{self.base_url}{self.config['api_endpoint']}"
        payload = {self.config["message_field"]: message}

        headers = {"Content-Type": "application/json"}
        if self.config.get("auth_token"):
            headers["Authorization"] = f"Bearer {self.config['auth_token']}"

        start = datetime.now()

        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    url,
                    json=payload,
                    headers=headers,
                    timeout=aiohttp.ClientTimeout(total=self.config["timeout_seconds"])
                ) as resp:
                    latency = int((datetime.now() - start).total_seconds() * 1000)

                    if resp.status != 200:
                        text = await resp.text()
                        return f"[ERROR {resp.status}]: {text[:300]}", latency

                    data = await resp.json()

                    # Extract response
                    response_field = self.config["response_field"]
                    if response_field and isinstance(data, dict):
                        response = data.get(response_field, str(data))
                    else:
                        response = str(data)

                    return response, latency

        except asyncio.TimeoutError:
            return "[TIMEOUT]", self.config["timeout_seconds"] * 1000
        except Exception as e:
            return f"[ERROR]: {e}", 0

    async def run_persona(self, persona_id: str) -> List[TestResult]:
        """Run all tests for a persona"""

        persona = PERSONAS[persona_id]
        agent = SyntheticUser(persona_id, self.anthropic)
        results = []

        prompts = persona["test_prompts"][:self.config["max_prompts_per_persona"]]

        print(f"\n{'='*60}")
        print(f"🧪 Testing as: {persona['name']} ({persona_id})")
        print(f"   {persona['description']}")
        print(f"{'='*60}")

        for i, prompt in enumerate(prompts):
            prompt_preview = prompt[:50] + "..." if len(prompt) > 50 else prompt
            print(f"\n  [{i+1}/{len(prompts)}] {prompt_preview}")

            # Send to platform
            response, latency = await self.send_to_platform(prompt)
            print(f"      ⏱️  {latency}ms")

            # Check for errors
            is_error = response.startswith("[ERROR") or response.startswith("[TIMEOUT")
            if is_error:
                print(f"      ❌ {response[:60]}")
            else:
                print(f"      ✓ Got response ({len(response)} chars)")

            # Have AI evaluate
            evaluation = await agent.evaluate(prompt, response)

            # Extract issues
            issues = []
            for issue_data in evaluation.get("issues", []):
                issue = Issue(
                    title=issue_data.get("description", "")[:100],
                    description=issue_data.get("description", ""),
                    severity=issue_data.get("severity", "info"),
                    category=issue_data.get("type", "ux"),
                    persona=persona_id,
                    prompt=prompt[:200],
                    response_preview=response[:200]
                )
                issues.append(issue)

                # Print issues
                severity_icon = {"critical": "🔴", "major": "🟠", "minor": "🟡", "info": "⚪"}.get(issue.severity, "⚪")
                print(f"      {severity_icon} [{issue.severity}] {issue.title[:50]}")

            result = TestResult(
                persona=persona_id,
                prompt=prompt,
                response=response,
                latency_ms=latency,
                issues=issues,
                evaluation=evaluation,
                timestamp=datetime.now().isoformat()
            )
            results.append(result)
            self.results.append(result)

            # Small delay
            await asyncio.sleep(0.5)

        return results

    async def run_all(self):
        """Run tests for all configured personas"""

        print("\n" + "="*60)
        print("🚀 SYNTHETIC USER TESTING")
        print(f"   Platform: {self.base_url}")
        print(f"   Personas: {', '.join(self.config['personas_to_test'])}")
        print("="*60)

        # Setup
        if not await self.setup():
            return

        # Run each persona
        for persona_id in self.config["personas_to_test"]:
            if persona_id in PERSONAS:
                await self.run_persona(persona_id)
            else:
                print(f"⚠️  Unknown persona: {persona_id}")

        # Generate report
        self.generate_report()

    def generate_report(self):
        """Generate test report"""

        output_dir = Path(self.config["output_dir"])
        output_dir.mkdir(parents=True, exist_ok=True)

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

        # Collect all issues
        all_issues = []
        for r in self.results:
            all_issues.extend(r.issues)

        # Count by severity
        severity_counts = {"critical": 0, "major": 0, "minor": 0, "info": 0}
        for issue in all_issues:
            severity_counts[issue.severity] = severity_counts.get(issue.severity, 0) + 1

        # Generate markdown report
        report = f"""# SYNTHETIC USER TEST REPORT
Generated: {datetime.now().isoformat()}
Platform: {self.base_url}

## SUMMARY

| Metric | Value |
|--------|-------|
| Total Tests | {len(self.results)} |
| Total Issues | {len(all_issues)} |
| 🔴 Critical | {severity_counts['critical']} |
| 🟠 Major | {severity_counts['major']} |
| 🟡 Minor | {severity_counts['minor']} |
| Avg Latency | {sum(r.latency_ms for r in self.results) // max(len(self.results), 1)}ms |

## CRITICAL ISSUES

"""
        critical = [i for i in all_issues if i.severity == "critical"]
        if critical:
            for issue in critical:
                report += f"""### {issue.title}
- **Persona:** {issue.persona}
- **Category:** {issue.category}
- **Prompt:** `{issue.prompt[:100]}`
- **Description:** {issue.description}

"""
        else:
            report += "_No critical issues found._\n\n"

        report += "## MAJOR ISSUES\n\n"
        major = [i for i in all_issues if i.severity == "major"]
        if major:
            for issue in major[:10]:
                report += f"- **[{issue.persona}]** {issue.title}\n"
        else:
            report += "_No major issues found._\n\n"

        report += "\n## ALL TEST RESULTS\n\n"
        for r in self.results:
            status = "❌" if r.response.startswith("[ERROR") else "✓"
            report += f"- {status} **{r.persona}**: `{r.prompt[:40]}...` ({r.latency_ms}ms, {len(r.issues)} issues)\n"

        # Save report
        report_file = output_dir / f"TEST_REPORT_{timestamp}.md"
        with open(report_file, "w") as f:
            f.write(report)

        # Save JSON
        json_file = output_dir / f"results_{timestamp}.json"
        with open(json_file, "w") as f:
            json.dump({
                "timestamp": timestamp,
                "config": self.config,
                "results": [asdict(r) for r in self.results],
                "summary": {
                    "total_tests": len(self.results),
                    "total_issues": len(all_issues),
                    "severity_counts": severity_counts
                }
            }, f, indent=2, default=str)

        # Print summary
        print("\n" + "="*60)
        print("📊 TEST COMPLETE")
        print("="*60)
        print(f"  Total tests: {len(self.results)}")
        print(f"  Total issues: {len(all_issues)}")
        print(f"    🔴 Critical: {severity_counts['critical']}")
        print(f"    🟠 Major: {severity_counts['major']}")
        print(f"    🟡 Minor: {severity_counts['minor']}")
        print(f"\n  📄 Report: {report_file}")
        print(f"  📦 Data: {json_file}")

# =============================================================================
# MAIN
# =============================================================================

async def main():
    # Check API key
    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("❌ Set ANTHROPIC_API_KEY environment variable")
        print("   export ANTHROPIC_API_KEY=sk-ant-xxxxx")
        sys.exit(1)

    runner = TestRunner(CONFIG)
    await runner.run_all()

if __name__ == "__main__":
    asyncio.run(main())

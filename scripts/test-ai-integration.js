#!/usr/bin/env node
/**
 * Test script for AI services integration.
 *
 * Tests:
 * 1. Python CLI runner status
 * 2. Analyst service
 * 3. AI routes
 */

const { spawn } = require('child_process');
const path = require('path');
const http = require('http');

const PROJECT_ROOT = path.join(__dirname, '..');

// Colors for output
const colors = {
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    reset: '\x1b[0m'
};

function log(color, message) {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

/**
 * Call Python CLI runner
 */
async function callPython(command, args = {}) {
    return new Promise((resolve, reject) => {
        const scriptPath = path.join(PROJECT_ROOT, 'src/services/ai/cli_runner.py');
        const proc = spawn('python3', [scriptPath, command, JSON.stringify(args)]);

        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        proc.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        proc.on('close', (code) => {
            if (code === 0) {
                try {
                    resolve(JSON.parse(stdout));
                } catch (e) {
                    resolve({ result: stdout });
                }
            } else {
                reject(new Error(stderr || stdout || `Exit code ${code}`));
            }
        });
    });
}

/**
 * Make HTTP request to API
 */
async function apiRequest(method, path, body = null) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: 3000,
            path,
            method,
            headers: {
                'Content-Type': 'application/json'
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, data: JSON.parse(data) });
                } catch (e) {
                    resolve({ status: res.statusCode, data });
                }
            });
        });

        req.on('error', reject);

        if (body) {
            req.write(JSON.stringify(body));
        }
        req.end();
    });
}

async function testPythonStatus() {
    log('blue', '\n=== Testing Python CLI Runner ===\n');

    try {
        const result = await callPython('status');
        log('green', '✓ Python CLI runner working');
        console.log('  Status:', JSON.stringify(result, null, 2));
        return true;
    } catch (e) {
        log('red', '✗ Python CLI runner failed');
        console.log('  Error:', e.message);
        return false;
    }
}

async function testAnalystList() {
    log('blue', '\n=== Testing Analyst Service ===\n');

    try {
        const result = await callPython('analyst:list');
        if (result.analysts && result.analysts.length > 0) {
            log('green', `✓ Analyst list working (${result.analysts.length} analysts)`);
            result.analysts.forEach(a => {
                console.log(`  - ${a.name || a.id}: ${a.style || a.title}`);
            });
            return true;
        } else {
            log('yellow', '⚠ Analyst list returned empty');
            return false;
        }
    } catch (e) {
        log('red', '✗ Analyst list failed');
        console.log('  Error:', e.message);
        return false;
    }
}

async function testAnalystGet() {
    try {
        const result = await callPython('analyst:get', { analyst_id: 'value' });
        if (result.analyst) {
            log('green', '✓ Get analyst working');
            console.log(`  - ${result.analyst.name}: ${result.analyst.description?.substring(0, 50)}...`);
            return true;
        } else {
            log('yellow', '⚠ Get analyst returned empty');
            return false;
        }
    } catch (e) {
        log('red', '✗ Get analyst failed');
        console.log('  Error:', e.message);
        return false;
    }
}

async function testAnalystConversation() {
    try {
        // Create conversation
        const createResult = await callPython('analyst:create_conversation', {
            analyst_id: 'value',
            company_symbol: 'AAPL'
        });

        if (!createResult.conversation) {
            log('yellow', '⚠ Create conversation returned empty');
            return false;
        }

        log('green', `✓ Created conversation: ${createResult.conversation.id}`);

        // Note: Chat requires LLM, so skip in basic test
        log('blue', '  (Skipping chat test - requires LLM backend)');

        return true;
    } catch (e) {
        log('red', '✗ Conversation test failed');
        console.log('  Error:', e.message);
        return false;
    }
}

async function testAPIEndpoints() {
    log('blue', '\n=== Testing API Endpoints ===\n');

    try {
        // Test health
        const health = await apiRequest('GET', '/api/health');
        if (health.status === 200) {
            log('green', '✓ API server is running');
        } else {
            log('red', '✗ API server not responding correctly');
            return false;
        }

        // Test AI status
        const aiStatus = await apiRequest('GET', '/api/ai/status');
        if (aiStatus.status === 200) {
            log('green', '✓ AI status endpoint working');
            console.log('  Status:', JSON.stringify(aiStatus.data, null, 2));
        } else {
            log('yellow', '⚠ AI status endpoint returned error');
        }

        // Test analyst personas
        const personas = await apiRequest('GET', '/api/analyst/personas');
        if (personas.status === 200 && personas.data.analysts) {
            log('green', `✓ Analyst personas endpoint working (${personas.data.analysts.length} analysts)`);
        } else {
            log('yellow', '⚠ Analyst personas endpoint issue');
        }

        return true;
    } catch (e) {
        log('red', '✗ API test failed');
        console.log('  Error:', e.message);
        console.log('  (Is the API server running on port 3000?)');
        return false;
    }
}

async function main() {
    log('blue', '╔═══════════════════════════════════════════╗');
    log('blue', '║     AI Services Integration Test          ║');
    log('blue', '╚═══════════════════════════════════════════╝');

    const results = {
        pythonStatus: false,
        analystList: false,
        analystGet: false,
        analystConversation: false,
        apiEndpoints: false
    };

    // Test Python CLI
    results.pythonStatus = await testPythonStatus();

    if (results.pythonStatus) {
        // Test analyst service
        results.analystList = await testAnalystList();
        results.analystGet = await testAnalystGet();
        results.analystConversation = await testAnalystConversation();
    }

    // Test API endpoints (separate from Python tests)
    results.apiEndpoints = await testAPIEndpoints();

    // Summary
    log('blue', '\n=== Summary ===\n');
    const passed = Object.values(results).filter(r => r).length;
    const total = Object.keys(results).length;

    Object.entries(results).forEach(([test, passed]) => {
        const icon = passed ? '✓' : '✗';
        const color = passed ? 'green' : 'red';
        log(color, `  ${icon} ${test}`);
    });

    console.log();
    if (passed === total) {
        log('green', `All ${total} tests passed!`);
    } else {
        log('yellow', `${passed}/${total} tests passed`);
    }

    // Check environment
    log('blue', '\n=== Environment ===\n');
    console.log(`  ANTHROPIC_API_KEY: ${process.env.ANTHROPIC_API_KEY ? 'Set' : 'Not set'}`);
    console.log(`  OLLAMA_URL: ${process.env.OLLAMA_URL || 'Not set (default: localhost:11434)'}`);
    console.log(`  AI_ENABLED: ${!!(process.env.ANTHROPIC_API_KEY || process.env.OLLAMA_URL)}`);
}

main().catch(console.error);

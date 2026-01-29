// tests/lib/http2Server.test.js
// Tests for HTTP/2 server with spdy support

const fs = require('fs');
const path = require('path');

describe('HTTP/2 Server Module', () => {
  test('http2Server.js should exist', () => {
    const filePath = path.join(__dirname, '../../src/lib/http2Server.js');
    expect(fs.existsSync(filePath)).toBe(true);
  });

  test('should export createServer function', () => {
    const { createServer } = require('../../src/lib/http2Server');
    expect(createServer).toBeDefined();
    expect(typeof createServer).toBe('function');
  });

  test('should export createHttp1Server function', () => {
    const { createHttp1Server } = require('../../src/lib/http2Server');
    expect(createHttp1Server).toBeDefined();
    expect(typeof createHttp1Server).toBe('function');
  });

  test('should export createHttp2Server function', () => {
    const { createHttp2Server } = require('../../src/lib/http2Server');
    expect(createHttp2Server).toBeDefined();
    expect(typeof createHttp2Server).toBe('function');
  });

  test('should export getServerInfo function', () => {
    const { getServerInfo } = require('../../src/lib/http2Server');
    expect(getServerInfo).toBeDefined();
    expect(typeof getServerInfo).toBe('function');
  });

  test('should export http2InfoMiddleware function', () => {
    const { http2InfoMiddleware } = require('../../src/lib/http2Server');
    expect(http2InfoMiddleware).toBeDefined();
    expect(typeof http2InfoMiddleware).toBe('function');
  });

  test('should export pushResource function', () => {
    const { pushResource } = require('../../src/lib/http2Server');
    expect(pushResource).toBeDefined();
    expect(typeof pushResource).toBe('function');
  });

  test('should export generateDevCertificates function', () => {
    const { generateDevCertificates } = require('../../src/lib/http2Server');
    expect(generateDevCertificates).toBeDefined();
    expect(typeof generateDevCertificates).toBe('function');
  });
});

describe('createHttp1Server', () => {
  test('should create HTTP/1.1 server from express app', () => {
    const express = require('express');
    const { createHttp1Server } = require('../../src/lib/http2Server');

    const app = express();
    const server = createHttp1Server(app);

    expect(server).toBeDefined();
    expect(server.protocol).toBe('HTTP/1.1');

    // Clean up
    server.close();
  });
});

describe('createServer (fallback behavior)', () => {
  test('should create HTTP/1.1 server when no SSL certs provided', () => {
    const express = require('express');
    const { createServer } = require('../../src/lib/http2Server');

    const app = express();
    const server = createServer(app, {
      keyPath: null,
      certPath: null,
    });

    expect(server).toBeDefined();
    expect(server.protocol).toBe('HTTP/1.1');

    // Clean up
    server.close();
  });

  test('should create HTTP/1.1 server when forceHttp1 is true', () => {
    const express = require('express');
    const { createServer } = require('../../src/lib/http2Server');

    const app = express();
    const server = createServer(app, {
      forceHttp1: true,
    });

    expect(server).toBeDefined();
    expect(server.protocol).toBe('HTTP/1.1');

    // Clean up
    server.close();
  });

  test('should create HTTP/1.1 server when SSL files do not exist', () => {
    const express = require('express');
    const { createServer } = require('../../src/lib/http2Server');

    const app = express();
    const server = createServer(app, {
      keyPath: '/nonexistent/server.key',
      certPath: '/nonexistent/server.crt',
    });

    expect(server).toBeDefined();
    expect(server.protocol).toBe('HTTP/1.1');

    // Clean up
    server.close();
  });
});

describe('getServerInfo', () => {
  test('should return server info object', () => {
    const express = require('express');
    const { createHttp1Server, getServerInfo } = require('../../src/lib/http2Server');

    const app = express();
    const server = createHttp1Server(app);

    const info = getServerInfo(server);

    expect(info).toHaveProperty('protocol', 'HTTP/1.1');
    expect(info).toHaveProperty('listening');
    expect(info).toHaveProperty('address');

    // Clean up
    server.close();
  });
});

describe('http2InfoMiddleware', () => {
  test('should add isHttp2 property to request', () => {
    const { http2InfoMiddleware } = require('../../src/lib/http2Server');

    const req = {
      httpVersion: '1.1',
      httpVersionMajor: 1,
    };
    const res = {
      setHeader: jest.fn(),
    };
    const next = jest.fn();

    http2InfoMiddleware(req, res, next);

    expect(req.isHttp2).toBe(false);
    expect(req.canPush).toBe(false);
    expect(res.setHeader).toHaveBeenCalledWith('X-Protocol', 'HTTP/1.1');
    expect(next).toHaveBeenCalled();
  });

  test('should detect HTTP/2 connections', () => {
    const { http2InfoMiddleware } = require('../../src/lib/http2Server');

    const req = {
      httpVersion: '2.0',
      httpVersionMajor: 2,
    };
    const res = {
      setHeader: jest.fn(),
      push: jest.fn(), // HTTP/2 push capability
    };
    const next = jest.fn();

    http2InfoMiddleware(req, res, next);

    expect(req.isHttp2).toBe(true);
    expect(req.canPush).toBe(true);
    expect(res.setHeader).toHaveBeenCalledWith('X-Protocol', 'HTTP/2');
    expect(next).toHaveBeenCalled();
  });
});

describe('pushResource', () => {
  test('should return false when res.push is not available', () => {
    const { pushResource } = require('../../src/lib/http2Server');

    const res = {};
    const result = pushResource(res, '/static/main.js', 'application/javascript');

    expect(result).toBe(false);
  });

  test('should call res.push when available', () => {
    const { pushResource } = require('../../src/lib/http2Server');

    const mockStream = {
      on: jest.fn(),
    };
    const res = {
      push: jest.fn().mockReturnValue(mockStream),
    };

    const result = pushResource(res, '/static/main.js', 'application/javascript');

    expect(result).toBe(true);
    expect(res.push).toHaveBeenCalledWith('/static/main.js', expect.objectContaining({
      status: 200,
      method: 'GET',
    }));
    expect(mockStream.on).toHaveBeenCalledWith('error', expect.any(Function));
  });

  test('should handle push errors gracefully', () => {
    const { pushResource } = require('../../src/lib/http2Server');

    const res = {
      push: jest.fn().mockImplementation(() => {
        throw new Error('Push failed');
      }),
    };

    const result = pushResource(res, '/static/main.js', 'application/javascript');

    expect(result).toBe(false);
  });
});

describe('Server.js Integration', () => {
  test('server.js should import http2Server module', () => {
    const serverPath = path.join(__dirname, '../../src/api/server.js');
    const serverCode = fs.readFileSync(serverPath, 'utf8');

    expect(serverCode).toContain("require('../lib/http2Server')");
    expect(serverCode).toContain('createServer');
    expect(serverCode).toContain('http2InfoMiddleware');
  });

  test('server.js should use createServer for server creation', () => {
    const serverPath = path.join(__dirname, '../../src/api/server.js');
    const serverCode = fs.readFileSync(serverPath, 'utf8');

    expect(serverCode).toContain('const server = createServer(app)');
  });

  test('server.js should use getServerInfo for logging', () => {
    const serverPath = path.join(__dirname, '../../src/api/server.js');
    const serverCode = fs.readFileSync(serverPath, 'utf8');

    expect(serverCode).toContain('getServerInfo');
    expect(serverCode).toContain('serverInfo.protocol');
  });

  test('server.js should apply http2InfoMiddleware', () => {
    const serverPath = path.join(__dirname, '../../src/api/server.js');
    const serverCode = fs.readFileSync(serverPath, 'utf8');

    expect(serverCode).toContain('app.use(http2InfoMiddleware)');
  });
});

describe('Package.json spdy dependency', () => {
  test('package.json should include spdy as optional dependency', () => {
    const packagePath = path.join(__dirname, '../../package.json');
    const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

    expect(packageJson.optionalDependencies).toBeDefined();
    expect(packageJson.optionalDependencies.spdy).toBeDefined();
  });
});

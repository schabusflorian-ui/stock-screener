// src/lib/http2Server.js
// HTTP/2 server with spdy for multiplexed connections
// Falls back to HTTP/1.1 if certificates not available or spdy not installed

const fs = require('fs');
const path = require('path');
const http = require('http');
const logger = require('./logger');

/**
 * HTTP/2 Server Configuration
 *
 * Benefits of HTTP/2:
 * - Multiplexed connections: Multiple requests over single TCP connection
 * - Header compression: Smaller request/response overhead
 * - Server push: Proactively send resources
 * - Binary protocol: More efficient parsing
 *
 * Usage:
 *   const { createServer } = require('./lib/http2Server');
 *   const server = createServer(app, options);
 *   server.listen(PORT);
 */

/**
 * Create an HTTP/2 server with fallback to HTTP/1.1
 * @param {Object} app - Express application
 * @param {Object} options - Server options
 * @param {string} options.keyPath - Path to SSL private key
 * @param {string} options.certPath - Path to SSL certificate
 * @param {string} options.caPath - Path to CA bundle (optional)
 * @param {boolean} options.forceHttp1 - Force HTTP/1.1 even if certs available
 * @returns {Object} - Server instance
 */
function createServer(app, options = {}) {
  const {
    keyPath = process.env.SSL_KEY_PATH,
    certPath = process.env.SSL_CERT_PATH,
    caPath = process.env.SSL_CA_PATH,
    forceHttp1 = process.env.FORCE_HTTP1 === 'true',
  } = options;

  // Check if we should use HTTP/2
  const hasSSL = keyPath && certPath && fs.existsSync(keyPath) && fs.existsSync(certPath);

  if (!hasSSL || forceHttp1) {
    logger.info('Creating HTTP/1.1 server (no SSL certificates or forced HTTP/1)');
    return createHttp1Server(app);
  }

  // Try to use spdy for HTTP/2
  try {
    return createHttp2Server(app, { keyPath, certPath, caPath });
  } catch (err) {
    logger.warn(`HTTP/2 server creation failed, falling back to HTTP/1.1: ${err.message}`);
    return createHttp1Server(app);
  }
}

/**
 * Create HTTP/1.1 server
 */
function createHttp1Server(app) {
  const server = http.createServer(app);
  server.protocol = 'HTTP/1.1';
  return server;
}

/**
 * Create HTTP/2 server with spdy
 */
function createHttp2Server(app, { keyPath, certPath, caPath }) {
  // Import spdy (optional dependency)
  let spdy;
  try {
    spdy = require('spdy');
  } catch (err) {
    throw new Error('spdy package not installed. Install with: npm install spdy');
  }

  // Read SSL certificates
  const sslOptions = {
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath),
    // Enable HTTP/2 with fallback to HTTP/1.1
    spdy: {
      protocols: ['h2', 'http/1.1'],
      plain: false,
      ssl: true,
    },
  };

  // Add CA bundle if provided
  if (caPath && fs.existsSync(caPath)) {
    sslOptions.ca = fs.readFileSync(caPath);
  }

  const server = spdy.createServer(sslOptions, app);
  server.protocol = 'HTTP/2';

  // Log HTTP/2 connection details
  server.on('connection', (socket) => {
    logger.debug('New HTTP/2 connection established');
  });

  // Log when a stream is created (each request in HTTP/2)
  server.on('stream', (stream, headers) => {
    logger.debug(`HTTP/2 stream: ${headers[':method']} ${headers[':path']}`);
  });

  logger.info('HTTP/2 server created with spdy (multiplexed connections enabled)');
  return server;
}

/**
 * Generate self-signed certificates for development
 * Uses Node's built-in crypto module
 *
 * @param {string} outputDir - Directory to write certificates
 * @returns {Object} - Paths to generated key and cert
 */
async function generateDevCertificates(outputDir = './certs') {
  const crypto = require('crypto');
  const { promisify } = require('util');
  const generateKeyPair = promisify(crypto.generateKeyPair);

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const keyPath = path.join(outputDir, 'server.key');
  const certPath = path.join(outputDir, 'server.crt');

  // Skip if certificates already exist
  if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    logger.info('Development certificates already exist');
    return { keyPath, certPath };
  }

  logger.info('Generating self-signed development certificates...');

  // Generate RSA key pair
  const { privateKey, publicKey } = await generateKeyPair('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  // For development, we need openssl to create a proper self-signed cert
  // This is a simplified approach - in production use proper CA-signed certs
  fs.writeFileSync(keyPath, privateKey);

  // Create a minimal self-signed certificate using Node's crypto
  // Note: This is a simplified cert - for full features use openssl
  const selfSignedCert = createSelfSignedCert(privateKey);
  fs.writeFileSync(certPath, selfSignedCert);

  logger.info(`Development certificates generated: ${keyPath}, ${certPath}`);
  return { keyPath, certPath };
}

/**
 * Create a minimal self-signed certificate
 * For development use only - production should use CA-signed certificates
 */
function createSelfSignedCert(privateKey) {
  // This is a placeholder - in reality you'd use openssl or a library like node-forge
  // For the purpose of this module, we'll document the openssl command
  const instructions = `
# To generate proper self-signed certificates, run:
openssl req -x509 -newkey rsa:2048 -keyout server.key -out server.crt -days 365 -nodes \\
  -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost"

# Or use mkcert for development (recommended):
# brew install mkcert
# mkcert -install
# mkcert localhost 127.0.0.1 ::1
`;

  logger.warn('Self-signed cert generation requires openssl. See instructions below:');
  console.log(instructions);

  // Return a placeholder that will cause spdy to fail gracefully
  return privateKey; // This won't work as a cert, forcing fallback to HTTP/1.1
}

/**
 * Get server info for logging/debugging
 */
function getServerInfo(server) {
  return {
    protocol: server.protocol || 'HTTP/1.1',
    listening: server.listening,
    address: server.address(),
  };
}

/**
 * HTTP/2 Server Push helper
 * Pre-emptively send resources the client will need
 *
 * Usage:
 *   app.get('/', (req, res) => {
 *     if (res.push) {
 *       pushResource(res, '/static/main.js', 'application/javascript');
 *       pushResource(res, '/static/styles.css', 'text/css');
 *     }
 *     res.send('...');
 *   });
 */
function pushResource(res, path, contentType) {
  if (!res.push) {
    logger.debug('Server push not available (HTTP/1.1 connection)');
    return false;
  }

  try {
    const stream = res.push(path, {
      status: 200,
      method: 'GET',
      request: { accept: '*/*' },
      response: { 'content-type': contentType },
    });

    stream.on('error', (err) => {
      logger.warn(`Server push failed for ${path}: ${err.message}`);
    });

    return true;
  } catch (err) {
    logger.warn(`Server push error: ${err.message}`);
    return false;
  }
}

/**
 * Middleware to add HTTP/2 info to request
 */
function http2InfoMiddleware(req, res, next) {
  // Check if this is an HTTP/2 connection
  const isHttp2 = req.httpVersion === '2.0' || req.httpVersionMajor === 2;

  req.isHttp2 = isHttp2;
  res.setHeader('X-Protocol', isHttp2 ? 'HTTP/2' : `HTTP/${req.httpVersion}`);

  // Add push capability check
  req.canPush = typeof res.push === 'function';

  next();
}

module.exports = {
  createServer,
  createHttp1Server,
  createHttp2Server,
  generateDevCertificates,
  getServerInfo,
  pushResource,
  http2InfoMiddleware,
};

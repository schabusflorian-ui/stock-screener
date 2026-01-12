// src/middleware/apiOptimization.js
// API response optimization middleware

const crypto = require('crypto');

/**
 * ETag middleware for conditional requests
 * Generates ETag from response body and handles If-None-Match
 */
function etagMiddleware(req, res, next) {
  const originalJson = res.json.bind(res);

  res.json = function(data) {
    // Skip ETag for errors or non-GET requests
    if (res.statusCode >= 400 || req.method !== 'GET') {
      return originalJson(data);
    }

    // Generate ETag from response body
    const body = JSON.stringify(data);
    const etag = '"' + crypto.createHash('md5').update(body).digest('hex') + '"';

    res.setHeader('ETag', etag);

    // Check If-None-Match header
    const clientEtag = req.headers['if-none-match'];
    if (clientEtag === etag) {
      return res.status(304).end();
    }

    // Set cache headers
    res.setHeader('Cache-Control', 'private, must-revalidate');

    return originalJson(data);
  };

  next();
}

/**
 * Field selection middleware
 * Allows clients to request specific fields: ?fields=id,name,price
 */
function fieldSelectionMiddleware(req, res, next) {
  const fieldsParam = req.query.fields;

  if (fieldsParam) {
    req.selectedFields = fieldsParam
      .split(',')
      .map(f => f.trim())
      .filter(f => f.length > 0);
  }

  // Wrap res.json to apply field selection
  const originalJson = res.json.bind(res);

  res.json = function(data) {
    if (!req.selectedFields || req.selectedFields.length === 0) {
      return originalJson(data);
    }

    const filtered = applyFieldSelection(data, req.selectedFields);
    return originalJson(filtered);
  };

  next();
}

/**
 * Apply field selection to data
 */
function applyFieldSelection(data, fields) {
  if (!fields || fields.length === 0) return data;

  // Handle array of objects
  if (Array.isArray(data)) {
    return data.map(item => pickFields(item, fields));
  }

  // Handle single object
  if (typeof data === 'object' && data !== null) {
    // Check if it's a response wrapper like { data: [...] }
    if (data.data && Array.isArray(data.data)) {
      return {
        ...data,
        data: data.data.map(item => pickFields(item, fields)),
      };
    }
    return pickFields(data, fields);
  }

  return data;
}

/**
 * Pick specific fields from an object
 */
function pickFields(obj, fields) {
  if (!obj || typeof obj !== 'object') return obj;

  const result = {};
  for (const field of fields) {
    // Support nested fields like "company.name"
    if (field.includes('.')) {
      const [parent, child] = field.split('.');
      if (obj[parent]) {
        result[parent] = result[parent] || {};
        result[parent][child] = obj[parent][child];
      }
    } else if (obj.hasOwnProperty(field)) {
      result[field] = obj[field];
    }
  }
  return result;
}

/**
 * Pagination middleware
 * Standardizes pagination parameters and adds helpers
 */
function paginationMiddleware(req, res, next) {
  // Parse pagination params with defaults
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));
  const offset = (page - 1) * limit;

  req.pagination = {
    page,
    limit,
    offset,
  };

  // Helper to format paginated response
  res.paginate = function(data, total) {
    const totalPages = Math.ceil(total / limit);

    return res.json({
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    });
  };

  next();
}

/**
 * Response time header middleware
 */
function responseTimeMiddleware(req, res, next) {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const end = process.hrtime.bigint();
    const duration = Number(end - start) / 1e6; // Convert to milliseconds
    res.setHeader('X-Response-Time', `${duration.toFixed(2)}ms`);

    // Log slow requests
    if (duration > 1000) {
      console.warn(`[SLOW] ${req.method} ${req.url} - ${duration.toFixed(2)}ms`);
    }
  });

  next();
}

/**
 * Cache control middleware for specific routes
 */
function cacheControl(options = {}) {
  const {
    maxAge = 0,
    private: isPrivate = true,
    noStore = false,
    mustRevalidate = true,
  } = options;

  return (req, res, next) => {
    if (noStore) {
      res.setHeader('Cache-Control', 'no-store');
    } else {
      const directives = [];
      directives.push(isPrivate ? 'private' : 'public');
      directives.push(`max-age=${maxAge}`);
      if (mustRevalidate) directives.push('must-revalidate');
      res.setHeader('Cache-Control', directives.join(', '));
    }
    next();
  };
}

/**
 * Combined optimization middleware
 */
function apiOptimization() {
  return [
    responseTimeMiddleware,
    paginationMiddleware,
    fieldSelectionMiddleware,
    etagMiddleware,
  ];
}

module.exports = {
  etagMiddleware,
  fieldSelectionMiddleware,
  paginationMiddleware,
  responseTimeMiddleware,
  cacheControl,
  apiOptimization,
  applyFieldSelection,
};

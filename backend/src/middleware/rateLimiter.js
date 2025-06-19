const rateLimit = require('express-rate-limit');
const logger = require('../config/logger');

// General rate limiter
const generalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000, // 1 minute
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 10,
  message: {
    error: 'Слишком много запросов с вашего IP. Попробуйте позже.',
    retryAfter: Math.ceil((parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000) / 1000)
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn('Rate limit exceeded', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      path: req.path
    });
    
    res.status(429).json({
      error: 'Слишком много запросов с вашего IP. Попробуйте позже.',
      retryAfter: Math.ceil((parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000) / 1000)
    });
  }
});

// Stricter limiter for sort operations (more resource intensive)
const sortLimiter = rateLimit({
  windowMs: 2 * 60 * 1000, // 2 minutes
  max: 5, // 5 sort operations per 2 minutes
  message: {
    error: 'Слишком много операций сортировки. Подождите немного.',
    retryAfter: 120
  },
  keyGenerator: (req) => {
    // Use IP + user agent for more strict limiting of sort operations
    return `${req.ip}-${req.get('User-Agent')}`;
  },
  handler: (req, res) => {
    logger.warn('Sort rate limit exceeded', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      arraySize: req.body?.numbers?.length || 0
    });
    
    res.status(429).json({
      error: 'Слишком много операций сортировки. Подождите 2 минуты.',
      retryAfter: 120
    });
  }
});

// Lenient limiter for read operations
const readLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 read operations per minute
  message: {
    error: 'Слишком много запросов на чтение. Подождите немного.',
    retryAfter: 60
  }
});

module.exports = {
  generalLimiter,
  sortLimiter,
  readLimiter
};
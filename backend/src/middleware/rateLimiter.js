const rateLimit = require('express-rate-limit');
const logger = require('../config/logger');

const generalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000, 
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

const sortLimiter = rateLimit({
  windowMs: 2 * 60 * 1000, 
  max: 5, 
  message: {
    error: 'Слишком много операций сортировки. Подождите немного.',
    retryAfter: 120
  },
  keyGenerator: (req) => {
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

const readLimiter = rateLimit({
  windowMs: 60 * 1000, 
  max: 30,
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
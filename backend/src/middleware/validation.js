const Joi = require('joi');
const logger = require('../config/logger');

// Validation schemas
const schemas = {
  sortArray: Joi.object({
    numbers: Joi.array()
      .items(
        Joi.number()
          .min(parseInt(process.env.MIN_ARRAY_VALUE) || -10000)
          .max(parseInt(process.env.MAX_ARRAY_VALUE) || 10000)
          .required()
      )
      .min(1)
      .max(parseInt(process.env.MAX_ARRAY_SIZE) || 1000)
      .required()
      .messages({
        'array.min': 'Массив должен содержать хотя бы один элемент',
        'array.max': `Массив не может содержать более ${process.env.MAX_ARRAY_SIZE || 1000} элементов`,
        'any.required': 'Поле numbers обязательно для заполнения'
      })
  }),

  sessionId: Joi.object({
    sessionId: Joi.string()
      .uuid()
      .required()
      .messages({
        'string.guid': 'Некорректный формат ID сессии',
        'any.required': 'ID сессии обязателен'
      })
  }),

  pagination: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    sortBy: Joi.string().valid('createdAt', 'totalSteps', 'sessionId').default('createdAt'),
    sortOrder: Joi.string().valid('ASC', 'DESC').default('DESC')
  })
};

// Validation middleware factory
const validate = (schema, property = 'body') => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[property], {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      const errorMessage = error.details.map(detail => detail.message).join('; ');
      logger.warn('Validation error:', { 
        error: errorMessage, 
        data: req[property],
        ip: req.ip 
      });
      
      return res.status(400).json({
        error: 'Ошибка валидации данных',
        details: error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message
        }))
      });
    }

    // Replace the property with validated and sanitized data
    req[property] = value;
    next();
  };
};

// Custom validation functions
const validateArrayElements = (req, res, next) => {
  const { numbers } = req.body;
  
  // Check for duplicates if needed
  const uniqueNumbers = [...new Set(numbers)];
  if (uniqueNumbers.length !== numbers.length) {
    logger.info('Array contains duplicates', { 
      originalLength: numbers.length, 
      uniqueLength: uniqueNumbers.length 
    });
    // We allow duplicates, just log for analytics
  }

  // Check for extreme values that might cause performance issues
  const hasExtremeValues = numbers.some(num => Math.abs(num) > 1000000);
  if (hasExtremeValues) {
    logger.warn('Array contains extreme values', { numbers: numbers.slice(0, 10) });
  }

  next();
};

module.exports = {
  schemas,
  validate,
  validateArrayElements
};
const logger = require('../config/logger');

// Custom error class
class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

// Async error wrapper
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// Database error handler
const handleDatabaseError = (error) => {
  if (error.name === 'SequelizeConnectionError') {
    return new AppError('Ошибка подключения к базе данных', 503);
  }
  
  if (error.name === 'SequelizeValidationError') {
    const messages = error.errors.map(err => err.message);
    return new AppError(`Ошибка валидации данных: ${messages.join(', ')}`, 400);
  }
  
  if (error.name === 'SequelizeUniqueConstraintError') {
    return new AppError('Данные уже существуют', 409);
  }
  
  if (error.name === 'SequelizeForeignKeyConstraintError') {
    return new AppError('Нарушение целостности данных', 400);
  }
  
  return new AppError('Ошибка базы данных', 500);
};

// Main error handling middleware
const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  // Log error
  logger.error('Error occurred:', {
    message: error.message,
    stack: error.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });

  // Database errors
  if (err.name && err.name.startsWith('Sequelize')) {
    error = handleDatabaseError(err);
  }

  // Validation errors (from Joi)
  if (err.isJoi) {
    const message = err.details.map(detail => detail.message).join('. ');
    error = new AppError(message, 400);
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    error = new AppError('Неверный токен', 401);
  }

  if (err.name === 'TokenExpiredError') {
    error = new AppError('Токен истек', 401);
  }

  // Default to 500 server error
  if (!error.statusCode) {
    error.statusCode = 500;
    error.message = 'Внутренняя ошибка сервера';
  }

  res.status(error.statusCode).json({
    error: error.message,
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
  });
};

// 404 handler
const notFound = (req, res, next) => {
  const error = new AppError(`Маршрут ${req.originalUrl} не найден`, 404);
  next(error);
};

module.exports = {
  AppError,
  asyncHandler,
  errorHandler,
  notFound
};
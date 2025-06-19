require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const path = require('path');
const fs = require('fs');

// Import configurations and middleware
const { sequelize, testConnection } = require('./config/database');
const logger = require('./config/logger');
const { generalLimiter } = require('./middleware/rateLimiter');
const { errorHandler, notFound } = require('./middleware/errorHandler');

// Import routes
const sortRoutes = require('./routes/sort');
const sessionRoutes = require('./routes/sessions');

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const app = express();
const PORT = process.env.PORT || 5050;

// Trust proxy for rate limiting and IP detection
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false, // Allow for development
  crossOriginEmbedderPolicy: false
}));

// CORS configuration
const corsOptions = {
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://yourdomain.com'] // Replace with your production domain
    : ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:8080'],
  credentials: true,
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// Compression middleware
app.use(compression());

// Request parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Custom morgan format for structured logging
morgan.token('id', (req) => req.ip);
const morganFormat = process.env.NODE_ENV === 'production'
  ? 'combined'
  : ':method :url :status :res[content-length] - :response-time ms';

app.use(morgan(morganFormat, {
  stream: {
    write: (message) => logger.info(message.trim())
  }
}));

// Rate limiting
app.use(generalLimiter);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
    version: require('../package.json').version
  });
});

// API info endpoint
app.get('/api/info', (req, res) => {
  res.json({
    name: 'Bubble Sort API',
    version: require('../package.json').version,
    description: 'Secure API for sorting algorithms with step-by-step tracking',
    algorithms: ['bubble', 'quick', 'selection', 'insertion'],
    limits: {
      maxArraySize: parseInt(process.env.MAX_ARRAY_SIZE) || 1000,
      maxArrayValue: parseInt(process.env.MAX_ARRAY_VALUE) || 10000,
      minArrayValue: parseInt(process.env.MIN_ARRAY_VALUE) || -10000,
      rateLimit: {
        general: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 10,
        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000
      }
    },
    endpoints: {
      'POST /api/sort': 'Sort an array with specified algorithm',
      'GET /api/sort/:sessionId': 'Get sorting result by session ID',
      'GET /api/sort/:sessionId/steps': 'Get all sorting steps',
      'GET /api/sort/:sessionId/compare': 'Compare with other algorithms',
      'GET /api/sessions': 'Get all sessions with pagination',
      'GET /api/sessions/stats': 'Get statistics about sessions',
      'DELETE /api/sessions/cleanup': 'Clean up old sessions'
    }
  });
});

// API routes
app.use('/api/sort', sortRoutes);
app.use('/api/sessions', sessionRoutes);

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../frontend')));
  
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
  });
}

// 404 handler
app.use(notFound);

// Error handling middleware
app.use(errorHandler);

// Graceful shutdown handler
const gracefulShutdown = (signal) => {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);
  
  process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Unhandled promise rejection handler
process.on('unhandledRejection', (err) => {
  logger.error('Unhandled Promise Rejection:', err);
  process.exit(1);
});

// Uncaught exception handler
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
  process.exit(1);
});

// Initialize database and start server
const startServer = async () => {
  try {
    // Test database connection
    await testConnection();
    
    // Sync database models
    await sequelize.sync({ alter: process.env.NODE_ENV === 'development' });
    logger.info('Database synchronized successfully');
    
    // Start HTTP server
    const server = app.listen(PORT, () => {
      logger.info(`Server started successfully`, {
        port: PORT,
        environment: process.env.NODE_ENV,
        pid: process.pid
      });
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📊 API documentation available at http://localhost:${PORT}/api/info`);
      console.log(`❤️  Health check available at http://localhost:${PORT}/health`);
    });

    // Handle server shutdown
    process.on('SIGTERM', () => {
      logger.info('SIGTERM received, shutting down gracefully');
      server.close(() => {
        logger.info('Process terminated');
        sequelize.close();
      });
    });

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Start the application
startServer();
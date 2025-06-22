require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const path = require('path');
const fs = require('fs');

const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

let sequelize, testConnection, logger, generalLimiter, errorHandler, notFound;
let sortRoutes, sessionRoutes;

try {
  const dbConfig = require('./config/database');
  sequelize = dbConfig.sequelize;
  testConnection = dbConfig.testConnection;
} catch (error) {
  console.error('Error loading database config:', error.message);
  sequelize = {
    sync: async () => console.log('Mock database sync'),
    close: () => console.log('Mock database close')
  };
  testConnection = async () => console.log('Mock database connection test');
}

try {
  logger = require('./config/logger');
} catch (error) {
  console.error('Error loading logger config:', error.message);
  logger = {
    info: (message, meta) => console.log(`INFO: ${message}`, meta || ''),
    error: (message, meta) => console.error(`ERROR: ${message}`, meta || ''),
    warn: (message, meta) => console.warn(`WARN: ${message}`, meta || '')
  };
}

try {
  const rateLimiter = require('./middleware/rateLimiter');
  generalLimiter = rateLimiter.generalLimiter;
} catch (error) {
  console.error('Error loading rate limiter:', error.message);
  generalLimiter = (req, res, next) => next();
}

try {
  const errorHandlers = require('./middleware/errorHandler');
  errorHandler = errorHandlers.errorHandler;
  notFound = errorHandlers.notFound;
} catch (error) {
  console.error('Error loading error handlers:', error.message);
  notFound = (req, res, next) => {
    res.status(404).json({ error: 'Not Found' });
  };
  errorHandler = (err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  };
}

try {
  sortRoutes = require('./routes/sort');
} catch (error) {
  console.error('Error loading sort routes:', error.message);
  sortRoutes = express.Router();
  sortRoutes.get('/', (req, res) => res.json({ error: 'Sort routes not available' }));
}

try {
  sessionRoutes = require('./routes/sessions');
} catch (error) {
  console.error('Error loading session routes:', error.message);
  sessionRoutes = express.Router();
  sessionRoutes.get('/', (req, res) => res.json({ error: 'Session routes not available' }));
}

const app = express();
const PORT = process.env.PORT || 5050;

app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: false, 
  crossOriginEmbedderPolicy: false
}));

const corsOptions = {
  origin: process.env.NODE_ENV === 'production' 
    ? (process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : ['https://yourdomain.com'])
    : ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:8080'],
  credentials: true,
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

app.use(compression());

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

morgan.token('id', (req) => req.ip);
const morganFormat = process.env.NODE_ENV === 'production'
  ? 'combined'
  : ':method :url :status :res[content-length] - :response-time ms';

app.use(morgan(morganFormat, {
  stream: {
    write: (message) => logger.info(message.trim())
  }
}));

app.use(generalLimiter);

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    version: getPackageVersion()
  });
});

function getPackageVersion() {
  try {
    return require('../package.json').version;
  } catch (error) {
    return '1.0.0';
  }
}

app.get('/api/info', (req, res) => {
  res.json({
    name: 'Bubble Sort API',
    version: getPackageVersion(),
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

app.use('/api/sort', sortRoutes);
app.use('/api/sessions', sessionRoutes);

if (process.env.NODE_ENV === 'production') {
  const frontendPath = path.join(__dirname, '../frontend');
  if (fs.existsSync(frontendPath)) {
    app.use(express.static(frontendPath));
    
    app.get('*', (req, res) => {
      const indexPath = path.join(frontendPath, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).json({ error: 'Frontend not found' });
      }
    });
  }
}

app.use(notFound);

app.use(errorHandler);

const gracefulShutdown = (signal) => {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);
  
  if (sequelize && sequelize.close) {
    sequelize.close();
  }
  
  process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('unhandledRejection', (err) => {
  logger.error('Unhandled Promise Rejection:', err);
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
});

const startServer = async () => {
  try {
    if (testConnection) {
      await testConnection();
    }
    
    if (sequelize && sequelize.sync) {
      await sequelize.sync({ 
        alter: process.env.NODE_ENV === 'development',
        force: false 
      });
      logger.info('Database synchronized successfully');
    }
    
    const server = app.listen(PORT, () => {
      logger.info(`Server started successfully`, {
        port: PORT,
        environment: process.env.NODE_ENV || 'development',
        pid: process.pid
      });
      console.log(`Server running on port ${PORT}`);
      console.log(`API documentation available at http://localhost:${PORT}/api/info`);
      console.log(`Health check available at http://localhost:${PORT}/health`);
    });

    const handleShutdown = () => {
      logger.info('Shutting down gracefully');
      server.close(() => {
        logger.info('HTTP server closed');
        if (sequelize && sequelize.close) {
          sequelize.close();
        }
        process.exit(0);
      });
      
      setTimeout(() => {
        logger.error('Could not close connections in time, forcefully shutting down');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', handleShutdown);
    process.on('SIGINT', handleShutdown);

  } catch (error) {
    logger.error('Failed to start server:', error);
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
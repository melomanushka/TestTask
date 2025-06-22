const express = require('express');
const { Session, AlgorithmPerformance } = require('../models');
const { validate, schemas } = require('../middleware/validation');
const { readLimiter } = require('../middleware/rateLimiter');
const { asyncHandler, AppError } = require('../middleware/errorHandler');
const logger = require('../config/logger');
const { Op } = require('sequelize');

const router = express.Router();

router.get('/',
  readLimiter,
  validate(schemas.pagination, 'query'),
  asyncHandler(async (req, res) => {
    const { page, limit, sortBy, sortOrder } = req.query;

    const sessions = await Session.findWithPagination(page, limit, sortBy, sortOrder);

    res.json({
      sessions: sessions.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: sessions.count,
        pages: Math.ceil(sessions.count / limit)
      }
    });
  })
);

router.get('/stats',
  readLimiter,
  asyncHandler(async (req, res) => {
    const { days = 7 } = req.query;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    const algorithmStats = await Session.findAll({
      attributes: [
        'algorithmType',
        [Session.sequelize.fn('COUNT', '*'), 'count'],
        [Session.sequelize.fn('AVG', Session.sequelize.col('executionTime')), 'avgExecutionTime'],
        [Session.sequelize.fn('AVG', Session.sequelize.col('totalSteps')), 'avgSteps']
      ],
      where: {
        createdAt: {
          [Op.gte]: startDate
        }
      },
      group: ['algorithmType'],
      raw: true
    });

    const dailyStats = await Session.findAll({
      attributes: [
        [Session.sequelize.fn('DATE', Session.sequelize.col('createdAt')), 'date'],
        [Session.sequelize.fn('COUNT', '*'), 'count']
      ],
      where: {
        createdAt: {
          [Op.gte]: startDate
        }
      },
      group: [Session.sequelize.fn('DATE', Session.sequelize.col('createdAt'))],
      order: [[Session.sequelize.fn('DATE', Session.sequelize.col('createdAt')), 'ASC']],
      raw: true
    });

    const arraySizeStats = await Session.findAll({
      attributes: [
        [Session.sequelize.fn('array_length', Session.sequelize.col('originalArray'), 1), 'arraySize'],
        [Session.sequelize.fn('COUNT', '*'), 'count']
      ],
      where: {
        createdAt: {
          [Op.gte]: startDate
        }
      },
      group: [Session.sequelize.fn('array_length', Session.sequelize.col('originalArray'), 1)],
      order: [[Session.sequelize.fn('array_length', Session.sequelize.col('originalArray'), 1), 'ASC']],
      raw: true,
      limit: 20
    });

    const totalSessions = await Session.count({
      where: {
        createdAt: {
          [Op.gte]: startDate
        }
      }
    });

    const performanceStats = await AlgorithmPerformance.findAll({
      attributes: [
        'algorithmType',
        'arraySize',
        [AlgorithmPerformance.sequelize.fn('AVG', AlgorithmPerformance.sequelize.col('executionTime')), 'avgTime'],
        [AlgorithmPerformance.sequelize.fn('AVG', AlgorithmPerformance.sequelize.col('stepCount')), 'avgSteps'],
        [AlgorithmPerformance.sequelize.fn('COUNT', '*'), 'samples']
      ],
      where: {
        createdAt: {
          [Op.gte]: startDate
        }
      },
      group: ['algorithmType', 'arraySize'],
      having: AlgorithmPerformance.sequelize.where(
        AlgorithmPerformance.sequelize.fn('COUNT', '*'),
        Op.gte,
        3
      ),
      order: [['algorithmType', 'ASC'], ['arraySize', 'ASC']],
      raw: true
    });

    res.json({
      period: {
        days: parseInt(days),
        startDate,
        endDate: new Date()
      },
      totalSessions,
      algorithmStats: algorithmStats.map(stat => ({
        algorithm: stat.algorithmType,
        count: parseInt(stat.count),
        avgExecutionTime: Math.round(parseFloat(stat.avgExecutionTime) || 0),
        avgSteps: Math.round(parseFloat(stat.avgSteps) || 0)
      })),
      dailyStats: dailyStats.map(stat => ({
        date: stat.date,
        count: parseInt(stat.count)
      })),
      arraySizeStats: arraySizeStats.map(stat => ({
        arraySize: parseInt(stat.arraySize),
        count: parseInt(stat.count)
      })),
      performanceStats: performanceStats.map(stat => ({
        algorithm: stat.algorithmType,
        arraySize: parseInt(stat.arraySize),
        avgTime: Math.round(parseFloat(stat.avgTime)),
        avgSteps: Math.round(parseFloat(stat.avgSteps)),
        samples: parseInt(stat.samples)
      }))
    });
  })
);

router.delete('/cleanup',
  asyncHandler(async (req, res) => {
    const { hours = 24, dryRun = false } = req.query;
    const hoursOld = parseInt(hours);

    if (dryRun === 'true') {
      const cutoffDate = new Date(Date.now() - hoursOld * 60 * 60 * 1000);
      const count = await Session.count({
        where: {
          createdAt: {
            [Op.lt]: cutoffDate
          }
        }
      });

      res.json({
        dryRun: true,
        cutoffDate,
        sessionsToDelete: count,
        message: `${count} sessions would be deleted (older than ${hoursOld} hours)`
      });
    } else {
      const deletedCount = await Session.cleanupOldSessions(hoursOld);
      
      logger.info('Session cleanup completed', {
        deletedCount,
        hoursOld
      });

      res.json({
        dryRun: false,
        deletedCount,
        hoursOld,
        message: `${deletedCount} old sessions deleted successfully`
      });
    }
  })
);

router.get('/search',
  readLimiter,
  asyncHandler(async (req, res) => {
    const { 
      algorithm, 
      minArraySize, 
      maxArraySize, 
      minSteps, 
      maxSteps,
      minExecutionTime,
      maxExecutionTime,
      page = 1, 
      limit = 20 
    } = req.query;

    const whereConditions = {};
    
    if (algorithm) {
      whereConditions.algorithmType = algorithm.toLowerCase();
    }
    
    if (minSteps || maxSteps) {
      whereConditions.totalSteps = {};
      if (minSteps) whereConditions.totalSteps[Op.gte] = parseInt(minSteps);
      if (maxSteps) whereConditions.totalSteps[Op.lte] = parseInt(maxSteps);
    }
    
    if (minExecutionTime || maxExecutionTime) {
      whereConditions.executionTime = {};
      if (minExecutionTime) whereConditions.executionTime[Op.gte] = parseInt(minExecutionTime);
      if (maxExecutionTime) whereConditions.executionTime[Op.lte] = parseInt(maxExecutionTime);
    }

    let arraySizeCondition = '';
    if (minArraySize || maxArraySize) {
      const conditions = [];
      if (minArraySize) conditions.push(`array_length("originalArray", 1) >= ${parseInt(minArraySize)}`);
      if (maxArraySize) conditions.push(`array_length("originalArray", 1) <= ${parseInt(maxArraySize)}`);
      arraySizeCondition = conditions.join(' AND ');
    }

    const offset = (page - 1) * limit;
    
    const sessions = await Session.findAndCountAll({
      where: {
        ...whereConditions,
        ...(arraySizeCondition && {
          [Op.and]: Session.sequelize.literal(arraySizeCondition)
        })
      },
      attributes: ['sessionId', 'algorithmType', 'totalSteps', 'executionTime', 'createdAt'],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({
      sessions: sessions.rows,
      searchCriteria: {
        algorithm,
        minArraySize,
        maxArraySize,
        minSteps,
        maxSteps,
        minExecutionTime,
        maxExecutionTime
      },
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: sessions.count,
        pages: Math.ceil(sessions.count / limit)
      }
    });
  })
);

router.delete('/:sessionId',
  validate(schemas.sessionId, 'params'),
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;

    const session = await Session.findOne({
      where: { sessionId }
    });

    if (!session) {
      throw new AppError('Сессия не найдена', 404);
    }

    await session.destroy();
    
    logger.info('Session deleted', { sessionId });

    res.json({
      message: 'Сессия успешно удалена',
      sessionId
    });
  })
);

module.exports = router;